import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium, type Browser, type Page } from "playwright-core";
import { guardClick, guardDownload, guardSubmit, guardType, guardTypedText, guardUrl, challengeResult } from "../core/safety.ts";
import { decideRobots, parseRobots, robotsFetchStatusAllowed, type RobotsRule } from "../core/robots.ts";
import { MAX_PAGES_PER_PREFIX, MIN_SITE_DELAY_MS, validateUrl } from "../core/policy.ts";
import type { BrowserEngine, BrowserResult, EvidencePacket, OpenOptions, ReadOptions, ClickOptions, TypeOptions, SubmitOptions, ScreenshotOptions, DownloadOptions, DiscoveryLayer } from "../core/types.ts";

const SOURCE_CLASSIFIER_PATH = "../../deploy/cloudflare-ts/src/sources.ts";
const SOURCE_SAFETY_PATH = "../../deploy/cloudflare-ts/src/source.ts";
const OUTPUT_DIR = join(tmpdir(), "aetherica-browser");
const MAX_REDIRECTS = 10;

async function classify(url: string): Promise<DiscoveryLayer> {
  const shared = await import(SOURCE_CLASSIFIER_PATH);
  return shared.webLayer(shared.canonicalRef(url)) as DiscoveryLayer;
}
async function injectionSignals(text: string, title: string): Promise<string[]> {
  const shared = await import(SOURCE_SAFETY_PATH);
  return shared.injectionSignals(text, title);
}
function prefixKey(url: URL): string {
  return url.origin + "/" + (url.pathname.split("/").filter(Boolean)[0] ?? "");
}
async function checkUrl(raw: string): Promise<{ok:true;url:URL}|{ok:false;reason:string}> {
  const local = validateUrl(raw, { hosted: true });
  if (!local.ok) return local;
  const shared = await import(SOURCE_SAFETY_PATH);
  const result = shared.checkUrl(raw);
  if ("error" in result) return { ok:false, reason:result.error };
  return { ok:true, url:new URL(result.url) };
}
async function safeFetch(raw: string): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const checked = await checkUrl(current);
    if (!checked.ok) throw new Error("Blocked fetch destination: " + checked.reason);
    const response = await fetch(checked.url, { redirect:"manual" });
    if (![301,302,303,307,308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel().catch(()=>{});
    if (!location) throw new Error("Redirect without Location");
    current = new URL(location, current).toString();
  }
  throw new Error("Too many redirects");
}
async function sha256(value: string): Promise<string> {
  return createHash("sha256").update(value).digest("hex");
}
function cleanFilename(value: string): string {
  return value.split(/[\\/]/).pop()!.replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,128) || "download";
}

/**
 * BrowserEngine backed by a provider-issued CDP endpoint.
 * The CDP URL is a bearer capability: never log it, return it, or persist it in evidence.
 */
export class CdpBrowserEngine implements BrowserEngine {
  readonly name = "provider-cdp";
  private readonly cdpUrl: string;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private lastUsed = Date.now();
  private requestedUrl = "";
  private pageCounters = new Map<string,number>();
  private lastRequest = new Map<string,number>();

  constructor(cdpUrl: string) {
    if (!/^wss:\/\//i.test(cdpUrl)) throw new Error("A secure provider-issued CDP endpoint is required.");
    this.cdpUrl = cdpUrl;
  }

  private async connect(): Promise<Page> {
    if (this.browser?.isConnected() && this.page && !this.page.isClosed()) {
      this.lastUsed = Date.now();
      return this.page;
    }
    this.browser = await chromium.connectOverCDP(this.cdpUrl, { timeout:20_000 });
    const contexts = this.browser.contexts();
    const context = contexts[0] ?? await this.browser.newContext({ acceptDownloads:false });
    const pages = context.pages();
    this.page = pages[0] ?? await context.newPage();
    // Inspect every browser-originated HTTP(S) request, not only top-level navigation.
    // Network-level egress filtering is still required to defeat DNS rebinding.
    await this.page.route("**/*", async route => {
      const target = route.request().url();
      if (target.startsWith("http://") || target.startsWith("https://")) {
        const checked = await checkUrl(target);
        if (!checked.ok) { await route.abort("blockedbyclient"); return; }
        await route.continue();
        return;
      }
      if (/^(about:|data:|blob:)/i.test(target)) { await route.continue(); return; }
      await route.abort("blockedbyclient");
    });
    this.lastUsed = Date.now();
    return this.page;
  }

  private async activePage(): Promise<Page> {
    // Provider session expiry is authoritative; local engine disconnection alone must
    // not leave an owner-scoped session handle permanently unusable.
    return this.connect();
  }

  private async enforceCurrentUrl(page: Page): Promise<BrowserResult|null> {
    const current = page.url();
    if (!current || current === "about:blank") return null;
    const checked = await checkUrl(current);
    if (checked.ok) return null;
    await page.goto("about:blank").catch(()=>{});
    return { status:"BLOCKED", message:"Navigation reached a blocked destination and was stopped: " + checked.reason };
  }

  private async evidence(page: Page, requested: string, text: string, title: string): Promise<EvidencePacket> {
    const url = page.url();
    const html = await page.content();
    return {
      requested_url:requested,
      final_url:url,
      redirects:[],
      fetched_at:new Date().toISOString(),
      status:null,
      content_type:null,
      sha256:await sha256(html),
      title,
      layer:await classify(url),
      via_tor:false,
      engine:this.name,
      injection_signals:await injectionSignals(text,title),
      metadata_note:"CDP rendered-DOM evidence; raw HTTP status, response content type and complete redirect chain are not inferred."
    };
  }

  async open(options: OpenOptions): Promise<BrowserResult> {
    const guard = guardUrl(options.url, true);
    if (guard.status !== "OK") return guard;
    const checked = await checkUrl(options.url);
    if (!checked.ok) return {status:"BLOCKED",message:checked.reason};
    const target = checked.url.toString();
    if (checked.url.hostname.endsWith(".onion")) return {status:"BLOCKED",message:"Tor egress is not configured; onion navigation is refused."};
    const key = prefixKey(checked.url), count = this.pageCounters.get(key) ?? 0;
    if (count >= MAX_PAGES_PER_PREFIX) return {status:"BLOCKED",message:"Page limit reached for this site/path prefix."};
    const previous = this.lastRequest.get(checked.url.origin) ?? 0;
    const delay = MIN_SITE_DELAY_MS - (Date.now() - previous);
    if (delay > 0) await new Promise(resolve=>setTimeout(resolve,delay));

    let rules: RobotsRule[] = [];
    try {
      const robots = await safeFetch(checked.url.origin + "/robots.txt");
      if (robotsFetchStatusAllowed(robots.status) && robots.ok) rules = parseRobots(await robots.text());
      else if (!robotsFetchStatusAllowed(robots.status)) return {status:"BLOCKED",message:"robots.txt server error; fail closed."};
    } catch (error) {
      return {status:"BLOCKED",message:"Could not safely check robots.txt: " + (error instanceof Error ? error.message : "error")};
    }
    if (checked.url.pathname !== "/robots.txt" && !decideRobots(checked.url.pathname + checked.url.search,rules).allowed) {
      return {status:"BLOCKED",message:"robots.txt disallows this path."};
    }

    const page = await this.connect();
    this.requestedUrl = target;
    await page.goto(target,{waitUntil:options.wait_until ?? "domcontentloaded",timeout:Math.max(1_000,Math.min(options.timeout_ms ?? 30_000,60_000))});
    this.lastRequest.set(checked.url.origin,Date.now());
    this.pageCounters.set(key,count+1);
    const blocked = await this.enforceCurrentUrl(page);
    if (blocked) return blocked;
    const text = await page.locator("body").innerText({timeout:5_000}).catch(()=>"");
    const title = await page.title();
    const challenge = challengeResult(text);
    return {status:challenge?.status ?? "OK",message:challenge?.message,data:{url:page.url(),title},evidence:await this.evidence(page,target,text,title)};
  }

  async read(options: ReadOptions = {}): Promise<BrowserResult<{text:string;title:string;url:string;injection_signals:string[]}>> {
    const page = await this.activePage();
    const selector = options.selector ?? "body";
    const locator = page.locator(selector).first();
    const text = (await locator.innerText({timeout:5_000})).slice(0,Math.max(1,Math.min(options.max_chars ?? 20_000,100_000)));
    const title = await page.title(), url = page.url();
    const signals = await injectionSignals(text,title), challenge = challengeResult(text);
    return {status:challenge?.status ?? "OK",message:challenge?.message,data:{text,title,url,injection_signals:signals},evidence:await this.evidence(page,this.requestedUrl || url,text,title)};
  }

  async click(options: ClickOptions): Promise<BrowserResult> {
    const page = await this.activePage(), locator = page.locator(options.selector).first();
    const meta = await locator.evaluate((e:Element)=>({tag:e.tagName,type:(e as HTMLInputElement).type ?? "",role:e.getAttribute("role") ?? ""}));
    const guard = guardClick(meta);
    if (guard.status !== "OK") return guard;
    await locator.click({timeout:10_000});
    const blocked = await this.enforceCurrentUrl(page);
    if (blocked) return blocked;
    const text = await page.locator("body").innerText().catch(()=>"");
    const challenge = challengeResult(text);
    return {status:challenge?.status ?? "OK",message:challenge?.message};
  }

  async type(options: TypeOptions): Promise<BrowserResult> {
    const textGuard = guardTypedText(String(options.text ?? ""));
    if (textGuard.status !== "OK") return textGuard;
    const page = await this.activePage(), locator = page.locator(options.selector).first();
    const meta = await locator.evaluate((e:Element)=>{
      const input=e as HTMLInputElement, label=input.labels?.[0];
      return {type:input.type ?? "",name:input.name ?? "",id:input.id ?? "",label:label?.innerText ?? "",autocomplete:input.autocomplete ?? ""};
    });
    const guard = guardType(meta);
    if (guard.status !== "OK") return guard;
    await locator.fill(options.text,{timeout:10_000});
    return {status:"OK"};
  }

  async submit(options: SubmitOptions): Promise<BrowserResult> {
    const guard = guardSubmit(options.confirm);
    if (guard.status !== "OK") return guard;
    const page = await this.activePage(), selector = options.selector ?? "form", form = page.locator(selector).first();
    if (await form.evaluate((e:Element)=>e.tagName.toLowerCase() !== "form").catch(()=>true)) {
      return {status:"ERROR",message:"Selector must identify a form element."};
    }
    await form.evaluate((e:HTMLFormElement)=>e.requestSubmit());
    const blocked = await this.enforceCurrentUrl(page);
    if (blocked) return blocked;
    const text = await page.locator("body").innerText().catch(()=>"");
    const challenge = challengeResult(text);
    return {status:challenge?.status ?? "OK",message:challenge?.message ?? "Submission explicitly confirmed."};
  }

  async screenshot(options: ScreenshotOptions = {}): Promise<BrowserResult<{path:string}>> {
    const page = await this.activePage();
    await mkdir(OUTPUT_DIR,{recursive:true});
    const path = join(OUTPUT_DIR,"screenshot-" + Date.now() + ".png");
    await page.screenshot({path,fullPage:options.full_page ?? false,animations:"disabled"});
    return {status:"OK",data:{path}};
  }

  async download(options: DownloadOptions): Promise<BrowserResult<{path:string;size:number;content_type:string}>> {
    const guard = guardUrl(options.url,true);
    if (guard.status !== "OK") return guard;
    try {
      const checked = await checkUrl(options.url);
      if (!checked.ok) return {status:"BLOCKED",message:checked.reason};
      const response = await safeFetch(checked.url.toString());
      if (!response.ok) return {status:"ERROR",message:"Fetch returned HTTP " + response.status};
      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      const filename = cleanFilename(options.filename ?? new URL(checked.url).pathname.split("/").pop() ?? "download");
      const reader = response.body?.getReader(), chunks:Uint8Array[] = [];
      let size = 0;
      if (reader) for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 10 * 1024 * 1024) { await reader.cancel(); return {status:"BLOCKED",message:"Fetch exceeds the 10 MiB limit."}; }
        chunks.push(part.value);
      }
      const allowed = guardDownload(filename,contentType,size);
      if (allowed.status !== "OK") return {status:allowed.status,message:allowed.message};
      await mkdir(join(OUTPUT_DIR,"downloads"),{recursive:true});
      const path = join(OUTPUT_DIR,"downloads",filename);
      await writeFile(path,Buffer.concat(chunks.map(chunk=>Buffer.from(chunk))));
      return {status:"OK",data:{path,size,content_type:contentType}};
    } catch (error) {
      return {status:"ERROR",message:error instanceof Error ? error.message : "Fetch failed"};
    }
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    this.page = null;
    this.pageCounters.clear();
    this.lastRequest.clear();
    if (browser) await browser.close().catch(()=>{});
  }
}

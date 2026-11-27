import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { guardClick, guardDownload, guardSubmit, guardType, guardTypedText, guardUrl, challengeResult } from "../core/safety.ts";
import { decideRobots, parseRobots, robotsFetchStatusAllowed, type RobotsRule } from "../core/robots.ts";
import { MAX_IDLE_MS, MAX_PAGES_PER_PREFIX, MIN_SITE_DELAY_MS, validateUrl } from "../core/policy.ts";
const SOURCE_CLASSIFIER_PATH = "../../deploy/cloudflare-ts/src/sources.ts";
const SOURCE_SAFETY_PATH = "../../deploy/cloudflare-ts/src/source.ts";
import type { BrowserEngine, BrowserResult, EvidencePacket, OpenOptions, ReadOptions, ClickOptions, TypeOptions, SubmitOptions, ScreenshotOptions, DownloadOptions, DiscoveryLayer } from "../core/types.ts";

type WdResponse<T> = { value: T; sessionId?: string };
type ElementRef = { "element-6066-11e4-a52e-4f735466cecf": string };
const ELEMENT = "element-6066-11e4-a52e-4f735466cecf";
const SAFE_DIR = join(tmpdir(), "aetherica-browser");
const MAX_REDIRECTS = 10;

async function layerFor(url: string): Promise<DiscoveryLayer> { const shared = await import(SOURCE_CLASSIFIER_PATH); return shared.webLayer(shared.canonicalRef(url)) as DiscoveryLayer; }
function prefixKey(url: URL): string { const first = url.pathname.split("/").filter(Boolean)[0] ?? ""; return url.origin + "/" + first; }
async function sharedUrlCheck(raw:string,allowLocalhost=false):Promise<{ok:true;url:URL}|{ok:false;reason:string}>{
 const local=validateUrl(raw,{allowLocalhost});
 if(local.ok&&allowLocalhost){const h=local.url.hostname.toLowerCase();if(h==="localhost"||h.endsWith(".localhost")||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".lan")||h.endsWith(".home.arpa"))return local;}
 const shared=await import(SOURCE_SAFETY_PATH);const checked=shared.checkUrl(raw);
 if("error"in checked)return{ok:false,reason:checked.error};
 return{ok:true,url:new URL(checked.url)};
}
async function safeFetch(url: string, options: RequestInit = {}, allowLocalhost = false): Promise<Response> {
 let current = url;
 for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
  const check = await sharedUrlCheck(current, allowLocalhost);
  if (!check.ok) throw new Error("Blocked redirect: " + check.reason);
  const response = await fetch(check.url, { ...options, redirect: "manual" });
  if (![301,302,303,307,308].includes(response.status)) return response;
  const location = response.headers.get("location");
  await response.body?.cancel().catch(()=>{});
  if (!location) throw new Error("Redirect without Location");
  current = new URL(location, current).toString();
 }
 throw new Error("Too many redirects");
}
async function sha256(text: string): Promise<string> { return createHash("sha256").update(text).digest("hex"); }
function cleanFilename(raw: string): string { return basename(raw).replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,128) || "download"; }

export class GeckoDriverEngine implements BrowserEngine {
 readonly name = "geckodriver";
 private endpoint: string;
 private sessionId: string | null = null;
 private currentUrl = "";
 private requestedUrl = "";
 private lastUsed = Date.now();
 private allowLocalhost: boolean;
 private pageCounters = new Map<string, number>();
 private lastRequest = new Map<string, number>();
 constructor(options: { endpoint?: string; allowLocalhost?: boolean } = {}) {
  this.endpoint = (options.endpoint ?? process.env.AETHERICA_GECKODRIVER_URL ?? "http://127.0.0.1:4444").replace(/\/$/,"");
  this.allowLocalhost = options.allowLocalhost ?? process.env.AETHERICA_ALLOW_LOCALHOST === "1";
 }
 private async command<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  if (!this.sessionId && path !== "/session") throw new Error("Browser session is not started");
  this.lastUsed = Date.now();
  const response = await fetch(this.endpoint + path, { method, headers: body === undefined ? undefined : { "Content-Type":"application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await response.json().catch(()=>({value:null})) as WdResponse<T> & {error?:string;message?:string};
  if (!response.ok || (json as any).error) throw new Error((json as any).message ?? (json as any).error ?? "WebDriver HTTP " + response.status);
  return json.value;
 }
 private async start(): Promise<void> {
  if (this.sessionId) return;
  const capabilities = {
   alwaysMatch: {
    "moz:firefoxOptions": {
     args: ["-headless"],
     prefs: {
      "browser.download.dir": join(SAFE_DIR, "downloads"),
      "browser.download.folderList": 2,
      "browser.download.useDownloadDir": true,
      "browser.helperApps.neverAsk.saveToDisk": "application/pdf,text/csv,application/json,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "pdfjs.disabled": true
     }
    }
   }
  };
  const response = await fetch(this.endpoint + "/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ capabilities }) });
  const json=await response.json() as WdResponse<unknown>;
  if(!response.ok)throw new Error((json as any).message??"WebDriver session creation failed");
  this.sessionId=json.sessionId??(json.value as any)?.sessionId;
  if(!this.sessionId)throw new Error("WebDriver returned no session ID");
 }
 private async expireIfIdle(): Promise<void> { if(this.sessionId && Date.now()-this.lastUsed>MAX_IDLE_MS)await this.close(); }
 private async script<T>(source:string,args:unknown[]=[]):Promise<T>{await this.expireIfIdle();await this.start();return this.command<T>("/session/"+this.sessionId+"/execute/sync","POST",{script:source,args});}
 /** Firefox follows HTTP and script redirects on its own, so the URL checked before navigation is not
  * necessarily where the page ended up. Re-check the current URL; on a blocked destination, leave it. */
 private async enforceCurrentUrl():Promise<BrowserResult|null>{
  const url=await this.command<string>("/session/"+this.sessionId+"/url");
  let reason:string|null=null;
  if(url!=="about:blank"){
   let scheme="";try{scheme=new URL(url).protocol}catch{reason="unparseable destination"}
   if(!reason&&scheme!=="http:"&&scheme!=="https:")reason="non-HTTP(S) destination ("+scheme+")";
   else if(!reason){if(new URL(url).hostname.endsWith(".onion"))reason="onion destination without Tor egress";else{const c=await sharedUrlCheck(url,this.allowLocalhost);if(!c.ok)reason=c.reason;}}
  }
  if(!reason)return null;
  await this.command("/session/"+this.sessionId+"/url","POST",{url:"about:blank"}).catch(()=>{});
  this.currentUrl="about:blank";
  return{status:"BLOCKED",message:"Navigation reached a blocked destination and was stopped: "+reason};
 }
 private async find(selector:string):Promise<ElementRef>{return this.command<ElementRef>("/session/"+this.sessionId+"/element","POST",{using:"css selector",value:selector});}
 async open(options:OpenOptions):Promise<BrowserResult>{
  const guarded=guardUrl(options.url,false,this.allowLocalhost);if(guarded.status!=="OK")return guarded;
  const sharedCheck=await sharedUrlCheck(options.url,this.allowLocalhost);if(!sharedCheck.ok)return{status:"BLOCKED",message:sharedCheck.reason};
  const target=sharedCheck.url.toString(),parsed=new URL(target),key=prefixKey(parsed),count=this.pageCounters.get(key)??0;
  if(parsed.hostname.endsWith(".onion"))return{status:"BLOCKED",message:"Tor egress is not configured for this GeckoDriver adapter; onion URLs are not attempted to avoid DNS leaks."};
  if(count>=MAX_PAGES_PER_PREFIX)return{status:"BLOCKED",message:"Page limit reached for this site/path prefix."};
  const previous=this.lastRequest.get(parsed.origin)??0,delay=MIN_SITE_DELAY_MS-(Date.now()-previous);if(delay>0)await new Promise(r=>setTimeout(r,delay));
  let robotsRules:RobotsRule[]=[];
  try{const rr=await safeFetch(parsed.origin+"/robots.txt",{headers:{"User-Agent":"AethericaBrowser (+https://github.com/aetherica/x)"}},this.allowLocalhost);if(robotsFetchStatusAllowed(rr.status)&&rr.ok)robotsRules=parseRobots(await rr.text());else if(!robotsFetchStatusAllowed(rr.status))return{status:"BLOCKED",message:"robots.txt server error; fail closed."};}
  catch(e){return{status:"BLOCKED",message:"Could not safely check robots.txt: "+(e instanceof Error?e.message:"error")};}
  if(parsed.pathname!=="/robots.txt"&&!decideRobots(parsed.pathname+parsed.search,robotsRules).allowed)return{status:"BLOCKED",message:"robots.txt disallows this path."};
  await this.start();this.requestedUrl=target;this.lastUsed=Date.now();
  await this.command("/session/"+this.sessionId+"/url","POST",{url:target});
  this.lastRequest.set(parsed.origin,Date.now());this.pageCounters.set(key,count+1);
  const landed=await this.enforceCurrentUrl();if(landed)return landed;
  this.currentUrl=await this.command<string>("/session/"+this.sessionId+"/url");
  const text=await this.command<string>("/session/"+this.sessionId+"/execute/sync","POST",{script:"return document.body ? document.body.innerText : ''; ",args:[]});
  const title=await this.command<string>("/session/"+this.sessionId+"/title");
  const html=await this.command<string>("/session/"+this.sessionId+"/execute/sync","POST",{script:"return document.documentElement ? document.documentElement.outerHTML : ''; ",args:[]});
  const shared=await import(SOURCE_SAFETY_PATH);const injection=shared.injectionSignals(text,title);
  const evidence:EvidencePacket={requested_url:target,final_url:this.currentUrl,redirects:[],fetched_at:new Date().toISOString(),status:null,content_type:null,sha256:await sha256(html),title,layer:await layerFor(this.currentUrl),via_tor:false,engine:this.name,injection_signals:injection,metadata_note:"WebDriver exposes the rendered DOM and final URL, not the HTTP response status, content type, or redirect chain. These are null/empty rather than inferred; redirect history is unavailable."};
  const challenge=challengeResult(text);
  return{status:challenge?.status??"OK",message:challenge?.message,data:{url:this.currentUrl,title},evidence};
 }
 async read(options:ReadOptions={}):Promise<BrowserResult<{text:string;title:string;url:string;injection_signals:string[]}>>{
  await this.expireIfIdle();await this.start();const selector=options.selector??"body",max=Math.max(1,Math.min(options.max_chars??20000,100000));
  const text=await this.script<string>("const e=document.querySelector(arguments[0]);return e?e.innerText:'';",[selector]);
  const title=await this.command<string>("/session/"+this.sessionId+"/title"),url=await this.command<string>("/session/"+this.sessionId+"/url");
  const html=await this.script<string>("return document.documentElement.outerHTML;");
  const shared=await import(SOURCE_SAFETY_PATH);const injection=shared.injectionSignals(text,title);
  const packet:EvidencePacket={requested_url:this.requestedUrl||url,final_url:url,redirects:[],fetched_at:new Date().toISOString(),status:null,content_type:null,sha256:await sha256(html),title,layer:await layerFor(url),via_tor:false,engine:this.name,injection_signals:injection,metadata_note:"WebDriver exposes the rendered DOM and final URL, not the HTTP response status, content type, or redirect chain. These are null/empty rather than inferred; redirect history is unavailable."};
  const challenge=challengeResult(text);return{status:challenge?.status??"OK",message:challenge?.message,data:{text:text.slice(0,max),title,url,injection_signals:injection},evidence:packet};
 }
 async click(options:ClickOptions):Promise<BrowserResult>{await this.expireIfIdle();await this.start();const meta=await this.script<{tag:string;type:string;role:string}>("const e=document.querySelector(arguments[0]);return e?{tag:e.tagName,type:e.type||'',role:e.getAttribute('role')||''}:{};",[options.selector]);const guard=guardClick(meta);if(guard.status!=="OK")return guard;const el=await this.find(options.selector);await this.command("/session/"+this.sessionId+"/element/"+el[ELEMENT]+"/click","POST",{});const landed=await this.enforceCurrentUrl();if(landed)return landed;return{status:"OK"};}
 async type(options:TypeOptions):Promise<BrowserResult>{const textGuard=guardTypedText(String(options.text??""));if(textGuard.status!=="OK")return textGuard;await this.expireIfIdle();await this.start();const meta=await this.script<{type:string;name:string;id:string;label:string;autocomplete:string}>("const e=document.querySelector(arguments[0]);if(!e)return{};const l=e.labels&&e.labels[0];return{type:e.type||'',name:e.name||'',id:e.id||'',label:l?l.innerText:'',autocomplete:e.autocomplete||''};",[options.selector]);const guard=guardType(meta);if(guard.status!=="OK")return guard;const el=await this.find(options.selector);await this.command("/session/"+this.sessionId+"/element/"+el[ELEMENT]+"/clear","POST",{});await this.command("/session/"+this.sessionId+"/element/"+el[ELEMENT]+"/value","POST",{text:options.text,value:Array.from(options.text)});return{status:"OK"};}
 async submit(options:SubmitOptions):Promise<BrowserResult>{const guard=guardSubmit(options.confirm);if(guard.status!=="OK")return guard;await this.expireIfIdle();await this.start();const selector=options.selector??"form";const form=await this.script<boolean>("const e=document.querySelector(arguments[0]);return !!e && e.tagName.toLowerCase()==='form';",[selector]);if(!form)return{status:"ERROR",message:"Selector must identify a form element."};await this.script<void>("document.querySelector(arguments[0]).requestSubmit();",[selector]);return{status:"OK",message:"Submission explicitly confirmed."};}
 async screenshot(_options:ScreenshotOptions={}):Promise<BrowserResult<{path:string}>>{await this.expireIfIdle();await this.start();const b64=await this.command<string>("/session/"+this.sessionId+"/screenshot");await mkdir(SAFE_DIR,{recursive:true});const path=join(SAFE_DIR,"screenshot-"+Date.now()+".png");await writeFile(path,Buffer.from(b64,"base64"));return{status:"OK",data:{path}};}
 async download(options:DownloadOptions):Promise<BrowserResult<{path:string;size:number;content_type:string}>>{const g=guardUrl(options.url,false,this.allowLocalhost);if(g.status!=="OK")return{status:g.status,message:g.message};const sharedCheck=await sharedUrlCheck(options.url,this.allowLocalhost);if(!sharedCheck.ok)return{status:"BLOCKED",message:sharedCheck.reason};try{const r=await safeFetch(sharedCheck.url.toString(),{},this.allowLocalhost);if(!r.ok)return{status:"ERROR",message:"Download HTTP "+r.status};const type=r.headers.get("content-type")??"application/octet-stream",filename=cleanFilename(options.filename??new URL(g.data!.url).pathname.split("/").pop()??"download");const chunks:Uint8Array[]=[];let total=0;const reader=r.body?.getReader();if(reader)for(;;){const{done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>10*1024*1024){await reader.cancel();return{status:"BLOCKED",message:"Download size exceeded 10 MiB."};}chunks.push(value);}const check=guardDownload(filename,type,total);if(check.status!=="OK")return{status:check.status,message:check.message};await mkdir(join(SAFE_DIR,"downloads"),{recursive:true});const path=join(SAFE_DIR,"downloads",filename);await writeFile(path,Buffer.concat(chunks.map(c=>Buffer.from(c))));return{status:"OK",data:{path,size:total,content_type:type}};}catch(e){return{status:"ERROR",message:e instanceof Error?e.message:"Download failed"}}}
 async close():Promise<void>{if(!this.sessionId)return;const id=this.sessionId;this.sessionId=null;await fetch(this.endpoint+"/session/"+id,{method:"DELETE"}).catch(()=>{});}
}

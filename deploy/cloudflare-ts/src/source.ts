// rigorx_check_source (WS32 P1, ADR-007; hardened in the 2026-11-26 audit, findings A1/A2/S-META):
// resolve the source of an evidence record (URL or DOI) over the public internet and describe what
// was retrieved: HTTP status, every redirect hop, final URL, content type, size, SHA-256 of the
// first bytes and, for HTML, a few bibliographic metadata fields. A successful check upgrades the
// evidence from "claimed" to "resolved"; it does NOT establish that the source supports the claim.
//
// Outbound request policy (defence in depth; the Cloudflare edge additionally does not route to
// private networks, but the same code also runs in the Node dev server and must stand on its own):
// - http and https only, no credentials in the URL, default ports or 8080/8443 only;
// - the host must be a public DNS name with at least one dot, or a public IP literal. IP literals
//   are parsed (IPv4 in every WHATWG spelling, IPv6 including IPv4-mapped, IPv4-compatible, NAT64
//   and 6to4 forms) and checked against the IANA special-purpose registries (RFC 6890 and updates);
// - redirects are followed manually, at most MAX_REDIRECTS hops, and every hop is checked by the
//   same policy before it is requested, so a public URL cannot bounce the fetch to a private one;
//   a hop that was already visited stops the chain (loop);
// - one deadline (TIMEOUT_MS) covers the whole chain, and at most MAX_BYTES of the body are read.
// Not covered (documented residual risk): a public DNS name that resolves to a private address
// (DNS rebinding). Workers have no resolver API; on Cloudflare the edge does not route such
// addresses, and the Node dev server is a local test harness only.
//
// Fetched content is untrusted data. Only short metadata strings are extracted, control and
// bidirectional-override characters are removed, and text that looks like instructions to an AI
// is flagged (injection_signals) so the host treats it as data.

export interface SourceMetadata {
	title: string | null;
	canonical_url: string | null;
	doi: string | null;
	site_name: string | null;
	author: string | null;
	published: string | null;
	lang: string | null;
}

import { TOR2WEB, crossrefLookup, isOverlayHost, openalexLookup, waybackLookup, type CrossrefRecord, type OpenAlexRecord, type WaybackRecord } from "./sources.ts";
import { EngineError, type JsonObject } from "./text.ts";
import { DEFAULT_POLICY, Deadline, ResilienceRegistry, ResourceExhaustedError, resilientFetch, type ResiliencePolicy } from "./resilience.ts";

export interface SourceCheck {
	ok: boolean;
	requested: string;
	resolved_url: string | null;
	final_url: string | null;
	/** Every redirect target, in order (empty when the first answer was final). */
	redirects: string[];
	status: number | null;
	content_type: string | null;
	bytes: number;
	truncated: boolean;
	sha256: string | null;
	metadata: SourceMetadata | null;
	/** Phrases in the fetched metadata that address an AI or try to change its instructions. */
	injection_signals: string[];
	checked_at: string;
	error: string | null;
	/** DL03: Crossref metadata and editorial updates (retractions) when the source is a DOI. */
	crossref?: CrossrefRecord;
	/** DL03: OpenAlex work record (citations, open access, retraction) for a DOI or arXiv ID. */
	openalex?: OpenAlexRecord;
	/** DL05: closest Wayback snapshot when the source could not be retrieved. */
	wayback?: WaybackRecord;
	/** DL04: the check went through the deployment's Tor egress. */
	via_tor?: boolean;
	/** Why the body was not downloaded (non-text content over Tor). */
	body_skipped?: string;
}

export const MAX_BYTES = 1_048_576;
/** Measured 2026-11-26: Springer DOIs need 6 hops (cookie handshake), Nature 4; every hop is checked. */
export const MAX_REDIRECTS = 10;
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const USER_AGENT = "RIGOR-X source check (+https://github.com/aetherica/x)";

// ---------------------------------------------------------------- address policy

/** Parse a dotted-decimal IPv4 address (the form the WHATWG URL parser serializes to). */
export function parseIPv4(host: string): number[] | null {
	const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
	if (!m) return null;
	const parts = m.slice(1).map(Number);
	return parts.every((p) => p <= 255) ? parts : null;
}

/** Parse an IPv6 address (without brackets) into eight 16-bit groups; accepts an embedded IPv4 tail. */
export function parseIPv6(host: string): number[] | null {
	let h = host.toLowerCase();
	if (!/^[0-9a-f:.]+$/.test(h) || !h.includes(":")) return null;
	let tail: number[] = [];
	const lastColon = h.lastIndexOf(":");
	const last = h.slice(lastColon + 1);
	if (last.includes(".")) {
		// Embedded IPv4 tail (for example ::ffff:127.0.0.1): two groups from the dotted quad.
		const v4 = parseIPv4(last);
		if (!v4) return null;
		tail = [(v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!];
		h = h.slice(0, lastColon + 1); // keep "::" intact, drop a single trailing ":"
		if (!h.endsWith("::")) h = h.slice(0, -1);
	}
	const halves = h.split("::");
	if (halves.length > 2) return null;
	const group = (s: string) => (s === "" ? [] : s.split(":"));
	const head = group(halves[0]!);
	const rest = halves.length === 2 ? group(halves[1]!) : [];
	const total = head.length + rest.length + tail.length;
	if (halves.length === 1 && total !== 8) return null;
	if (halves.length === 2 && total > 7) return null;
	const parse = (g: string) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN);
	const groups = [...head.map(parse), ...Array(8 - total).fill(0), ...rest.map(parse), ...tail];
	return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

const inV4 = (a: number[], base: [number, number, number, number], bits: number) => {
	const value = ((a[0]! << 24) | (a[1]! << 16) | (a[2]! << 8) | a[3]!) >>> 0;
	const net = ((base[0] << 24) | (base[1] << 16) | (base[2] << 8) | base[3]) >>> 0;
	const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
	return (value & mask) === (net & mask);
};

/** IPv4 special-purpose ranges that are not globally reachable (IANA, RFC 6890 and updates). */
const V4_BLOCKED: [[number, number, number, number], number, string][] = [
	[[0, 0, 0, 0], 8, "this network"], [[10, 0, 0, 0], 8, "private"], [[100, 64, 0, 0], 10, "shared address space (CGNAT)"],
	[[127, 0, 0, 0], 8, "loopback"], [[169, 254, 0, 0], 16, "link-local"], [[172, 16, 0, 0], 12, "private"],
	[[192, 0, 0, 0], 24, "IETF protocol assignments"], [[192, 0, 2, 0], 24, "documentation"], [[192, 88, 99, 0], 24, "6to4 relay anycast"],
	[[192, 168, 0, 0], 16, "private"], [[198, 18, 0, 0], 15, "benchmarking"], [[198, 51, 100, 0], 24, "documentation"],
	[[203, 0, 113, 0], 24, "documentation"], [[224, 0, 0, 0], 4, "multicast"], [[240, 0, 0, 0], 4, "reserved or broadcast"],
];

export function blockedIPv4(a: number[]): string | null {
	for (const [base, bits, why] of V4_BLOCKED) if (inV4(a, base, bits)) return why;
	return null;
}

export function blockedIPv6(g: number[]): string | null {
	const v4At = (i: number) => [g[i]! >> 8, g[i]! & 0xff, g[i + 1]! >> 8, g[i + 1]! & 0xff];
	const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
	if (zeros(0, 8)) return "unspecified address";
	if (zeros(0, 7) && g[7] === 1) return "loopback";
	if (zeros(0, 5) && g[5] === 0xffff) return blockedIPv4(v4At(6)) ? `IPv4-mapped ${blockedIPv4(v4At(6))}` : null;
	if (zeros(0, 6)) return "IPv4-compatible address (deprecated)";
	if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return blockedIPv4(v4At(6)) ? `NAT64 ${blockedIPv4(v4At(6))}` : null;
	if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return "local-use NAT64";
	if (g[0] === 0x100 && zeros(1, 4)) return "discard prefix";
	if (g[0] === 0x2001 && g[1]! < 0x200) return "IETF protocol assignments (includes Teredo)";
	if (g[0] === 0x2001 && g[1] === 0xdb8) return "documentation";
	if (g[0] === 0x2002) return blockedIPv4(v4At(1)) ? `6to4 ${blockedIPv4(v4At(1))}` : null;
	if ((g[0]! & 0xfe00) === 0xfc00) return "unique local address";
	if ((g[0]! & 0xffc0) === 0xfe80) return "link-local";
	if ((g[0]! & 0xffc0) === 0xfec0) return "site-local (deprecated)";
	if ((g[0]! & 0xff00) === 0xff00) return "multicast";
	return null;
}

const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".localdomain", ".lan", ".intranet", ".corp"];

/** Why a host must not be fetched, or null when it may be. */
export function blockedHost(rawHost: string): string | null {
	const host = rawHost.toLowerCase().replace(/\.+$/, "");
	if (!host) return "empty host";
	if (host.startsWith("[") && host.endsWith("]")) {
		const g = parseIPv6(host.slice(1, -1));
		if (!g) return "malformed IPv6 address";
		const why = blockedIPv6(g);
		return why ? `${why} (IPv6)` : null;
	}
	const v4 = parseIPv4(host);
	if (v4) {
		const why = blockedIPv4(v4);
		return why ? `${why} (IPv4)` : null;
	}
	if (/^[0-9.]+$/.test(host)) return "numeric host that is not a valid IPv4 address";
	if (host === "localhost" || LOCAL_SUFFIXES.some((s) => host.endsWith(s))) return "local or internal name";
	if (!host.includes(".")) return "single-label name (resolved inside private networks)";
	return null;
}

/** Validate one absolute URL against the outbound policy; returns the normalized URL or an error. */
export function checkUrl(raw: string, opts: { overlay?: boolean } = {}): { url: string; overlay?: boolean } | { error: string } {
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		return { error: "not a valid URL" };
	}
	if (u.protocol !== "https:" && u.protocol !== "http:") return { error: `only http and https sources can be checked, not ${u.protocol}` };
	if (u.username || u.password) return { error: "URLs with credentials are not fetched" };
	if (!ALLOWED_PORTS.has(u.port)) return { error: `port ${u.port} is not fetched (allowed: default, 8080, 8443)` };
	// Dark-web layer (DL04): onion services are reached only through the deployment's Tor egress.
	// A Tor2web gateway URL is checked as the onion itself (never through the gateway).
	let h = u.hostname.toLowerCase().replace(/\.+$/, "");
	const gw = TOR2WEB.find((g) => h === g || h.endsWith(`.${g}`));
	if (gw) {
		if (h === gw) return { error: "a Tor2web gateway without an onion name was refused" };
		h = `${h.slice(0, -gw.length - 1)}.onion`;
		u.hostname = h;
		u.protocol = "http:";
		u.port = "";
	}
	if (isOverlayHost(h)) {
		if (!/\.onion$/.test(h)) return { error: "I2P and Lokinet sources were refused: only a Tor egress is wired" };
		if (!opts.overlay) return { error: "no Tor egress on this deployment: the onion source could not be reached (NOT_CONNECTED; the Node runtime with TOR_SOCKS_URL checks it)" };
		u.hash = "";
		return { url: u.toString(), overlay: true };
	}
	const why = blockedHost(u.hostname);
	if (why) return { error: `private or local hosts are not fetched: ${why}` };
	u.hash = "";
	return { url: u.toString() };
}

/** The URL to fetch for a source reference, or an error message. DOIs resolve through doi.org. */
export function resolveRef(ref: string, opts: { overlay?: boolean } = {}): { url: string; overlay?: boolean } | { error: string } {
	const t = ref.trim();
	const doi = /^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/\S+)$/i.exec(t);
	if (doi && !/^https?:\/\/(?!(?:dx\.)?doi\.org)/i.test(t)) return { url: `https://doi.org/${doi[1]}` };
	if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) return { error: "the source reference is neither an http(s) URL nor a DOI, so it cannot be resolved" };
	return checkUrl(t, opts);
}

// ---------------------------------------------------------------- untrusted content

/** Remove control, zero-width and bidirectional-override characters; collapse spaces; cap length. */
export function cleanText(value: string, max = 300): string {
	const cleaned = value
		.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return [...cleaned].slice(0, max).join("");
}

const INJECTION_PATTERNS: [RegExp, string][] = [
	[/\b(ignore|disregard|forget)\b.{0,40}\b(previous|prior|above|all|earlier)\b.{0,40}\b(instructions?|prompts?|rules|messages?)\b/i, "asks to ignore earlier instructions"],
	[/\b(system|developer)\s*(prompt|message|instructions?)\b/i, "mentions system or developer instructions"],
	[/\byou are (now )?(an? )?(ai|assistant|chatgpt|claude|language model|llm)\b/i, "addresses an AI assistant directly"],
	[/\b(call|invoke|use|run)\b.{0,30}\b(tool|function|rigorx_\w+)\b/i, "asks to call a tool"],
	[/\b(mark|record|treat)\b.{0,40}\b(as )?(verified|validated|approved|true)\b/i, "asks to mark something as verified"],
	[/<\s*\/?\s*(system|assistant|user|tool)\s*>/i, "contains chat-role markup"],
	[/\b(api[_ -]?key|password|secret|token)\b.{0,30}\b(send|reveal|print|show|post)\b/i, "asks for secrets"],
];

/** Phrases that address an AI or try to change its instructions (heuristic; never complete). */
export function injectionSignals(...texts: (string | null)[]): string[] {
	const out = new Set<string>();
	for (const t of texts) if (t) for (const [rx, why] of INJECTION_PATTERNS) if (rx.test(t)) out.add(why);
	return [...out];
}

const decodeEntities = (s: string) =>
	s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e: string) => {
		const k = e.toLowerCase();
		if (k.startsWith("#x")) return String.fromCodePoint(Math.min(parseInt(k.slice(2), 16), 0x10ffff));
		if (k.startsWith("#")) return String.fromCodePoint(Math.min(parseInt(k.slice(1), 10), 0x10ffff));
		return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[k] ?? m;
	});

/** Bibliographic metadata from the head of an HTML document (bounded, regex-based, no DOM). */
export function extractMetadata(html: string, baseUrl: string): SourceMetadata {
	const head = html.slice(0, 262_144);
	const attrs = (tag: string) => {
		const out: Record<string, string> = {};
		for (const m of tag.matchAll(/([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1]!.toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? "");
		return out;
	};
	const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0]));
	const meta = (...keys: string[]) => {
		for (const k of keys) {
			const hit = metas.find((a) => (a.name ?? a.property ?? "").toLowerCase() === k && a.content);
			if (hit) return cleanText(hit.content!);
		}
		return null;
	};
	const titleTag = /<title\b[^>]*>([\s\S]{0,2000}?)<\/title>/i.exec(head);
	const canonicalTag = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0])).find((a) => (a.rel ?? "").toLowerCase().split(/\s+/).includes("canonical") && a.href);
	let canonical: string | null = null;
	if (canonicalTag) {
		try {
			const c = checkUrl(new URL(canonicalTag.href!, baseUrl).toString());
			canonical = "url" in c ? c.url : null;
		} catch {
			canonical = null;
		}
	}
	const doiRaw = meta("citation_doi", "dc.identifier", "prism.doi", "bepress_citation_doi");
	const doi = doiRaw ? (/10\.\d{4,9}\/\S+/.exec(doiRaw)?.[0] ?? null) : null;
	const langTag = /<html\b[^>]*\blang\s*=\s*["']?([A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*)/i.exec(head);
	return {
		title: meta("citation_title", "og:title", "dc.title") ?? (titleTag ? cleanText(decodeEntities(titleTag[1]!)) || null : null),
		canonical_url: canonical,
		doi: doi ? doi.replace(/[.,;]+$/, "") : null,
		site_name: meta("og:site_name", "citation_journal_title", "citation_publisher", "dc.publisher"),
		author: meta("citation_author", "author", "article:author", "dc.creator"),
		published: meta("citation_publication_date", "citation_date", "article:published_time", "dc.date", "date"),
		lang: langTag ? langTag[1]! : null,
	};
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const h = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- DNS verification (rebinding mitigation)

export interface DnsAnswer { addresses: string[]; error: string | null }
export type Resolver = (host: string) => Promise<DnsAnswer>;

/**
 * Resolver over DNS-over-HTTPS (Cloudflare's JSON API), A and AAAA. Workers have no resolver API,
 * so this is the only way to see what a name points to before connecting. It narrows DNS-rebinding
 * risk (a public name that resolves to a private address is refused) but cannot bind the connection
 * to the checked address: the runtime resolves again when it connects (time-of-check/time-of-use).
 * The Cloudflare edge does not route to private networks, which is the second layer [B].
 */
/** DNS-over-HTTPS providers with the same JSON answer format, tried in order (independent operators). */
export const DOH_PROVIDERS: readonly { name: string; url: (host: string, type: string) => string }[] = [
	{ name: "cloudflare", url: (h, t) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(h)}&type=${t}` },
	{ name: "google", url: (h, t) => `https://dns.google/resolve?name=${encodeURIComponent(h)}&type=${t}` },
];

export function dohResolver(fetcher: typeof fetch, reg: ResilienceRegistry, deadline: Deadline): Resolver {
	const query = async (provider: (typeof DOH_PROVIDERS)[number], host: string): Promise<DnsAnswer> => {
		const addresses: string[] = [];
		for (const type of ["A", "AAAA"]) {
			let res: Response;
			try {
				res = await resilientFetch(fetcher, provider.url(host, type), { headers: { Accept: "application/dns-json" }, redirect: "manual" },
					{ policy: reg.policy, deadline, breaker: reg.breaker(`doh:${provider.name}`), perAttemptMs: reg.policy.lookupTimeoutMs });
			} catch (e) {
				return { addresses, error: `DNS lookup unavailable at ${provider.name} (${e instanceof Error ? e.name : "error"})` };
			}
			if (!res.ok) return { addresses, error: `DNS lookup failed at ${provider.name}: HTTP ${res.status}` };
			const j = (await res.json().catch(() => null)) as { Status?: number; Answer?: { type: number; data: string }[] } | null;
			if (!j || typeof j.Status !== "number") return { addresses, error: `DNS lookup at ${provider.name} returned an unreadable answer` };
			if (j.Status !== 0 && j.Status !== 3) return { addresses, error: `DNS lookup failed at ${provider.name} (rcode ${j.Status})` };
			for (const a of j.Answer ?? []) if ((a.type === 1 || a.type === 28) && typeof a.data === "string") addresses.push(a.data);
		}
		return { addresses, error: null };
	};
	return async (host) => {
		const errors: string[] = [];
		for (const p of DOH_PROVIDERS) {
			const r = await query(p, host);
			if (!r.error) return r; // a definite answer (including "no addresses") ends the search
			errors.push(r.error);
		}
		return { addresses: [], error: errors.join("; ") };
	};
}

/** Refuse a host whose DNS answers include any non-public address, or that does not resolve, or that cannot be checked (fail closed). */
export async function checkResolved(host: string, resolve: Resolver): Promise<string | null> {
	const h = host.toLowerCase().replace(/\.+$/, "");
	if (h.startsWith("[") || parseIPv4(h)) return null; // IP literals were checked by checkUrl
	const answer = await resolve(h);
	if (answer.error) return `destination could not be verified: ${answer.error}`;
	if (!answer.addresses.length) return "the host name does not resolve";
	for (const a of answer.addresses) {
		const why = a.includes(":") ? (parseIPv6(a) ? blockedIPv6(parseIPv6(a)!) : "malformed address") : parseIPv4(a) ? blockedIPv4(parseIPv4(a)!) : "malformed address";
		if (why) return `the host name resolves to a non-public address (${why})`;
	}
	return null;
}

// ---------------------------------------------------------------- fetch

export interface CheckOptions {
	registry?: ResilienceRegistry;
	/** DNS verification of every hop's host name; defaults to DNS-over-HTTPS through the same fetcher. */
	resolver?: Resolver;
	deadline?: Deadline;
	/** DL04: fetch through the deployment's Tor egress (SOCKS5h). Absent: onion sources are NOT_CONNECTED. */
	overlay?: typeof fetch;
}

/** Content types read over Tor; anything else (images, video, archives) is not downloaded. */
const TOR_TEXT = /\b(text\/html|application\/xhtml\+xml|text\/plain)\b/i;

let defaultRegistry: ResilienceRegistry | null = null;
/** The isolate's registry (breakers, limiter); the Worker replaces it with one built from its vars. */
export function sharedRegistry(policy?: ResiliencePolicy): ResilienceRegistry {
	if (!defaultRegistry || (policy && defaultRegistry.policy !== policy)) {
		defaultRegistry = new ResilienceRegistry(policy ?? DEFAULT_POLICY, (e) => console.log(JSON.stringify({ evt: "rigorx_circuit", ...e })));
	}
	return defaultRegistry;
}

export async function checkSource(ref: string, fetcher: typeof fetch = fetch, now: () => Date = () => new Date(), opts: CheckOptions = {}): Promise<SourceCheck> {
	const base: SourceCheck = {
		ok: false, requested: ref, resolved_url: null, final_url: null, redirects: [], status: null, content_type: null,
		bytes: 0, truncated: false, sha256: null, metadata: null, injection_signals: [], checked_at: now().toISOString(), error: null,
	};
	const target = resolveRef(ref, { overlay: !!opts.overlay });
	if ("error" in target) return { ...base, error: target.error };
	base.resolved_url = target.url;
	const reg = opts.registry ?? sharedRegistry();
	const deadline = opts.deadline ?? new Deadline(reg.policy.sourceDeadlineMs);
	const resolve = opts.resolver ?? dohResolver(fetcher, reg, deadline);
	const visited = new Set<string>([target.url]);
	let url = target.url;
	let response: Response;
	for (let hop = 0; ; hop++) {
		const host = new URL(url).hostname;
		const tor = isOverlayHost(host);
		if (tor) base.via_tor = true;
		// An onion name is resolved inside Tor (SOCKS5h): no DNS lookup here, so no DNS leak.
		const dns = tor ? null : await checkResolved(host, resolve);
		if (dns) {
			console.log(JSON.stringify({ evt: "rigorx_security", kind: "ssrf_refused", stage: "dns", host_sha: (await sha256Hex(new TextEncoder().encode(host))).slice(0, 16) }));
			return { ...base, final_url: url, error: `${hop ? "redirect refused" : "source refused"}: ${dns}` };
		}
		try {
			response = await resilientFetch(tor ? opts.overlay! : fetcher, url, {
				method: "GET", redirect: "manual",
				headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8" },
			}, { policy: reg.policy, deadline, breaker: reg.breaker(`host:${host}`) });
		} catch (e) {
			const name = e instanceof Error ? e.name : "";
			const message = ["TimeoutError", "AbortError", "DeadlineExceededError"].includes(name) ? `no answer before the deadline (${Math.round(reg.policy.sourceDeadlineMs / 1000)} s for the whole check)`
				: name === "CircuitOpenError" ? "the host failed repeatedly; its circuit is open, retry later"
				: e instanceof Error ? e.message : String(e);
			return { ...base, final_url: url, error: `fetch failed: ${message}` };
		}
		if (!REDIRECT_STATUSES.has(response.status)) break;
		await response.body?.cancel().catch(() => undefined);
		const location = response.headers.get("location");
		if (!location) return { ...base, final_url: url, status: response.status, error: `HTTP ${response.status} redirect without a Location header` };
		let next: string;
		try {
			next = new URL(location, url).toString();
		} catch {
			return { ...base, final_url: url, status: response.status, error: "redirect to an invalid URL" };
		}
		const checked = checkUrl(next, { overlay: !!opts.overlay });
		if ("error" in checked) {
			console.log(JSON.stringify({ evt: "rigorx_security", kind: "ssrf_refused", stage: "redirect" }));
			return { ...base, final_url: url, status: response.status, error: `redirect refused: ${checked.error}` };
		}
		if (visited.has(checked.url)) return { ...base, final_url: url, status: response.status, error: `redirect loop at ${checked.url}` };
		if (hop + 1 > MAX_REDIRECTS) return { ...base, final_url: url, status: response.status, error: `more than ${MAX_REDIRECTS} redirects` };
		visited.add(checked.url);
		base.redirects.push(checked.url);
		url = checked.url;
	}
	if (base.via_tor && !TOR_TEXT.test(response.headers.get("content-type") ?? "")) {
		await response.body?.cancel().catch(() => undefined);
		const ok = response.status >= 200 && response.status < 300;
		const ct = response.headers.get("content-type");
		return { ...base, ok, final_url: url, status: response.status, content_type: ct ? cleanText(ct, 200) : null, body_skipped: "only text and HTML are downloaded over Tor", error: ok ? null : `HTTP ${response.status}` };
	}
	const chunks: Uint8Array[] = [];
	let total = 0;
	let truncated = false;
	if (response.body) {
		const reader = response.body.getReader();
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				const room = MAX_BYTES - total;
				if (value.byteLength > room) {
					chunks.push(value.subarray(0, room));
					total += room;
					truncated = true;
					await reader.cancel().catch(() => undefined);
					break;
				}
				chunks.push(value);
				total += value.byteLength;
			}
		} catch (e) {
			return { ...base, final_url: url, status: response.status, error: `reading the body failed: ${e instanceof Error ? e.message : String(e)}` };
		}
	}
	const all = new Uint8Array(total);
	let off = 0;
	for (const c of chunks) { all.set(c, off); off += c.byteLength; }
	const ok = response.status >= 200 && response.status < 300;
	const contentType = response.headers.get("content-type");
	let metadata: SourceMetadata | null = null;
	if (ok && contentType && /\b(text\/html|application\/xhtml\+xml)\b/i.test(contentType)) {
		metadata = extractMetadata(new TextDecoder("utf-8", { fatal: false, ignoreBOM: false }).decode(all.subarray(0, 262_144)), url);
	}
	return {
		...base,
		ok,
		final_url: url,
		status: response.status,
		content_type: contentType ? cleanText(contentType, 200) : null,
		bytes: total,
		truncated,
		sha256: await sha256Hex(all),
		metadata,
		injection_signals: metadata ? injectionSignals(metadata.title, metadata.author, metadata.site_name) : [],
		error: ok ? null : `HTTP ${response.status}`,
	};
}

/**
 * The whole rigorx_check_source flow, shared by the Worker, the dev server and the tests:
 * 1. reserve: `evidence_for_check` is metered in the owner's Durable Object BEFORE any fetch, and
 *    refuses a terminal run or a full evidence list (audit finding A3);
 * 2. acquire under the bulkhead (at most acquisitionConcurrency per isolate, bounded queue,
 *    excess refused) and one deadline for everything below;
 * 3. fetch the source under the outbound policy (checkSource: DNS check and URL check per hop,
 *    bounded retries of transient failures, per-host circuit breaker);
 * 4. D02: Crossref metadata and retractions for a DOI; D05: the closest Wayback snapshot for a
 *    source that could not be retrieved. A failed lookup is reported, never fabricated, and does not
 *    fail the check (graceful degradation: optional enrichments);
 * 5. record the engine-verified SOURCE_CHECK receipt (not charged again).
 */
export async function runSourceCheck(run: (operation: string, args: JsonObject) => Promise<JsonObject>, args: JsonObject, fetcher: typeof fetch = fetch, opts: CheckOptions = {}): Promise<JsonObject> {
	const evidence = await run("evidence_for_check", args);
	const reg = opts.registry ?? sharedRegistry();
	const deadline = opts.deadline ?? new Deadline(reg.policy.sourceDeadlineMs);
	let check: SourceCheck;
	try {
		check = await reg.limiter.run(async () => {
			const c = await checkSource(String(evidence.source_ref), fetcher, undefined, { ...opts, registry: reg, deadline });
			const identity = (evidence.identity ?? null) as { kind?: unknown; canonical?: unknown; archive?: unknown } | null;
			const doi = identity?.kind === "doi" && typeof identity.canonical === "string" ? identity.canonical.slice(4) : c.metadata?.doi ?? null;
			const lookup = { registry: reg, deadline };
			if (doi) c.crossref = await crossrefLookup(doi, fetcher, lookup);
			const scholarly = doi ? `doi:${doi.toLowerCase()}` : identity?.kind === "arxiv" && typeof identity.canonical === "string" ? identity.canonical : null;
			if (scholarly) c.openalex = await openalexLookup(scholarly, fetcher, lookup);
			if (!c.ok && !identity?.archive && c.resolved_url && !/^https:\/\/doi\.org\//.test(c.resolved_url) && !/refused|no Tor egress/.test(c.error ?? "") && !c.via_tor) c.wayback = await waybackLookup(c.resolved_url, fetcher, lookup);
			return c;
		});
	} catch (e) {
		if (e instanceof ResourceExhaustedError) throw new EngineError(e.message, "RESOURCE_EXHAUSTED");
		throw e;
	}
	return run("record_source_check", { run_id: args.run_id ?? null, evidence_id: args.evidence_id ?? null, check: check as unknown as JsonObject });
}

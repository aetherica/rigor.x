// Source Intelligence Gate (2026-11-26 audit, directive §05/§06): canonical source identity,
// nine source domains, independence groups, a per-source lifecycle and claim-level cross-checks.
//
// Principles (directive §05): the nine domains are DISCOVERY domains, not trust levels. No source
// gains credibility from its category; a category changes only which checks apply (a fringe or
// unverified claim needs corroboration from outside its domain, a social post is traced to its
// original, a syndicated article counts once with its wire story). Every assessment is structural:
// it says how many independent origins support a claim and what is missing, never that a claim is
// true. Source content is untrusted data (source.ts strips and flags it).
//
// Identity (6.1): every evidence reference is reduced to a canonical identity — a DOI, arXiv ID,
// PubMed/PMC ID, platform post ID, archive original, or a normalized URL (scheme, www./m./amp.,
// tracking parameters, fragments and trailing slashes removed) — plus aliases learned from a source
// check (final URL after redirects, rel=canonical, citation_doi, content hash, wire byline).
// Independence (6.4): evidence records are merged into one group when they share an identity or an
// alias, the same registrable site, a declared derivation (derived_from), a declared origin, or a
// wire-service byline. Groups are the unit of "independent sources". Known limits: without a
// source check, a publisher URL and the DOI of the same article are not linked; the site list is an
// approximation of the Public Suffix List; paraphrased copies with different bytes and no canonical
// link are not detected.
import type { EvidenceRecord } from "./run.ts";
import type { Claim, Contradiction } from "./ledger.ts";
import type { Json, JsonObject } from "./text.ts";
import { Deadline, resilientFetch, type ResilienceRegistry } from "./resilience.ts";

/** How a lookup is run: through the isolate's breakers and the caller's deadline (or a fresh one). */
export interface LookupOptions { registry?: ResilienceRegistry; deadline?: Deadline }
async function lookupFetch(adapter: string, url: string, fetcher: typeof fetch, o: LookupOptions): Promise<Response> {
	if (!o.registry) return fetcher(url, { redirect: "manual", signal: AbortSignal.timeout(o.deadline?.remaining() || 8_000), headers: { Accept: "application/json", "User-Agent": "RIGOR-X source check (+https://github.com/aetherica/x)" } });
	return resilientFetch(fetcher, url, { redirect: "manual", headers: { Accept: "application/json", "User-Agent": "RIGOR-X source check (+https://github.com/aetherica/x)" } },
		{ policy: o.registry.policy, deadline: o.deadline ?? new Deadline(o.registry.policy.lookupTimeoutMs * 2), breaker: o.registry.breaker(adapter), perAttemptMs: o.registry.policy.lookupTimeoutMs });
}

// ---------------------------------------------------------------- the nine domains

export const DOMAIN_IDS = ["D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09"] as const;
export type DomainId = (typeof DOMAIN_IDS)[number];

export interface DomainSpec {
	id: DomainId;
	key: string;
	name: string;
	acquisition: string;
	cross_check: string;
	boundary: string;
	/** OPERATIONAL: works end to end on this server. PARTIAL: identity and checks work, an external
	 * provider is not integrated. CONTRACT_ONLY: the host records evidence in the stated structure;
	 * RIGOR-X acquires nothing itself. */
	status: "OPERATIONAL" | "PARTIAL" | "CONTRACT_ONLY";
	not_operational: string[];
}

export const DOMAINS: Record<DomainId, DomainSpec> = {
	D01: { id: "D01", key: "surface_web", name: "Direct / surface web", status: "OPERATIONAL",
		acquisition: "rigorx_check_source: direct HTTP(S) fetch with per-hop redirect checks, SHA-256 of the first 1 MiB, HTML metadata (title, canonical link, DOI, publisher, author, date, language)",
		cross_check: "canonical URL and rel=canonical (original vs syndicated), redirect chain, content hash, publication date from metadata",
		boundary: "public hosts only; private, local and reserved addresses refused at every redirect hop",
		not_operational: ["search-engine discovery (the host searches; RIGOR-X has no search provider)"] },
	D02: { id: "D02", key: "specialist", name: "Deep / specialist / technical web", status: "PARTIAL",
		acquisition: "DOI resolution through doi.org; Crossref metadata and retraction status (Retraction Watch data) for DOIs; arXiv, PubMed and PMC identity normalization",
		cross_check: "one work counts once in every format (DOI URL, doi: prefix, publisher URL with citation_doi); a retracted work fails the gate",
		boundary: "public metadata APIs only (Crossref); no paywalled full text",
		not_operational: ["OpenAlex/Semantic Scholar citation graph", "dataset version and methodology extraction", "replication search"] },
	D03: { id: "D03", key: "restricted", name: "Restricted / non-indexed / authenticated", status: "CONTRACT_ONLY",
		acquisition: "none by RIGOR-X: the host records what it read through its own authorized connectors (access: authenticated|restricted)",
		cross_check: "recorded as host-declared with its access basis; never fetched; needs corroboration like any other single origin",
		boundary: "no authentication bypass, no credential use, no access to stolen or illegal data; private hosts are refused by the fetcher",
		not_operational: ["any acquisition (by design)"] },
	D04: { id: "D04", key: "local", name: "Local / ground / community", status: "CONTRACT_ONLY",
		acquisition: "field-data intake: evidence with source_ref field:<id> or source_domain D04, observed_at (as_of), place and direct|hearsay in the claim",
		cross_check: "independent witnesses count as separate groups only when their origins differ; Unicode-normalized, language-agnostic identity",
		boundary: "RIGOR-X never fabricates or collects field observations",
		not_operational: ["local-source discovery", "geocoding", "translation-fidelity checks"] },
	D05: { id: "D05", key: "archive", name: "Archive / historical / versioned", status: "PARTIAL",
		acquisition: "web-archive URLs are reduced to their original (Wayback snapshot timestamp kept); for a failed or archived source, the Wayback availability API reports the closest snapshot",
		cross_check: "an archived copy and its original are one group; original vs archive timestamp kept apart; content hash compares versions",
		boundary: "an archived page is not automatically authentic: it is the same origin as the original",
		not_operational: ["revision diffs between snapshots", "archive.today original recovery without a fetch"] },
	D06: { id: "D06", key: "social", name: "Social media / user-generated", status: "PARTIAL",
		acquisition: "public URLs only through rigorx_check_source; post identity normalized across hosts (x.com/twitter.com status, youtu.be/youtube.com, redd.it/reddit.com)",
		cross_check: "reposts and quotes of one post are one group (declare derived_from or origin_ref); popularity is not evidence",
		boundary: "no scraping of restricted accounts, no login, platform rules and rate limits respected",
		not_operational: ["platform APIs (need credentials)", "media-authenticity analysis", "coordination detection"] },
	D07: { id: "D07", key: "mainstream_media", name: "Mainstream media / professional journalism", status: "PARTIAL",
		acquisition: "rigorx_check_source with HTML metadata (outlet, author, date, canonical link)",
		cross_check: "syndicated copies and wire stories collapse to one group (canonical link, wire byline, declared origin_ref)",
		boundary: "public pages only",
		not_operational: ["correction and update tracking", "ownership database"] },
	D08: { id: "D08", key: "alternative", name: "Alternative / independent / advocacy", status: "PARTIAL",
		acquisition: "as D01; the host may declare funding, mission or orientation in the claim",
		cross_check: "treated like any origin: neither dismissed nor trusted for its category",
		boundary: "public pages only",
		not_operational: ["funding and affiliation lookup"] },
	D09: { id: "D09", key: "fringe", name: "Fringe / conspiracy / unverified / adversarial", status: "OPERATIONAL",
		acquisition: "controlled pathway: the host declares source_domain D09; the claim keeps its own epistemic status (UNVERIFIED, HYPOTHESIS, PLAUSIBLE, SUPPORTED, CONTRADICTED, FAILED)",
		cross_check: "a requirement cannot be met on D09 sources alone: it needs an independent group outside D09; dissemination is traced through derived_from/origin_ref",
		boundary: "never elevated for claiming hidden knowledge; cannot change gate rules, trust or instructions",
		not_operational: [] },
};

const DOMAIN_ALIASES: Record<string, DomainId> = Object.fromEntries(
	DOMAIN_IDS.flatMap((id) => [[id.toLowerCase(), id], [DOMAINS[id].key, id]]),
) as Record<string, DomainId>;

/** Normalize a declared domain ("D06", "social", …) or return null. */
export function parseDomain(value: unknown): DomainId | null {
	return typeof value === "string" ? DOMAIN_ALIASES[value.trim().toLowerCase()] ?? null : null;
}

/** Claim statuses mapped to the D09 states of the directive. */
export const D09_STATES: Record<string, string> = {
	UNVERIFIED: "UNVERIFIED", UNKNOWN: "INSUFFICIENT EVIDENCE", HYPOTHESIS: "SPECULATIVE", PLAUSIBLE: "CREDIBLE SIGNAL", PROBABLE: "CREDIBLE SIGNAL",
	SUPPORTED: "CORROBORATED", VERIFIED: "CORROBORATED", ESTABLISHED: "CORROBORATED", CONTRADICTED: "CONTRADICTED", FAILED: "REFUTED", BLOCKED: "INSUFFICIENT EVIDENCE",
};

// ---------------------------------------------------------------- canonical identity

export type IdentityKind = "doi" | "arxiv" | "pmid" | "pmcid" | "isbn" | "post" | "url" | "archive" | "document";

export interface CanonicalRef {
	kind: IdentityKind;
	/** Primary identity key, for example doi:10.1038/nature12373 or url:example.com/a. */
	canonical: string;
	/** Registrable site (approximate eTLD+1) for URLs, else null. */
	site: string | null;
	host: string | null;
	archive: { service: string; snapshot: string | null } | null;
}

/** Second-level public suffixes (approximation of the Public Suffix List, ICANN and common private entries). */
const MULTI_SUFFIX = new Set([
	"co.uk", "org.uk", "ac.uk", "gov.uk", "ltd.uk", "plc.uk", "me.uk", "nhs.uk", "com.au", "net.au", "org.au", "edu.au", "gov.au",
	"co.nz", "org.nz", "govt.nz", "ac.nz", "co.jp", "ne.jp", "or.jp", "ac.jp", "go.jp", "com.bd", "net.bd", "org.bd", "edu.bd", "gov.bd", "ac.bd",
	"co.in", "net.in", "org.in", "gov.in", "ac.in", "edu.in", "nic.in", "res.in", "com.br", "gov.br", "org.br", "edu.br", "com.cn", "gov.cn", "edu.cn",
	"org.cn", "ac.cn", "com.hk", "gov.hk", "edu.hk", "com.sg", "gov.sg", "edu.sg", "com.my", "gov.my", "edu.my", "com.pk", "gov.pk", "edu.pk",
	"com.tr", "gov.tr", "edu.tr", "co.za", "gov.za", "ac.za", "org.za", "com.mx", "gob.mx", "com.ar", "gob.ar", "co.kr", "go.kr", "ac.kr", "or.kr",
	"com.tw", "gov.tw", "edu.tw", "co.id", "go.id", "ac.id", "com.eg", "gov.eg", "com.sa", "gov.sa", "com.ng", "gov.ng", "co.ke", "go.ke", "ac.ke",
	"com.np", "gov.np", "com.lk", "gov.lk", "ac.lk", "co.il", "gov.il", "ac.il", "com.ua", "gov.ua", "com.ru", "gov.ru", "co.th", "go.th", "ac.th",
	"com.vn", "gov.vn", "edu.vn", "com.ph", "gov.ph", "edu.ph", "europa.eu",
	// Hosting platforms whose subdomains belong to different people (PSL private section).
	"github.io", "gitlab.io", "blogspot.com", "wordpress.com", "substack.com", "medium.com", "netlify.app", "pages.dev", "workers.dev",
	"vercel.app", "herokuapp.com", "web.app", "firebaseapp.com", "appspot.com", "tumblr.com", "wixsite.com", "weebly.com", "neocities.org",
]);

export function registrableSite(host: string): string {
	const h = host.toLowerCase().replace(/\.+$/, "");
	if (h.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return h;
	const parts = h.split(".");
	if (parts.length <= 2) return h;
	const last2 = parts.slice(-2).join(".");
	return MULTI_SUFFIX.has(last2) ? parts.slice(-3).join(".") : last2;
}

const TRACKING = /^(utm_\w+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|igsh|ref|ref_src|ref_url|referrer|s|si|feature|cmpid|ito|_ga|_gl|spm|share|smid|sref|cid|ocid|taid|at_medium|at_campaign|guccounter|guce_referrer\w*)$/i;

const cleanDoi = (doi: string) => decodeURIComponent(doi).trim().replace(/[.,;:)\]>"']+$/, "").toLowerCase();

const ARCHIVE_HOSTS: Record<string, string> = {
	"web.archive.org": "wayback", "wayback.archive.org": "wayback", "archive.today": "archive.today", "archive.ph": "archive.today", "archive.is": "archive.today",
	"archive.li": "archive.today", "archive.md": "archive.today", "archive.vn": "archive.today", "ghostarchive.org": "ghostarchive", "perma.cc": "perma.cc",
	"webcitation.org": "webcitation",
};

/** Reduce a source reference to its canonical identity. Never fetches. */
export function canonicalRef(ref: string): CanonicalRef {
	const t = ref.trim().normalize("NFKC");
	const doc = (canonical: string): CanonicalRef => ({ kind: "document", canonical, site: null, host: null, archive: null });
	let m = /^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)(10\.\d{4,9}\/\S+)$/i.exec(t) ?? /^(10\.\d{4,9}\/\S+)$/.exec(t);
	if (m) return { kind: "doi", canonical: `doi:${cleanDoi(m[1]!)}`, site: null, host: null, archive: null };
	if ((m = /^arxiv:\s*([a-z-]+(?:\.[a-z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?$/i.exec(t))) return { kind: "arxiv", canonical: `arxiv:${m[1]!.toLowerCase()}`, site: null, host: null, archive: null };
	if ((m = /^pmid:\s*(\d{1,9})$/i.exec(t))) return { kind: "pmid", canonical: `pmid:${m[1]}`, site: null, host: null, archive: null };
	if ((m = /^isbn(?:-1[03])?:\s*([\d -]{9,17}[\dx])$/i.exec(t))) return { kind: "isbn", canonical: `isbn:${m[1]!.replace(/[ -]/g, "").toLowerCase()}`, site: null, host: null, archive: null };
	let u: URL;
	try {
		u = new URL(t);
	} catch {
		return doc(t.toLowerCase().replace(/\s+/g, " "));
	}
	if (u.protocol !== "http:" && u.protocol !== "https:") return doc(`${u.protocol}${u.pathname}`.toLowerCase());
	const host = u.hostname.toLowerCase().replace(/\.+$/, "");
	const bare = host.replace(/^(www\d?|m|mobile|amp)\./, "");
	const site = registrableSite(bare);
	const path = u.pathname;
	// Web archives: the identity is the original; the snapshot is kept apart.
	const service = ARCHIVE_HOSTS[bare];
	if (service === "wayback") {
		const w = /^\/web\/(\d{4,14})(?:[a-z]{2}_)?\/(.+)$/i.exec(path + u.search);
		if (w) {
			const original = /^https?:\/\//i.test(w[2]!) ? w[2]! : `http://${w[2]}`;
			const inner = canonicalRef(original);
			return { ...inner, kind: inner.kind === "url" ? "archive" : inner.kind, archive: { service, snapshot: w[1]! } };
		}
	}
	if (service) return { kind: "archive", canonical: `${service}:${path.replace(/\/+$/, "").toLowerCase()}`, site, host: bare, archive: { service, snapshot: null } };
	// Scholarly identifiers inside URLs.
	if ((m = /\/doi\/(?:abs\/|full\/|pdf\/|epdf\/|epub\/|book\/)?(10\.\d{4,9}\/[^?#]+)/i.exec(path))) return { kind: "doi", canonical: `doi:${cleanDoi(m[1]!)}`, site, host: bare, archive: null };
	if (bare === "arxiv.org" && (m = /^\/(?:abs|pdf|html)\/([a-z-]+(?:\.[a-z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?\/?$/i.exec(path))) return { kind: "arxiv", canonical: `arxiv:${m[1]!.toLowerCase()}`, site, host: bare, archive: null };
	if ((bare === "pubmed.ncbi.nlm.nih.gov" && (m = /^\/(\d{1,9})\/?$/.exec(path))) || (bare === "ncbi.nlm.nih.gov" && (m = /^\/pubmed\/(\d{1,9})\/?$/.exec(path)))) return { kind: "pmid", canonical: `pmid:${m[1]}`, site, host: bare, archive: null };
	if ((m = /\/pmc\/articles\/(PMC\d+)/i.exec(path))) return { kind: "pmcid", canonical: `pmcid:${m[1]!.toUpperCase()}`, site, host: bare, archive: null };
	// Platform posts: one post, many hosts.
	if ((bare === "twitter.com" || bare === "x.com" || bare === "nitter.net") && (m = /^\/[^/]+\/status(?:es)?\/(\d+)/.exec(path))) return { kind: "post", canonical: `x:status:${m[1]}`, site: "x.com", host: bare, archive: null };
	if (bare === "youtu.be" && (m = /^\/([\w-]{11})/.exec(path))) return { kind: "post", canonical: `youtube:${m[1]}`, site: "youtube.com", host: bare, archive: null };
	if (bare === "youtube.com" && ((m = /^\/(?:shorts|embed|live)\/([\w-]{11})/.exec(path)) || (path === "/watch" && (m = /^([\w-]{11})$/.exec(u.searchParams.get("v") ?? ""))))) return { kind: "post", canonical: `youtube:${m[1]}`, site: "youtube.com", host: bare, archive: null };
	if ((bare === "reddit.com" || bare === "old.reddit.com") && (m = /^\/r\/[^/]+\/comments\/([a-z0-9]+)/i.exec(path))) return { kind: "post", canonical: `reddit:${m[1]!.toLowerCase()}`, site: "reddit.com", host: bare, archive: null };
	if (bare === "redd.it" && (m = /^\/([a-z0-9]+)/i.exec(path))) return { kind: "post", canonical: `reddit:${m[1]!.toLowerCase()}`, site: "reddit.com", host: bare, archive: null };
	// Generic URL: scheme-less, without tracking parameters, fragment, AMP suffixes or trailing slash.
	const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
	let p = path.replace(/\/amp\/?$/i, "").replace(/\.amp$/i, "").replace(/\/index\.(html?|php)$/i, "/").replace(/\/+$/, "") || "/";
	p = p.replace(/%[0-9a-f]{2}/gi, (x) => x.toUpperCase());
	const query = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join("&")}` : "";
	const port = u.port && !((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) ? `:${u.port}` : "";
	return { kind: "url", canonical: `url:${bare}${port}${p}${query}`, site, host: bare, archive: null };
}

// ---------------------------------------------------------------- domain classification

const SPECIALIST_SITES = new Set([
	"doi.org", "arxiv.org", "biorxiv.org", "medrxiv.org", "ssrn.com", "nih.gov", "ncbi.nlm.nih.gov", "europepmc.org", "ieee.org", "acm.org", "springer.com",
	"sciencedirect.com", "elsevier.com", "nature.com", "science.org", "cell.com", "wiley.com", "tandfonline.com", "sagepub.com", "plos.org", "jstor.org",
	"semanticscholar.org", "openalex.org", "crossref.org", "zenodo.org", "figshare.com", "datadryad.org", "osf.io", "github.com", "gitlab.com",
	"huggingface.co", "kaggle.com", "data.gov", "data.europa.eu", "worldbank.org", "imf.org", "oecd.org", "who.int", "un.org", "stackoverflow.com",
	"stackexchange.com", "rfc-editor.org", "ietf.org", "w3.org", "iso.org", "nist.gov", "acs.org", "aps.org", "iop.org", "mdpi.com", "frontiersin.org",
	"bmj.com", "thelancet.com", "nejm.org", "jamanetwork.com", "oup.com", "cambridge.org", "researchgate.net",
]);
const SOCIAL_SITES = new Set([
	"x.com", "twitter.com", "facebook.com", "fb.com", "instagram.com", "threads.net", "tiktok.com", "youtube.com", "youtu.be", "reddit.com", "redd.it",
	"t.me", "telegram.me", "bsky.app", "linkedin.com", "quora.com", "pinterest.com", "vk.com", "weibo.com", "douyin.com", "bilibili.com", "rumble.com",
	"truthsocial.com", "gab.com", "mastodon.social", "discord.com", "whatsapp.com",
]);
const MEDIA_SITES = new Set([
	"reuters.com", "apnews.com", "afp.com", "bbc.co.uk", "bbc.com", "nytimes.com", "washingtonpost.com", "theguardian.com", "wsj.com", "ft.com",
	"bloomberg.com", "economist.com", "cnn.com", "aljazeera.com", "dw.com", "france24.com", "lemonde.fr", "spiegel.de", "nhk.or.jp", "scmp.com",
	"thehindu.com", "hindustantimes.com", "indiatimes.com", "prothomalo.com", "thedailystar.net", "bdnews24.com", "dhakatribune.com", "tbsnews.net",
	"npr.org", "cbsnews.com", "nbcnews.com", "abcnews.go.com", "latimes.com", "usatoday.com", "axios.com", "politico.com", "theatlantic.com",
	"newyorker.com", "time.com", "cnbc.com", "foxnews.com", "propublica.org", "lefigaro.fr", "elpais.com", "corriere.it", "asahi.com", "yomiuri.co.jp",
	"abc.net.au", "cbc.ca", "straitstimes.com", "dawn.com", "kompas.com", "xinhuanet.com", "tass.com", "pti.in", "bssnews.net",
]);
const ADVOCACY_SITES = new Set([
	"hrw.org", "amnesty.org", "greenpeace.org", "brookings.edu", "heritage.org", "cato.org", "rand.org", "chathamhouse.org", "cfr.org",
	"transparency.org", "icij.org", "bellingcat.com", "eff.org", "aclu.org", "oxfam.org", "msf.org", "wri.org", "csis.org", "carnegieendowment.org",
]);
const RESTRICTED_HOSTS = ["docs.google.com", "drive.google.com", "sharepoint.com", "notion.so", "dropbox.com", "box.com", "atlassian.net", "slack.com", "onedrive.live.com"];
const WIRES: [RegExp, string][] = [
	[/\b(associated press|^ap$|ap news)\b/i, "ap"], [/\breuters\b/i, "reuters"], [/\b(afp|agence france[- ]presse)\b/i, "afp"], [/\b(press trust of india|^pti$)\b/i, "pti"],
	[/\b(asian news international|^ani$)\b/i, "ani"], [/\b(bangladesh sangbad sangstha|^bss$)\b/i, "bss"], [/\b(united news of bangladesh|^unb$)\b/i, "unb"],
	[/\bxinhua\b/i, "xinhua"], [/\b(dpa|deutsche presse-agentur)\b/i, "dpa"], [/\b(efe)\b/i, "efe"], [/\bansa\b/i, "ansa"], [/\bkyodo\b/i, "kyodo"],
	[/\byonhap\b/i, "yonhap"], [/\bbernama\b/i, "bernama"], [/\btass\b/i, "tass"],
];
export function wireService(text: string | null | undefined): string | null {
	if (!text) return null;
	for (const [rx, name] of WIRES) if (rx.test(text.trim())) return name;
	return null;
}

/** Inferred domain for an identity (null: not inferable; D04 and D09 are only ever declared). */
export function inferDomain(c: CanonicalRef, ref: string): DomainId | null {
	if (c.archive) return "D05";
	if (c.kind === "doi" || c.kind === "arxiv" || c.kind === "pmid" || c.kind === "pmcid" || c.kind === "isbn") return "D02";
	if (c.kind === "document") {
		if (/^field:/i.test(ref.trim())) return "D04";
		if (/^(file|drive|gdrive|s3|internal|intranet|doc|confluence|sharepoint|notion):/i.test(ref.trim())) return "D03";
		return null;
	}
	const site = c.site ?? "";
	const host = c.host ?? "";
	if (RESTRICTED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "D03";
	if (c.kind === "post" || SOCIAL_SITES.has(site) || /^mastodon\./.test(host)) return "D06";
	if (SPECIALIST_SITES.has(site) || host.endsWith(".nih.gov") || /\.(ac|edu)(\.[a-z]{2})?$/.test(host)) return "D02";
	if (MEDIA_SITES.has(site)) return "D07";
	if (ADVOCACY_SITES.has(site) || /\.(ngo|ong)$/.test(host) || site === "substack.com" || site.endsWith(".substack.com")) return "D08";
	return "D01";
}

// ---------------------------------------------------------------- identity of one evidence record

export interface SourceIdentity {
	evidence_id: string;
	ref: string;
	kind: IdentityKind;
	canonical: string;
	/** Other identity keys: final URL, canonical link, DOI from metadata, content hash, wire byline, declared origin. */
	aliases: string[];
	site: string | null;
	domain: DomainId | null;
	domain_basis: "declared" | "inferred" | "unknown";
	archive: CanonicalRef["archive"];
	derived_from: string[];
	access: string | null;
	primary: boolean;
}

/** The latest successful SOURCE_CHECK details per checked evidence ID. */
export function latestChecks(evidence: EvidenceRecord[]): Map<string, JsonObject> {
	const out = new Map<string, JsonObject>();
	for (const e of evidence) if (e.type === "SOURCE_CHECK" && typeof e.details.checks_evidence === "string") out.set(e.details.checks_evidence, e.details);
	return out;
}

export function sourceIdentity(e: EvidenceRecord, check?: JsonObject | null): SourceIdentity {
	const c = canonicalRef(e.source_ref);
	const aliases = new Set<string>();
	const add = (ref: unknown) => {
		if (typeof ref !== "string" || !ref) return;
		const k = canonicalRef(ref).canonical;
		if (k !== c.canonical) aliases.add(k);
	};
	const declared = parseDomain(e.details.source_domain);
	if (typeof e.details.origin_ref === "string") aliases.add(`origin:${canonicalRef(e.details.origin_ref).canonical}`);
	const wireDeclared = wireService(typeof e.details.publisher === "string" ? e.details.publisher : null) ?? wireService(typeof e.details.origin_ref === "string" ? e.details.origin_ref : null);
	if (wireDeclared) aliases.add(`wire:${wireDeclared}`);
	if (check && check.ok === true) {
		add(check.final_url);
		const meta = (check.metadata ?? null) as { canonical_url?: unknown; doi?: unknown; author?: unknown; site_name?: unknown } | null;
		if (meta) {
			add(meta.canonical_url);
			if (typeof meta.doi === "string") add(`doi:${meta.doi}`);
			const wire = wireService(typeof meta.author === "string" ? meta.author : null) ?? wireService(typeof meta.site_name === "string" ? meta.site_name : null);
			if (wire) aliases.add(`wire:${wire}`);
		}
		const cr = check.crossref as { doi?: unknown } | null | undefined;
		if (cr && typeof cr.doi === "string") add(`doi:${cr.doi}`);
		if (typeof check.sha256 === "string" && typeof check.bytes === "number" && check.bytes > 256) aliases.add(`sha256:${check.sha256}`);
	}
	const inferred = inferDomain(c, e.source_ref);
	const domain = declared ?? inferred;
	return {
		evidence_id: e.id, ref: e.source_ref, kind: c.kind, canonical: c.canonical, aliases: [...aliases], site: c.site,
		domain, domain_basis: declared ? "declared" : inferred ? "inferred" : "unknown", archive: c.archive,
		derived_from: Array.isArray(e.details.derived_from) ? (e.details.derived_from as Json[]).map(String) : [],
		access: typeof e.details.access === "string" ? e.details.access : null,
		primary: e.details.primary === true || c.kind === "doi" || c.kind === "arxiv" || c.kind === "pmid" || c.kind === "pmcid",
	};
}

// ---------------------------------------------------------------- independence

export interface IndependenceGroup {
	key: string;
	members: string[];
	/** Why members were merged, for example "same DOI", "same site example.com", "ev-4 derived from ev-2". */
	reasons: string[];
}

/** Union-find over shared identity keys; each resulting group is one independent origin. */
export function independenceGroups(ids: SourceIdentity[]): IndependenceGroup[] {
	const parent = new Map<string, string>(ids.map((i) => [i.evidence_id, i.evidence_id]));
	const find = (x: string): string => {
		let r = x;
		while (parent.get(r) !== r) r = parent.get(r)!;
		parent.set(x, r);
		return r;
	};
	const reasons = new Map<string, string[]>();
	const union = (a: string, b: string, why: string) => {
		const ra = find(a), rb = find(b);
		if (ra === rb) return;
		parent.set(rb, ra);
		reasons.set(ra, [...(reasons.get(ra) ?? []), ...(reasons.get(rb) ?? []), why]);
	};
	const owner = new Map<string, string>();
	const claim = (key: string, id: string, why: string) => {
		const o = owner.get(key);
		if (o) union(o, id, why);
		else owner.set(key, id);
	};
	for (const i of ids) {
		claim(`id:${i.canonical}`, i.evidence_id, `same identity ${i.canonical}`);
		// A declared origin links to the record whose own identity it names.
		for (const a of i.aliases) claim(a.startsWith("origin:") ? `id:${a.slice(7)}` : a.startsWith("wire:") || a.startsWith("sha256:") ? a : `id:${a}`, i.evidence_id,
			a.startsWith("wire:") ? `same wire service (${a.slice(5)})` : a.startsWith("sha256:") ? "identical content (SHA-256)" : a.startsWith("origin:") ? `declared origin ${a.slice(7)}` : `same identity ${a}`);
		if (i.site && (i.kind === "url" || i.kind === "post" || i.kind === "archive")) claim(`site:${i.site}`, i.evidence_id, `same site ${i.site}`);
	}
	for (const i of ids) for (const d of i.derived_from) if (parent.has(d)) union(d, i.evidence_id, `${i.evidence_id} derived from ${d}`);
	const groups = new Map<string, IndependenceGroup>();
	for (const i of ids) {
		const r = find(i.evidence_id);
		const g = groups.get(r) ?? { key: "", members: [], reasons: [...new Set(reasons.get(r) ?? [])] };
		g.members.push(i.evidence_id);
		groups.set(r, g);
	}
	const byId = new Map(ids.map((i) => [i.evidence_id, i]));
	for (const g of groups.values()) {
		const scholarly = g.members.map((m) => byId.get(m)!).find((i) => i.kind !== "url" && i.kind !== "document" && i.kind !== "archive");
		const first = byId.get(g.members[0]!)!;
		g.key = scholarly ? scholarly.canonical : first.site ? `site:${first.site}` : first.canonical;
	}
	return [...groups.values()];
}

// ---------------------------------------------------------------- lifecycle and claim cross-checks

export type LifecycleStage = "DISCOVERED" | "ACQUISITION_FAILED" | "ACQUIRED" | "PARSED" | "CROSS_CHECKED";
export type Verdict = "ACCEPTED" | "DISPUTED" | "REJECTED" | "INSUFFICIENT";

export interface CheckSummary { ok: boolean; status: number | null; error: string | null; retracted: boolean; retraction_status: "retracted" | "not_listed" | "unknown" | "not_applicable"; acquisition: string; injection_signals: string[]; wayback: Json }

export function checkSummary(check: JsonObject | null | undefined): CheckSummary | null {
	if (!check) return null;
	const cr = check.crossref as { retracted?: unknown } | null | undefined;
	return {
		ok: check.ok === true, status: typeof check.status === "number" ? check.status : null, error: typeof check.error === "string" ? check.error : null,
		retracted: !!cr && cr.retracted === true,
		retraction_status: !cr ? "not_applicable" : cr.retracted === true ? "retracted" : cr.retracted === false ? "not_listed" : "unknown",
		acquisition: acquisitionStatus(check),
		injection_signals: Array.isArray(check.injection_signals) ? (check.injection_signals as Json[]).map(String) : [],
		wayback: (check.wayback ?? null) as Json,
	};
}

export interface Assessment {
	sources: JsonObject[];
	groups: IndependenceGroup[];
	claims: JsonObject[];
	domains: JsonObject;
	/** Discovery Gap Register: what was not covered and why (never "not found" for "not searched"). */
	discovery_gaps: JsonObject;
}

/** Acquisition outcome of a checked source, kept apart: NOT_FOUND ≠ ACCESS_BLOCKED ≠ UNAVAILABLE ≠ REFUSED. */
export function acquisitionStatus(check: JsonObject | null | undefined): string {
	if (!check) return "NOT_CHECKED";
	if (check.ok === true) return "ACQUIRED";
	const status = typeof check.status === "number" ? check.status : null;
	const err = typeof check.error === "string" ? check.error : "";
	if (/refused|not fetched|not checked/.test(err)) return "REFUSED_BY_POLICY";
	if (status === 404 || status === 410) return "NOT_FOUND";
	if (status === 401 || status === 403 || status === 407 || status === 451) return "ACCESS_BLOCKED";
	if (status === 429 || (status !== null && status >= 500) || /fetch failed|deadline|circuit/.test(err)) return "UNAVAILABLE";
	return "FAILED";
}

/**
 * Assess every host-recorded source of a run: identity, domain, lifecycle stage and verdict, the
 * independence groups, and for each claim how many independent origins support it, what they share,
 * which domains they come from, contradictions, and what evidence is still missing.
 */
export function assessSources(evidence: EvidenceRecord[], claims: Claim[], contradictions: Contradiction[]): Assessment {
	const checks = latestChecks(evidence);
	const records = evidence.filter((e) => !["SOURCE_CHECK", "COMPUTE_RECEIPT", "HOST_REPORTED_ACTION", "USER_APPROVAL"].includes(e.type));
	const ids = records.map((e) => sourceIdentity(e, checks.get(e.id)));
	const byId = new Map(ids.map((i) => [i.evidence_id, i]));
	const groups = independenceGroups(ids);
	const groupOf = new Map<string, IndependenceGroup>();
	for (const g of groups) for (const m of g.members) groupOf.set(m, g);
	const disputedClaims = new Set(contradictions.filter((c) => !c.resolved).flatMap((c) => c.claim_ids));

	const claimViews = claims.map((c) => {
		const support = c.evidence_ids.filter((id) => byId.has(id));
		const supportGroups = [...new Set(support.map((id) => groupOf.get(id)!))];
		const shared = supportGroups.filter((g) => g.members.filter((m) => support.includes(m)).length > 1)
			.map((g) => ({ origin: g.key, evidence_ids: g.members.filter((m) => support.includes(m)), reasons: g.reasons }));
		const domains = [...new Set(support.map((id) => byId.get(id)!.domain ?? "unclassified"))];
		const retracted = support.filter((id) => checkSummary(checks.get(id))?.retracted);
		const unchecked = support.filter((id) => !checks.get(id) && ["url", "doi", "post", "archive"].includes(byId.get(id)!.kind));
		const fringeOnly = support.length > 0 && supportGroups.every((g) => g.members.filter((m) => support.includes(m)).every((m) => byId.get(m)!.domain === "D09"));
		const disputed = c.status === "CONTRADICTED" || disputedClaims.has(c.id);
		let cross: string;
		if (!support.length) cross = "UNSUPPORTED";
		else if (retracted.length) cross = "UNDERMINED";
		else if (disputed) cross = "DISPUTED";
		else if (fringeOnly) cross = "UNCORROBORATED_FRINGE";
		else if (supportGroups.length >= 2) cross = "CORROBORATED";
		else if (support.length > 1) cross = "SINGLE_ORIGIN";
		else cross = "SINGLE_SOURCE";
		const missing: string[] = [];
		if (supportGroups.length < 2) missing.push(support.length > 1 ? `a second independent origin (all ${support.length} sources trace to ${supportGroups[0]?.key ?? "one origin"})` : "a second independent origin");
		if (unchecked.length) missing.push(`a source check (rigorx_check_source) for ${unchecked.join(", ")}`);
		if (!support.some((id) => byId.get(id)!.primary)) missing.push("primary evidence (a DOI/arXiv/PubMed record, or a source declared primary)");
		if (fringeOnly) missing.push("corroboration from outside D09");
		if (disputed) missing.push("resolution of the contradiction");
		if (retracted.length) missing.push(`replacement for retracted ${retracted.join(", ")}`);
		const view: JsonObject = {
			claim_id: c.id, status: c.status, cross_check: cross, supporting_evidence: support, independent_origins: supportGroups.length,
			origins: supportGroups.map((g) => g.key), shared_origins: shared as unknown as Json, domains, contradicted_by_record: disputed, missing,
		};
		if (support.some((id) => byId.get(id)!.domain === "D09")) view.d09_state = D09_STATES[c.status] ?? "UNVERIFIED";
		return view;
	});
	const crossChecked = new Set(claimViews.filter((v) => v.cross_check === "CORROBORATED").flatMap((v) => v.supporting_evidence as string[]));

	const sources = ids.map((i) => {
		const ck = checkSummary(checks.get(i.evidence_id));
		const linkedClaims = claims.filter((c) => c.evidence_ids.includes(i.evidence_id));
		let stage: LifecycleStage = "DISCOVERED";
		if (ck && !ck.ok) stage = "ACQUISITION_FAILED";
		else if (ck) stage = (checks.get(i.evidence_id)!.metadata ? "PARSED" : "ACQUIRED");
		if (stage !== "ACQUISITION_FAILED" && crossChecked.has(i.evidence_id)) stage = "CROSS_CHECKED";
		let verdict: Verdict = "INSUFFICIENT";
		let reason = "not yet corroborated by an independent origin";
		if (ck && !ck.ok) { verdict = "REJECTED"; reason = `acquisition failed: ${ck.error ?? "unknown error"}`; }
		else if (ck?.retracted) { verdict = "REJECTED"; reason = "the work is retracted (Crossref / Retraction Watch)"; }
		else if (linkedClaims.some((c) => c.status === "FAILED")) { verdict = "REJECTED"; reason = "a claim resting on it is FAILED"; }
		else if (linkedClaims.some((c) => c.status === "CONTRADICTED" || disputedClaims.has(c.id))) { verdict = "DISPUTED"; reason = "a claim resting on it is contradicted"; }
		else if (stage === "CROSS_CHECKED" && linkedClaims.some((c) => ["ESTABLISHED", "VERIFIED", "SUPPORTED"].includes(c.status))) { verdict = "ACCEPTED"; reason = "supports a claim together with an independent origin"; }
		else if (!linkedClaims.length) reason = "no claim rests on it yet";
		return {
			evidence_id: i.evidence_id, ref: i.ref, kind: i.kind, canonical: i.canonical, site: i.site, domain: i.domain, domain_basis: i.domain_basis,
			archive: i.archive as unknown as Json, access: i.access, primary: i.primary, origin_group: groupOf.get(i.evidence_id)!.key,
			lifecycle: { stage, verdict, reason }, check: ck as unknown as Json,
		} as JsonObject;
	});
	const domains: JsonObject = {};
	for (const id of DOMAIN_IDS) {
		const d = DOMAINS[id];
		domains[id] = { name: d.name, adapter_status: d.status, sources: ids.filter((i) => i.domain === id).length, not_operational: d.not_operational };
	}
	domains.unclassified = { sources: ids.filter((i) => i.domain === null).length };
	const outcomes: Record<string, string[]> = {};
	for (const i of ids) {
		const st = acquisitionStatus(checks.get(i.evidence_id));
		if (st !== "ACQUIRED") (outcomes[st] ??= []).push(i.evidence_id);
	}
	const discovery_gaps: JsonObject = {
		domains_without_sources: DOMAIN_IDS.filter((id) => !ids.some((i) => i.domain === id)).map((id) => ({
			domain: id, name: DOMAINS[id].name, adapter_status: DOMAINS[id].status,
			gap: DOMAINS[id].status === "CONTRACT_ONLY" ? "NOT_CONNECTED (RIGOR-X has no acquisition path; only the host can record such sources)" : "NO_SOURCES_RECORDED",
		})) as unknown as Json,
		acquisition: outcomes as unknown as Json,
		languages: [...new Set(evidence.map((e) => (typeof e.details.lang === "string" ? e.details.lang : null)).filter(Boolean))] as Json[],
		notice: "RIGOR-X sees only what the host recorded: NO_SOURCES_RECORDED means nothing was recorded, not that nothing exists (NOT_SEARCHED and NOT_FOUND cannot be told apart unless the host reports its searches with rigorx_report_action). NOT_CHECKED sources were never fetched.",
	};
	return { sources, groups, claims: claimViews, domains, discovery_gaps };
}

// ---------------------------------------------------------------- provider adapters (Worker side)

export interface CrossrefRecord {
	doi: string;
	title: string | null;
	publisher: string | null;
	container: string | null;
	type: string | null;
	issued: string | null;
	/** true = retracted/withdrawn, false = Crossref lists no such update, null = could not be determined (unknown is not "no"). */
	retracted: boolean | null;
	updates: { type: string; doi: string | null; date: string | null; source: string | null }[];
	error: string | null;
}

/** Crossref works record for a DOI: bibliographic metadata and editorial updates (retractions, corrections). */
export async function crossrefLookup(doi: string, fetcher: typeof fetch = fetch, o: LookupOptions = {}): Promise<CrossrefRecord> {
	const base: CrossrefRecord = { doi: doi.toLowerCase(), title: null, publisher: null, container: null, type: null, issued: null, retracted: null, updates: [], error: null };
	try {
		const res = await lookupFetch("crossref", `https://api.crossref.org/works/${encodeURIComponent(doi)}`, fetcher, o);
		if (res.status === 404) return { ...base, error: "DOI not registered with Crossref (it may be registered with another agency such as DataCite)" };
		if (!res.ok) return { ...base, error: `Crossref HTTP ${res.status}` };
		const text = await res.text();
		if (text.length > 4_000_000) return { ...base, error: "Crossref record too large" };
		const m = (JSON.parse(text) as { message?: Record<string, unknown> }).message ?? {};
		const first = (v: unknown) => (Array.isArray(v) && typeof v[0] === "string" ? clip(v[0]) : null);
		const date = (v: unknown) => {
			const parts = (v as { "date-parts"?: unknown[][] } | undefined)?.["date-parts"]?.[0];
			return Array.isArray(parts) && parts.length ? parts.map((x, i) => (i === 0 ? String(x) : String(x).padStart(2, "0"))).join("-") : null;
		};
		const updates = (Array.isArray(m["updated-by"]) ? m["updated-by"] : []).slice(0, 20).map((u: Record<string, unknown>) => ({
			type: clip(String(u.type ?? "unknown")).toLowerCase(), doi: typeof u.DOI === "string" ? clip(u.DOI) : null,
			date: date(u.updated), source: typeof u.source === "string" ? clip(u.source) : null,
		}));
		return {
			...base, doi: typeof m.DOI === "string" ? m.DOI.toLowerCase() : base.doi, title: first(m.title), publisher: typeof m.publisher === "string" ? clip(m.publisher) : null,
			container: first(m["container-title"]), type: typeof m.type === "string" ? clip(m.type) : null, issued: date(m.issued),
			retracted: updates.some((u) => u.type === "retraction" || u.type === "withdrawal" || u.type === "removal"), updates,
		};
	} catch (e) {
		return { ...base, error: `Crossref lookup failed: ${e instanceof Error ? e.message : String(e)}` };
	}
}

export interface WaybackRecord { url: string; available: boolean; snapshot_url: string | null; timestamp: string | null; error: string | null }

/** Closest Wayback Machine snapshot of a URL (availability API). */
export async function waybackLookup(url: string, fetcher: typeof fetch = fetch, o: LookupOptions = {}): Promise<WaybackRecord> {
	const base: WaybackRecord = { url, available: false, snapshot_url: null, timestamp: null, error: null };
	try {
		const res = await lookupFetch("wayback", `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, fetcher, o);
		if (!res.ok) return { ...base, error: `Wayback HTTP ${res.status}` };
		const j = (await res.json()) as { archived_snapshots?: { closest?: { available?: boolean; url?: string; timestamp?: string } } };
		const c = j.archived_snapshots?.closest;
		if (!c || !c.available) return base;
		const snap = typeof c.url === "string" && /^https?:\/\/web\.archive\.org\//.test(c.url) ? clip(c.url, 2048) : null;
		return { ...base, available: !!snap, snapshot_url: snap, timestamp: typeof c.timestamp === "string" && /^\d{4,14}$/.test(c.timestamp) ? c.timestamp : null };
	} catch (e) {
		return { ...base, error: `Wayback lookup failed: ${e instanceof Error ? e.message : String(e)}` };
	}
}

function clip(s: string, max = 300): string {
	const t = s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
	return [...t].slice(0, max).join("");
}

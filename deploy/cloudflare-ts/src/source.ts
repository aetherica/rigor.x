// rigorx_check_source (WS32 P1, ADR-007): resolve the source of an evidence record (URL or DOI)
// over the public internet and describe what was retrieved: HTTP status, final URL after redirects,
// content type, size and SHA-256 of the first bytes. A successful check upgrades the evidence from
// "claimed" to "resolved"; it does NOT establish that the source supports the claim.

export interface SourceCheck {
	ok: boolean;
	requested: string;
	resolved_url: string | null;
	final_url: string | null;
	status: number | null;
	content_type: string | null;
	bytes: number;
	truncated: boolean;
	sha256: string | null;
	checked_at: string;
	error: string | null;
}

export const MAX_BYTES = 1_048_576;
export const TIMEOUT_MS = 10_000;

const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*)$/i;

/** The URL to fetch for a source reference, or an error message. DOIs resolve through doi.org. */
export function resolveRef(ref: string): { url: string } | { error: string } {
	const t = ref.trim();
	const doi = /^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/\S+)$/i.exec(t);
	if (doi && !/^https?:\/\/(?!(?:dx\.)?doi\.org)/i.test(t)) return { url: `https://doi.org/${doi[1]}` };
	let u: URL;
	try {
		u = new URL(t);
	} catch {
		return { error: "the source reference is neither an http(s) URL nor a DOI, so it cannot be resolved" };
	}
	if (u.protocol !== "https:" && u.protocol !== "http:") return { error: `only http and https sources can be checked, not ${u.protocol}` };
	if (u.username || u.password) return { error: "URLs with credentials are not fetched" };
	if (PRIVATE_HOST.test(u.hostname)) return { error: "private or local hosts are not fetched" };
	return { url: u.toString() };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const h = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function checkSource(ref: string, fetcher: typeof fetch = fetch, now: () => Date = () => new Date()): Promise<SourceCheck> {
	const base: SourceCheck = {
		ok: false, requested: ref, resolved_url: null, final_url: null, status: null, content_type: null,
		bytes: 0, truncated: false, sha256: null, checked_at: now().toISOString(), error: null,
	};
	const target = resolveRef(ref);
	if ("error" in target) return { ...base, error: target.error };
	base.resolved_url = target.url;
	let response: Response;
	try {
		response = await fetcher(target.url, {
			method: "GET", redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS),
			headers: { "User-Agent": "RIGOR-X source check (+https://github.com/aetherica/rigor.x)", Accept: "*/*" },
		});
	} catch (e) {
		return { ...base, error: `fetch failed: ${e instanceof Error ? e.name === "TimeoutError" ? `no answer within ${TIMEOUT_MS / 1000} s` : e.message : String(e)}` };
	}
	const chunks: Uint8Array[] = [];
	let total = 0;
	let truncated = false;
	if (response.body) {
		const reader = response.body.getReader();
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			const room = MAX_BYTES - total;
			if (value.byteLength > room) {
				chunks.push(value.subarray(0, room));
				total += room;
				truncated = true;
				await reader.cancel();
				break;
			}
			chunks.push(value);
			total += value.byteLength;
		}
	}
	const all = new Uint8Array(total);
	let off = 0;
	for (const c of chunks) { all.set(c, off); off += c.byteLength; }
	const ok = response.status >= 200 && response.status < 300;
	return {
		...base,
		ok,
		final_url: response.url || target.url,
		status: response.status,
		content_type: response.headers.get("content-type"),
		bytes: total,
		truncated,
		sha256: await sha256Hex(all),
		error: ok ? null : `HTTP ${response.status}`,
	};
}

// fetch() for source checks on Node, with the SSRF check made at connection time.
//
// On Cloudflare the platform itself refuses connections to non-public addresses
// (global_fetch_strictly_public), behind the engine's own URL, redirect and DNS checks. Node has no
// such backstop, and a host name can resolve to a public address when the engine checks it and to
// 169.254.169.254 or 127.0.0.1 when the connection is made (DNS rebinding). This fetch therefore
// resolves the host itself and connects only if EVERY resolved address is public, using the same
// address rules as the engine (source.ts blockedIPv4 / blockedIPv6); IP literals are checked too.
// It supports exactly what the shared code uses: GET/HEAD/POST with string bodies, redirect:
// "manual" (redirects are returned, never followed: the engine checks and follows each hop), an
// AbortSignal, and an uncompressed body (Accept-Encoding: identity, so the SHA-256 of what is
// recorded is the SHA-256 of the bytes the server sent).
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { blockedIPv4, blockedIPv6, parseIPv4, parseIPv6 } from "../cloudflare-ts/src/source.ts";

/** Why an address may not be connected to, or null when it is public. */
export function blockedAddress(address: string): string | null {
	const v4 = parseIPv4(address);
	if (v4) return blockedIPv4(v4);
	const v6 = parseIPv6(address);
	if (v6) return blockedIPv6(v6);
	return "not an IP address";
}

export class BlockedAddressError extends Error {
	constructor(host: string, address: string, why: string) {
		super(`refused to connect: ${host} resolves to a non-public address (${why})`);
		this.name = "BlockedAddressError";
		void address;
	}
}

type Resolve = (host: string) => Promise<LookupAddress[]>;
const systemResolve: Resolve = (host) => new Promise((ok, fail) => dnsLookup(host, { all: true, verbatim: true }, (e, a) => (e ? fail(e) : ok(a))));

/** A net lookup function that only ever yields public addresses (all of them must be public). */
export function guardedLookup(resolve: Resolve = systemResolve): LookupFunction {
	return ((hostname: string, options: { all?: boolean }, callback: (...a: unknown[]) => void) => {
		resolve(hostname).then((addresses) => {
			if (!addresses.length) throw Object.assign(new Error(`no address for ${hostname}`), { code: "ENOTFOUND" });
			for (const a of addresses) {
				const why = blockedAddress(a.address);
				if (why) throw new BlockedAddressError(hostname, a.address, why);
			}
			if (options?.all) callback(null, addresses);
			else callback(null, addresses[0]!.address, addresses[0]!.family);
		}).catch((e) => callback(e));
	}) as unknown as LookupFunction;
}

export function createGuardedFetch(resolve: Resolve = systemResolve): typeof fetch {
	const lookup = guardedLookup(resolve);
	const guarded = (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		if (url.protocol !== "http:" && url.protocol !== "https:") return Promise.reject(new TypeError(`unsupported protocol ${url.protocol}`));
		if ((init.redirect ?? "follow") !== "manual") return Promise.reject(new TypeError('guarded fetch only supports redirect: "manual" (each hop is checked by the engine)'));
		const host = url.hostname.replace(/^\[|\]$/g, "");
		if (isIP(host)) {
			const why = blockedAddress(host);
			if (why) return Promise.reject(new BlockedAddressError(host, host, why));
		}
		const headers = new Headers(init.headers);
		headers.set("accept-encoding", "identity");
		const body = init.body;
		if (body !== undefined && body !== null && typeof body !== "string" && !(body instanceof Uint8Array)) {
			return Promise.reject(new TypeError("guarded fetch supports only string or byte bodies"));
		}
		const signal = init.signal ?? undefined;
		return new Promise<Response>((resolveResponse, reject) => {
			if (signal?.aborted) return reject(signal.reason);
			const send = url.protocol === "https:" ? httpsRequest : httpRequest;
			const req = send(url, { method: init.method ?? "GET", headers: Object.fromEntries(headers), lookup, signal }, (res: IncomingMessage) => {
				const out = new Headers();
				for (let i = 0; i < res.rawHeaders.length; i += 2) out.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
				const status = res.statusCode ?? 502;
				const noBody = init.method === "HEAD" || status === 204 || status === 304 || (status >= 100 && status < 200);
				if (noBody) res.resume();
				resolveResponse(new Response(noBody ? null : (Readable.toWeb(res) as ReadableStream), { status, statusText: res.statusMessage ?? "", headers: out }));
			});
			req.on("error", (e) => reject(signal?.aborted ? signal.reason : e));
			if (body !== undefined && body !== null) req.write(body);
			req.end();
		});
	};
	return guarded as typeof fetch;
}

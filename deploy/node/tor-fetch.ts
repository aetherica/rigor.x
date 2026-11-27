// fetch() over Tor for the dark-web layer (DL04): a SOCKS5h client on node:net, so the onion name is
// resolved inside Tor (no DNS lookup on this host, no leak) and nothing outside node: is needed.
//
// It supports what the shared source check uses, like guarded-fetch.ts: GET/HEAD, redirect:
// "manual" (the engine checks and follows each hop), an AbortSignal and an uncompressed body. Only
// .onion hosts are accepted: clearnet sources keep using the guarded fetch, never Tor.
import { request as httpRequest, type IncomingMessage } from "node:http";
import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { Readable } from "node:stream";

export class SocksError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SocksError";
	}
}

const REPLIES: Record<number, string> = {
	1: "general SOCKS server failure", 2: "connection not allowed by ruleset", 3: "network unreachable", 4: "onion service unreachable",
	5: "connection refused", 6: "TTL expired (onion service did not answer)", 7: "command not supported", 8: "address type not supported",
};

/** Parse TOR_SOCKS_URL (socks5h://host:port); the proxy must be on this host or a private network. */
export function parseSocksUrl(raw: string): { host: string; port: number } {
	const u = new URL(raw);
	if (u.protocol !== "socks5h:" && u.protocol !== "socks5:") throw new Error("TOR_SOCKS_URL must be socks5h://host:port");
	const port = Number(u.port || 9050);
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("TOR_SOCKS_URL has an invalid port");
	return { host: u.hostname.replace(/^\[|\]$/g, ""), port };
}

/** Collects the handshake bytes with one listener, so nothing is lost between reads. */
class HandshakeReader {
	private buf = Buffer.alloc(0);
	private waiter: { n: number; ok: (b: Buffer) => void; fail: (e: Error) => void } | null = null;
	private failed: Error | null = null;
	private readonly onData = (d: Buffer) => { this.buf = Buffer.concat([this.buf, d]); this.pump(); };
	private readonly onEnd = () => this.fail(new SocksError("SOCKS proxy closed the connection"));
	private readonly onError = (e: Error) => this.fail(e);
	private readonly sock: Socket;
	constructor(sock: Socket) {
		this.sock = sock;
		sock.on("data", this.onData);
		sock.on("end", this.onEnd);
		sock.on("error", this.onError);
	}
	private fail(e: Error) {
		this.failed = e;
		const w = this.waiter;
		this.waiter = null;
		w?.fail(e);
	}
	private pump() {
		const w = this.waiter;
		if (w && this.buf.length >= w.n) {
			this.waiter = null;
			const out = this.buf.subarray(0, w.n);
			this.buf = this.buf.subarray(w.n);
			w.ok(out);
		}
	}
	read(n: number): Promise<Buffer> {
		if (this.failed) return Promise.reject(this.failed);
		return new Promise((ok, fail) => { this.waiter = { n, ok, fail }; this.pump(); });
	}
	/** Detach; a SOCKS server sends nothing after its reply until the client speaks, so leftovers are an error. */
	detach(): void {
		this.sock.off("data", this.onData);
		this.sock.off("end", this.onEnd);
		this.sock.off("error", this.onError);
		if (this.buf.length) throw new SocksError("unexpected data from the SOCKS proxy after its reply");
	}
}

/** Open a TCP stream to host:port through a SOCKS5 proxy, with the name resolved by the proxy. */
export async function socksConnect(proxy: { host: string; port: number }, host: string, port: number, signal?: AbortSignal): Promise<Socket> {
	if (Buffer.byteLength(host) > 255) throw new SocksError("host name too long for SOCKS5");
	const sock = netConnect({ host: proxy.host, port: proxy.port });
	const abort = () => sock.destroy(signal?.reason instanceof Error ? signal.reason : new Error("aborted"));
	signal?.addEventListener("abort", abort, { once: true });
	try {
		await new Promise<void>((ok, fail) => { sock.once("connect", ok); sock.once("error", fail); });
		const r = new HandshakeReader(sock);
		sock.write(Buffer.from([5, 1, 0])); // version 5, one method: no authentication
		const hello = await r.read(2);
		if (hello[0] !== 5 || hello[1] !== 0) throw new SocksError("SOCKS proxy refused the no-authentication method");
		const name = Buffer.from(host);
		sock.write(Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, Buffer.from([port >> 8, port & 255])]));
		const head = await r.read(4);
		if (head[0] !== 5) throw new SocksError("invalid SOCKS reply");
		if (head[1] !== 0) throw new SocksError(`SOCKS: ${REPLIES[head[1]!] ?? `error ${head[1]}`}`);
		const atyp = head[3];
		const rest = atyp === 1 ? 6 : atyp === 4 ? 18 : atyp === 3 ? (await r.read(1))[0]! + 2 : -1;
		if (rest < 0) throw new SocksError("invalid SOCKS address type in reply");
		await r.read(rest);
		r.detach();
		return sock;
	} catch (e) {
		sock.destroy();
		throw e;
	} finally {
		signal?.removeEventListener("abort", abort);
	}
}

/** A fetch that reaches .onion services through Tor (SOCKS5h). */
export function createTorFetch(socksUrl: string): typeof fetch {
	const proxy = parseSocksUrl(socksUrl);
	const tor = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		if (url.protocol !== "http:" && url.protocol !== "https:") throw new TypeError(`unsupported protocol ${url.protocol}`);
		if (!/\.onion$/i.test(url.hostname)) throw new TypeError("the Tor fetch reaches .onion hosts only");
		if ((init.redirect ?? "follow") !== "manual") throw new TypeError('Tor fetch only supports redirect: "manual" (each hop is checked by the engine)');
		const method = init.method ?? "GET";
		if (method !== "GET" && method !== "HEAD") throw new TypeError("Tor fetch supports GET and HEAD only");
		const signal = init.signal ?? undefined;
		if (signal?.aborted) throw signal.reason;
		const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
		const raw = await socksConnect(proxy, url.hostname, port, signal);
		const stream = url.protocol === "https:" ? tlsConnect({ socket: raw, servername: url.hostname }) : raw;
		const headers = new Headers(init.headers);
		headers.set("accept-encoding", "identity");
		headers.set("connection", "close");
		return new Promise<Response>((resolve, reject) => {
			const req = httpRequest(url, { method, headers: Object.fromEntries(headers), signal, createConnection: () => stream as Socket }, (res: IncomingMessage) => {
				const out = new Headers();
				for (let i = 0; i < res.rawHeaders.length; i += 2) out.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
				const status = res.statusCode ?? 502;
				const noBody = method === "HEAD" || status === 204 || status === 304 || (status >= 100 && status < 200);
				if (noBody) res.resume();
				resolve(new Response(noBody ? null : (Readable.toWeb(res) as ReadableStream), { status, statusText: res.statusMessage ?? "", headers: out }));
			});
			req.on("error", (e) => { stream.destroy(); reject(signal?.aborted ? signal.reason : e); });
			req.end();
		});
	};
	return tor as typeof fetch;
}

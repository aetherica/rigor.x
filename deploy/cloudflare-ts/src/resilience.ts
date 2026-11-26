// Resilience policy (2026-11-27 release directive §4): one typed, validated, documented configuration
// for retries, circuit breakers, deadlines and outbound concurrency, and the mechanisms that use it.
//
// Failure classes are kept apart. Only TRANSIENT failures of IDEMPOTENT outbound reads (HTTP GET to a
// source, Crossref, Wayback, DNS-over-HTTPS) are retried; security, policy, validation, approval and
// integrity failures are never retried, and no engine write is retried (writes are made safe by
// idempotency keys instead, see engine.ts). Breakers, limiter and counters live in the isolate's
// memory: they are best effort (an isolate restart resets them), which is acceptable because they
// only protect upstreams and our own budget; every security decision is made per request.

export interface ResiliencePolicy {
	/** Total attempts for a retryable outbound read (1 = no retry). */
	retryMaxAttempts: number;
	retryBaseDelayMs: number;
	retryMaxDelayMs: number;
	/** Consecutive failures that open an adapter's circuit. */
	cbFailureThreshold: number;
	/** Failure rate (0–1) over the window that opens the circuit, once cbMinRequests were seen. */
	cbFailureRate: number;
	cbMinRequests: number;
	cbWindowMs: number;
	/** How long an open circuit refuses calls before it lets probes through. */
	cbOpenMs: number;
	/** Probes allowed while half-open; that many successes close the circuit. */
	cbHalfOpenProbes: number;
	/** Concurrent outbound source acquisitions per isolate, and how many may wait. */
	acquisitionConcurrency: number;
	acquisitionQueue: number;
	/** Deadline of one rigorx_check_source call (all hops, lookups and retries). */
	sourceDeadlineMs: number;
	/** Per-attempt timeout of a metadata lookup (Crossref, Wayback, DNS). */
	lookupTimeoutMs: number;
}

interface Bound { min: number; max: number; def: number; env: string; doc: string }
/** Defaults and permitted ranges. Values outside the range are rejected (the default is used and the problem reported). */
export const POLICY_BOUNDS: Record<keyof ResiliencePolicy, Bound> = {
	retryMaxAttempts: { min: 1, max: 5, def: 3, env: "RIGORX_RETRY_MAX_ATTEMPTS", doc: "total attempts for a transient outbound read failure" },
	retryBaseDelayMs: { min: 50, max: 2_000, def: 250, env: "RIGORX_RETRY_BASE_DELAY_MS", doc: "base of the exponential backoff (full jitter)" },
	retryMaxDelayMs: { min: 100, max: 10_000, def: 2_000, env: "RIGORX_RETRY_MAX_DELAY_MS", doc: "cap of one backoff delay, also of an honoured Retry-After" },
	cbFailureThreshold: { min: 2, max: 50, def: 5, env: "RIGORX_CB_FAILURE_THRESHOLD", doc: "consecutive failures that open a circuit" },
	cbFailureRate: { min: 0.1, max: 1, def: 0.5, env: "RIGORX_CB_FAILURE_RATE", doc: "failure rate in the window that opens a circuit" },
	cbMinRequests: { min: 2, max: 1_000, def: 10, env: "RIGORX_CB_MIN_REQUESTS", doc: "minimum calls in the window before the rate is used" },
	cbWindowMs: { min: 5_000, max: 600_000, def: 60_000, env: "RIGORX_CB_WINDOW_MS", doc: "sliding window for the failure rate" },
	cbOpenMs: { min: 1_000, max: 600_000, def: 30_000, env: "RIGORX_CB_OPEN_MS", doc: "time a circuit stays open" },
	cbHalfOpenProbes: { min: 1, max: 10, def: 2, env: "RIGORX_CB_HALF_OPEN_PROBES", doc: "probes while half-open" },
	acquisitionConcurrency: { min: 1, max: 16, def: 4, env: "RIGORX_ACQUISITION_CONCURRENCY", doc: "concurrent source acquisitions per isolate (Workers allow 6 open connections per request)" },
	acquisitionQueue: { min: 0, max: 100, def: 16, env: "RIGORX_ACQUISITION_QUEUE", doc: "acquisitions that may wait; beyond it calls are refused (backpressure)" },
	sourceDeadlineMs: { min: 2_000, max: 30_000, def: 15_000, env: "RIGORX_SOURCE_DEADLINE_MS", doc: "deadline of a whole source check" },
	lookupTimeoutMs: { min: 500, max: 10_000, def: 5_000, env: "RIGORX_LOOKUP_TIMEOUT_MS", doc: "per-attempt timeout of a lookup" },
};

export const DEFAULT_POLICY: ResiliencePolicy = Object.fromEntries(
	Object.entries(POLICY_BOUNDS).map(([k, b]) => [k, b.def]),
) as unknown as ResiliencePolicy;

/** Read the policy from Worker vars, validating every bound. Returns the policy and the rejected settings. */
export function policyFromEnv(env: Record<string, unknown>): { policy: ResiliencePolicy; rejected: string[] } {
	const policy = { ...DEFAULT_POLICY };
	const rejected: string[] = [];
	for (const [key, b] of Object.entries(POLICY_BOUNDS) as [keyof ResiliencePolicy, Bound][]) {
		const raw = env[b.env];
		if (raw === undefined || raw === null || raw === "") continue;
		const n = Number(raw);
		if (!Number.isFinite(n) || n < b.min || n > b.max || (key !== "cbFailureRate" && !Number.isInteger(n))) {
			rejected.push(`${b.env}=${String(raw)} is outside ${b.min}..${b.max}; default ${b.def} used`);
			continue;
		}
		policy[key] = n;
	}
	if (policy.retryMaxDelayMs < policy.retryBaseDelayMs) {
		rejected.push(`RIGORX_RETRY_MAX_DELAY_MS < RIGORX_RETRY_BASE_DELAY_MS; defaults used for both`);
		policy.retryBaseDelayMs = DEFAULT_POLICY.retryBaseDelayMs;
		policy.retryMaxDelayMs = DEFAULT_POLICY.retryMaxDelayMs;
	}
	return { policy, rejected };
}

/** Short digest of the effective policy, for logs and /version (configuration version). */
export function policyDigest(p: ResiliencePolicy): string {
	const s = JSON.stringify(Object.keys(p).sort().map((k) => [k, p[k as keyof ResiliencePolicy]]));
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
	return h.toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------- deadlines

export class Deadline {
	readonly at: number;
	private readonly clock: () => number;
	constructor(ms: number, clock: () => number = Date.now) { this.clock = clock; this.at = clock() + ms; }
	remaining(): number { return Math.max(0, this.at - this.clock()); }
	expired(): boolean { return this.remaining() <= 0; }
	/** A signal that fires at min(deadline, perAttemptMs). */
	signal(perAttemptMs = Infinity): AbortSignal { return AbortSignal.timeout(Math.max(1, Math.min(this.remaining(), perAttemptMs))); }
}

// ---------------------------------------------------------------- circuit breaker

export type CircuitState = "closed" | "open" | "half_open";
export interface CircuitEvent { adapter: string; from: CircuitState; to: CircuitState; at: number; reason: string }

export class CircuitBreaker {
	private state: CircuitState = "closed";
	private consecutive = 0;
	private window: { at: number; ok: boolean }[] = [];
	private openedAt = 0;
	private probes = 0;
	private probeSuccesses = 0;
	readonly adapter: string;
	private readonly policy: ResiliencePolicy;
	private readonly onTransition: (e: CircuitEvent) => void;
	private readonly clock: () => number;
	constructor(adapter: string, policy: ResiliencePolicy, onTransition: (e: CircuitEvent) => void = () => undefined, clock: () => number = Date.now) {
		this.adapter = adapter; this.policy = policy; this.onTransition = onTransition; this.clock = clock;
	}

	current(): CircuitState {
		if (this.state === "open" && this.clock() - this.openedAt >= this.policy.cbOpenMs) this.move("half_open", "open period elapsed");
		return this.state;
	}
	/** May a call proceed? Half-open allows a bounded number of probes. */
	allow(): boolean {
		const s = this.current();
		if (s === "closed") return true;
		if (s === "open") return false;
		if (this.probes >= this.policy.cbHalfOpenProbes) return false;
		this.probes++;
		return true;
	}
	success(): void {
		this.record(true);
		this.consecutive = 0;
		if (this.state === "half_open" && ++this.probeSuccesses >= this.policy.cbHalfOpenProbes) this.move("closed", "probes succeeded");
	}
	failure(reason: string): void {
		this.record(false);
		this.consecutive++;
		if (this.state === "half_open") { this.move("open", `probe failed: ${reason}`); return; }
		if (this.state !== "closed") return;
		const fails = this.window.filter((w) => !w.ok).length;
		const rateTrip = this.window.length >= this.policy.cbMinRequests && fails / this.window.length >= this.policy.cbFailureRate;
		if (this.consecutive >= this.policy.cbFailureThreshold || rateTrip) {
			this.move("open", this.consecutive >= this.policy.cbFailureThreshold ? `${this.consecutive} consecutive failures` : `failure rate ${fails}/${this.window.length}`);
		}
	}
	private record(ok: boolean): void {
		const now = this.clock();
		this.window.push({ at: now, ok });
		this.window = this.window.filter((w) => now - w.at < this.policy.cbWindowMs).slice(-1_000);
	}
	private move(to: CircuitState, reason: string): void {
		const from = this.state;
		this.state = to;
		if (to === "open") this.openedAt = this.clock();
		if (to !== "half_open") { this.probes = 0; this.probeSuccesses = 0; }
		if (to === "closed") { this.consecutive = 0; this.window = []; }
		this.onTransition({ adapter: this.adapter, from, to, at: this.clock(), reason });
	}
}

// ---------------------------------------------------------------- outbound calls with retry

export class CircuitOpenError extends Error { override name = "CircuitOpenError"; }
export class DeadlineExceededError extends Error { override name = "DeadlineExceededError"; }

/** HTTP statuses worth retrying for an idempotent read. 500 is not retried: it is the upstream's answer. */
export const RETRYABLE_STATUS = new Set([408, 425, 429, 502, 503, 504]);

export function retryAfterMs(h: string | null, now = Date.now()): number | null {
	if (!h) return null;
	const s = Number(h);
	if (Number.isFinite(s) && s >= 0) return s * 1_000;
	const t = Date.parse(h);
	return Number.isNaN(t) ? null : Math.max(0, t - now);
}

/** Full-jitter exponential backoff: random in [0, min(max, base·2^attempt)]. */
export function backoffMs(attempt: number, p: ResiliencePolicy, rand: () => number = Math.random): number {
	return Math.floor(rand() * Math.min(p.retryMaxDelayMs, p.retryBaseDelayMs * 2 ** attempt));
}

export interface CallOptions {
	policy: ResiliencePolicy;
	deadline: Deadline;
	breaker?: CircuitBreaker;
	perAttemptMs?: number;
	sleep?: (ms: number) => Promise<void>;
	rand?: () => number;
	/** Attempts made, for the caller's receipt. */
	attempts?: { n: number };
}

/**
 * GET-like idempotent call with bounded retries. Retries network errors and RETRYABLE_STATUS answers,
 * honours Retry-After (capped), never sleeps past the deadline, and reports every attempt's outcome to
 * the adapter's breaker. A non-retryable answer (any other status) is returned as it is.
 */
export async function resilientFetch(fetcher: typeof fetch, url: string, init: RequestInit, o: CallOptions): Promise<Response> {
	const sleep = o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
	let last: unknown = null;
	for (let attempt = 0; attempt < o.policy.retryMaxAttempts; attempt++) {
		if (o.deadline.expired()) throw new DeadlineExceededError("deadline exceeded before the call");
		if (o.breaker && !o.breaker.allow()) throw new CircuitOpenError(`circuit open for ${o.breaker.adapter}`);
		if (o.attempts) o.attempts.n++;
		let wait: number | null = null;
		try {
			const res = await fetcher(url, { ...init, signal: o.deadline.signal(o.perAttemptMs) });
			if (!RETRYABLE_STATUS.has(res.status)) {
				o.breaker?.success();
				return res;
			}
			o.breaker?.failure(`HTTP ${res.status}`);
			last = res;
			wait = retryAfterMs(res.headers.get("retry-after"));
			if (attempt + 1 < o.policy.retryMaxAttempts) await res.body?.cancel().catch(() => undefined);
		} catch (e) {
			if (o.deadline.expired()) throw new DeadlineExceededError("deadline exceeded");
			o.breaker?.failure(e instanceof Error ? e.name : "error");
			last = e;
		}
		if (attempt + 1 >= o.policy.retryMaxAttempts) break;
		const delay = Math.min(o.policy.retryMaxDelayMs, wait ?? backoffMs(attempt, o.policy, o.rand));
		if (delay >= o.deadline.remaining()) break; // no time left for another attempt
		await sleep(delay);
	}
	if (last instanceof Response) return last;
	throw last instanceof Error ? last : new Error("outbound call failed");
}

// ---------------------------------------------------------------- bulkhead / backpressure

export class ResourceExhaustedError extends Error { override name = "ResourceExhaustedError"; }

/** Counting semaphore with a bounded wait queue: excess work is refused, not queued without limit. */
export class Limiter {
	private active = 0;
	private readonly waiting: (() => void)[] = [];
	private readonly max: number;
	private readonly queue: number;
	constructor(max: number, queue: number) { this.max = max; this.queue = queue; }
	get inFlight(): number { return this.active; }
	async run<T>(fn: () => Promise<T>): Promise<T> {
		if (this.active >= this.max) {
			if (this.waiting.length >= this.queue) throw new ResourceExhaustedError("too many source checks in progress; retry shortly");
			await new Promise<void>((r) => this.waiting.push(r));
		}
		this.active++;
		try {
			return await fn();
		} finally {
			this.active--;
			this.waiting.shift()?.();
		}
	}
}

// ---------------------------------------------------------------- isolate registry

/** Per-isolate breakers (one per adapter), limiter and a bounded event log for observability. */
export class ResilienceRegistry {
	readonly events: CircuitEvent[] = [];
	private readonly breakers = new Map<string, CircuitBreaker>();
	readonly limiter: Limiter;
	readonly policy: ResiliencePolicy;
	private readonly log: (e: CircuitEvent) => void;
	constructor(policy: ResiliencePolicy, log: (e: CircuitEvent) => void = () => undefined) {
		this.policy = policy; this.log = log;
		this.limiter = new Limiter(policy.acquisitionConcurrency, policy.acquisitionQueue);
	}
	breaker(adapter: string): CircuitBreaker {
		let b = this.breakers.get(adapter);
		if (!b) {
			if (this.breakers.size >= 200) this.breakers.delete(this.breakers.keys().next().value!); // bound per-host breakers
			b = new CircuitBreaker(adapter, this.policy, (e) => { this.events.push(e); if (this.events.length > 100) this.events.shift(); this.log(e); });
			this.breakers.set(adapter, b);
		}
		return b;
	}
	states(): Record<string, CircuitState> {
		return Object.fromEntries([...this.breakers].map(([k, b]) => [k, b.current()]));
	}
}

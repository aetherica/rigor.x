// Provisional per-owner limits from the Worker's vars (wrangler.jsonc); see QuotaLimits in engine.ts.
import { DEFAULT_LIMITS, type QuotaLimits } from "./engine.ts";

export interface LimitVars {
	RIGORX_CALLS_PER_DAY?: string;
	RIGORX_RUNS_PER_DAY?: string;
	RIGORX_STORED_RUNS?: string;
	RIGORX_BURST_PER_MINUTE?: string;
	RIGORX_FETCHES_PER_DAY?: string;
}

/** A missing or invalid value (not a positive safe integer) falls back to the default. */
export function limitsFromEnv(env: LimitVars): QuotaLimits {
	const pick = (value: string | undefined, fallback: number) => {
		const n = Number(value);
		return value !== undefined && Number.isSafeInteger(n) && n > 0 ? n : fallback;
	};
	return {
		callsPerDay: pick(env.RIGORX_CALLS_PER_DAY, DEFAULT_LIMITS.callsPerDay),
		runsPerDay: pick(env.RIGORX_RUNS_PER_DAY, DEFAULT_LIMITS.runsPerDay),
		storedRuns: pick(env.RIGORX_STORED_RUNS, DEFAULT_LIMITS.storedRuns),
		burstPerMinute: pick(env.RIGORX_BURST_PER_MINUTE, DEFAULT_LIMITS.burstPerMinute),
		fetchesPerDay: pick(env.RIGORX_FETCHES_PER_DAY, DEFAULT_LIMITS.fetchesPerDay),
	};
}

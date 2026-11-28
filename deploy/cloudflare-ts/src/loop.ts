// Loop, repeat and stall detection (WS19). Ported from src/rigorx/reasoning_guard.py, which kept its
// counters in memory. The engine cannot: every tool call is a fresh isolate, so the history lives in
// the run snapshot and these functions are pure over it.
//
// What this detects is a NORMALIZED REPEAT — the same state submitted again, ignoring case, spacing
// and punctuation — and a lack of progress across a window. It is not semantic-equivalence
// detection: a host that rewords the same failed approach is not caught, which is why the engine
// also keeps hard budgets (re-entries, OPTIMIZE cycles) underneath.

import type { Json, JsonObject } from "./text.ts";

export const LOOP_REPEAT_LIMIT = 3;
/** Validations whose progress is compared before calling it a stall. */
export const LOOP_STALL_WINDOW = 3;
/** Fingerprints kept per loop kind; a run that exceeds this is already past every budget. */
const MAX_TRACKED = 64;

export type LoopAction = "continue" | "diversify" | "repeated" | "stalled";

/** Per-kind history, stored in the run snapshot. Absent on runs started before this existed. */
export interface LoopHistory {
	/** Normalized-state fingerprint (16 hex characters) to how often it has been seen. */
	counts: Record<string, number>;
	/** Progress values in submission order, for the stall window. */
	progress: number[];
}
export interface LoopSignal {
	action: LoopAction;
	repeats: number;
	fingerprint: string;
	steps: number;
	best_progress: number | null;
	reason: string;
}

export const emptyHistory = (): LoopHistory => ({ counts: {}, progress: [] });

/** Normalize superficial differences only: case, width, whitespace and punctuation. */
export function normalizeState(state: string): string {
	return state.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}_]+/gu, " ").replace(/\s+/g, " ").trim();
}

/**
 * A fingerprint of the normalized state. FNV-1a, not SHA-256, and deliberately: each engine
 * operation runs inside one synchronous SQLite transaction, and crypto.subtle is asynchronous, so a
 * digest here would break that atomicity. This value is never a security boundary — only the owner
 * writes their own run, and it is only ever compared for equality — so a non-cryptographic hash is
 * the right tool. A collision would at worst mis-count one repeat.
 */
export function fingerprintState(state: string): string {
	const normalized = normalizeState(state);
	if (!normalized) throw new Error("a reasoning state must not be empty");
	let h1 = 0x811c9dc5, h2 = 0x01000193;
	for (let i = 0; i < normalized.length; i++) {
		const c = normalized.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
		h2 = Math.imul(h2 ^ ((c << 5) | (c >>> 11)), 0x85ebca6b) >>> 0;
	}
	return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/**
 * Record one state in `history` (mutated) and say what it means. `progress` is a number that should
 * rise as the run gets closer to done (for validation: how many must-requirements are met); when the
 * window is full and it has not moved, the run is stalled.
 */
export function observeLoop(history: LoopHistory, fingerprint: string, progress?: number | null,
	opts: { repeatLimit?: number; stallWindow?: number } = {}): LoopSignal {
	const repeatLimit = opts.repeatLimit ?? LOOP_REPEAT_LIMIT;
	const stallWindow = opts.stallWindow ?? LOOP_STALL_WINDOW;
	const repeats = (history.counts[fingerprint] ?? 0) + 1;
	history.counts[fingerprint] = repeats;
	// Keep the map bounded without losing the fingerprint being judged right now.
	const keys = Object.keys(history.counts);
	if (keys.length > MAX_TRACKED) for (const k of keys.slice(0, keys.length - MAX_TRACKED)) if (k !== fingerprint) delete history.counts[k];
	if (typeof progress === "number" && Number.isFinite(progress)) {
		history.progress.push(progress);
		if (history.progress.length > stallWindow) history.progress = history.progress.slice(-stallWindow);
	}
	const steps = Object.values(history.counts).reduce((a, b) => a + b, 0);
	const best = history.progress.length ? Math.max(...history.progress) : null;
	const window = history.progress;
	const stalled = window.length >= stallWindow && Math.max(...window) - Math.min(...window) <= 0;
	let action: LoopAction, reason: string;
	if (repeats > repeatLimit) { action = "repeated"; reason = `the same state has now been submitted ${repeats} times`; }
	else if (stalled) { action = "stalled"; reason = `progress has not improved across the last ${stallWindow} attempts`; }
	else if (repeats === repeatLimit) { action = "diversify"; reason = `this is the ${repeats}${repeats === 2 ? "nd" : "rd"} identical attempt: change the approach, not the wording`; }
	else { action = "continue"; reason = "within the configured limits"; }
	return { action, repeats, fingerprint, steps, best_progress: best, reason };
}

export const loopHistory = (store: Record<string, LoopHistory> | undefined, kind: string): LoopHistory =>
	(store && store[kind]) || emptyHistory();

/** The part of a loop signal worth returning to the host. */
export const loopView = (signal: LoopSignal): JsonObject =>
	({ action: signal.action, repeats: signal.repeats, reason: signal.reason, best_progress: signal.best_progress as Json });

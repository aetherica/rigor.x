// Shared validation, text policy and error helpers for the engine (WS32).
import { createHash } from "node:crypto";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export class EngineError extends Error {
	code = "ENGINE_ERROR";
	override name = "EngineError";
	constructor(message: string, code?: string) {
		super(message);
		if (code) this.code = code;
	}
}
export const invalid = (m: string) => new EngineError(m, "INVALID_REQUEST");
export const conflict = (m: string) => new EngineError(m, "STAGE_CONFLICT");
export const limit = (m: string) => new EngineError(m, "LIMIT_EXCEEDED");
export const quota = (m: string) => new EngineError(m, "QUOTA_EXCEEDED");
export const notFound = () => new EngineError("Run not found", "RUN_NOT_FOUND");

export const digest = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
/** Python `len(str)` counts code points; JS `.length` counts UTF-16 units. */
export const chars = (text: string) => [...text].length;

/** Minimum substance for host-submitted text. */
export interface TextPolicy {
	minSummaryChars: number;
	minSummaryWords: number;
	minNoteChars: number;
	minNoteWords: number;
	distinctSummaries: boolean;
}
export const DEFAULT_TEXT_POLICY: TextPolicy = { minSummaryChars: 40, minSummaryWords: 6, minNoteChars: 15, minNoteWords: 3, distinctSummaries: true };
export const RELAXED_TEXT_POLICY: TextPolicy = { minSummaryChars: 0, minSummaryWords: 0, minNoteChars: 0, minNoteWords: 0, distinctSummaries: false };

// Scripts written without spaces between words (Unicode blocks: Thai, Lao, Tibetan, Myanmar, Khmer,
// Hiragana, Katakana, CJK ideographs incl. supplementary planes, halfwidth Katakana): each of their
// characters counts as one word unit, so the word minimum reduces to the character minimum (WS32 N3).
const SPACELESS = /[฀-໿ༀ-࿿က-႟ក-៿᧠-᧿぀-ヿㇰ-ㇿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ\u{20000}-\u{3134F}]/gu;
export function words(value: string): number {
	let total = 0;
	for (const token of value.split(/\s+/)) {
		if (!token) continue;
		const spaceless = token.match(SPACELESS)?.length ?? 0;
		total += spaceless + (/[\p{L}\p{N}]/u.test(token.replace(SPACELESS, "")) ? 1 : 0);
	}
	return total;
}
export const normalized = (value: string) => value.toLowerCase().split(/\s+/).filter(Boolean).join(" ");

/** NFKC, case-folded, punctuation-stripped fingerprint (as src/rigorx/reasoning_guard.py): superficial edits do not count as progress. */
export function fingerprint(value: string): string {
	const v = value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
	return digest(v);
}

export function substantial(name: string, value: string, minChars: number, minWords: number, hint: string): void {
	const trimmed = value.trim();
	if (chars(trimmed) < minChars || words(trimmed) < minWords) {
		throw invalid(`${name} is too short: use at least ${minChars} characters and ${minWords} words (${hint})`);
	}
}

export function text(name: string, value: unknown, maxChars: number, required = true): string {
	if ((value === undefined || value === null) && !required) return "";
	if (typeof value !== "string") throw invalid(`${name} must be text`);
	if (required && !value.trim()) throw invalid(`${name} is required`);
	if (chars(value) > maxChars) throw limit(`${name} exceeds ${maxChars} characters`);
	return value;
}

export function list(name: string, value: unknown, max: number, required = true): unknown[] {
	if ((value === undefined || value === null) && !required) return [];
	if (!Array.isArray(value)) throw invalid(`${name} must be a list`);
	if (value.length > max) throw limit(`${name} has more than ${max} entries`);
	return value;
}

/**
 * Hosts that cached an older tool schema (no `data` parameter, for example) may send a structured
 * argument as a JSON string. A string that parses to the expected JSON shape is accepted as that value.
 */
export function jsonish(value: unknown): unknown {
	if (typeof value !== "string") return value;
	const s = value.trim();
	if (!(s.startsWith("{") || s.startsWith("["))) return value;
	try {
		return JSON.parse(s) as unknown;
	} catch {
		return value;
	}
}

export function object(name: string, value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid(`${name} must be an object`);
	return value as Record<string, unknown>;
}

const ID = /^[A-Za-z][A-Za-z0-9_.-]{0,31}$/;
export function ident(name: string, value: unknown): string {
	if (typeof value !== "string" || !ID.test(value)) throw invalid(`${name} must be an ID such as R1 or op-2 (letter first, at most 32 characters)`);
	return value;
}

export const EVIDENCE_ID = /^ev-[1-9][0-9]{0,6}$/;
export function evidenceIds(name: string, value: unknown, known: ReadonlySet<string>, required = true): string[] {
	const ids = list(name, value, 100, required);
	const out: string[] = [];
	for (const [i, v] of ids.entries()) {
		if (typeof v !== "string" || !EVIDENCE_ID.test(v)) throw invalid(`${name}[${i}] must be an evidence ID (ev-N)`);
		if (!known.has(v)) throw invalid(`${name}[${i}]: ${v} does not exist in this run`);
		if (!out.includes(v)) out.push(v);
	}
	return out;
}

/** A host text stored only as its digest and length, after the note-substance check. */
export interface StoredText {
	sha256: string;
	chars: number;
}
export function storedNote(name: string, value: unknown, policy: TextPolicy, maxChars: number, hint: string): StoredText {
	const t = text(name, value, maxChars);
	substantial(name, t, policy.minNoteChars, policy.minNoteWords, hint);
	return { sha256: digest(t), chars: chars(t) };
}

export function oneOf<T extends string>(name: string, value: unknown, options: readonly T[]): T {
	if (typeof value !== "string" || !(options as readonly string[]).includes(value)) throw invalid(`${name} must be one of ${JSON.stringify(options)}`);
	return value as T;
}

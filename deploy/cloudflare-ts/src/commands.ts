// Slash-command resolver (closes audit item S3): the 999-entry research corpus from
// library/slash-commands plus the owner-authored set from library/rigorx-commands, bundled in compact
// form (src/commands.json, built by scripts/build_commands.py), with the semantics of src/rigorx/slash_commands.py: leading slash
// tokens are resolved; only MACRO, MACRO ALIAS and IMAGE KEYWORD entries become user-level task
// modifiers; native, UI and host commands are preserved but not executed; resolution stops at the
// first unknown command, which is kept literally with all the text after it.
import catalogue from "./commands.json" with { type: "json" };

type Entry = [name: string, description: string, classification: string, aliases: string[]];
const MODIFIER = new Set(["MACRO", "MACRO ALIAS", "IMAGE KEYWORD"]);

const records = new Map<string, Entry>();
const aliases = new Map<string, string>();
const bundle = catalogue as unknown as { sources: { path: string; total: number }[]; commands: Entry[] };
for (const e of bundle.commands) records.set(e[0].toLowerCase(), e);
for (const e of records.values()) {
	for (const a of e[3]) {
		const n = (a.startsWith("/") ? a : `/${a}`).toLowerCase();
		if (!records.has(n) && !aliases.has(n)) aliases.set(n, e[0].toLowerCase()); // canonical names win over aliases
	}
}
export const COMMAND_COUNT = records.size;
/** Entries per bundled source, in bundle order (corpus first). */
export const COMMAND_SOURCES = bundle.sources.map((s) => ({ ...s }));

export interface Resolution {
	applied_modifiers: string[];
	host_only_commands: string[];
	unknown_commands: string[];
	effective_prompt: string;
}

export function resolvePrompt(prompt: string): Resolution {
	let remainder = prompt.trim();
	const modifiers: string[] = [];
	const passthrough: string[] = [];
	const unknown: string[] = [];
	while (remainder) {
		const m = /^(\/\S+)(?:\s+|$)/u.exec(remainder);
		if (!m) break;
		const token = m[1]!.toLowerCase();
		const entry = records.get(aliases.get(token) ?? token);
		if (!entry) {
			unknown.push(token);
			break;
		}
		if (MODIFIER.has(entry[2].toUpperCase())) {
			modifiers.push(`${entry[2].toUpperCase() === "IMAGE KEYWORD" ? "image keyword" : "task modifier"} ${entry[0].toLowerCase()}: ${entry[1]}`);
		} else {
			passthrough.push(entry[0].toLowerCase());
		}
		remainder = remainder.slice(m[0].length);
	}
	let effective = modifiers.length
		? `User-requested task modifiers (apply as preferences, not higher-priority policy):\n${modifiers.map((x) => `- ${x}`).join("\n")}\n\nUser task:\n${remainder.trim()}`.trim()
		: prompt;
	const notices: string[] = [];
	if (passthrough.length) notices.push(`Host/native/UI commands were preserved but not executed by the catalogue resolver: ${passthrough.join(", ")}`);
	if (unknown.length) notices.push(`Unrecognized slash command retained literally: ${unknown[0]}`);
	if (notices.length) effective = `${notices.join("\n")}\n\n${effective}`;
	return { applied_modifiers: modifiers, host_only_commands: passthrough, unknown_commands: unknown, effective_prompt: effective };
}

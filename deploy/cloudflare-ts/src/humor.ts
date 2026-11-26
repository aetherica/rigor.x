// Humor policy (WS32, directive §13): a deterministic appropriateness gate for humor in a reply.
// RIGOR-X makes no model calls (owner decision), so it does not write jokes: the host model does.
// What RIGOR-X decides, from the context the host declares, is whether humor is appropriate at all,
// how strong it may be, which styles are allowed or blocked, and why. Grounding [B, established]:
// humor needs a resolvable incongruity that is benign for this audience (Raskin 1985; Attardo &
// Raskin 1991; McGraw & Warren 2010), so the risk is contextual. The table below is a heuristic
// policy, not a validated model of what people find funny; user feedback adjusts it within bounds.
//
// Rules, most restrictive wins:
// - Unknown context suppresses humor (unknown is not "safe").
// - Emergencies, bereavement, medical, legal, security incidents, sensitive personal topics, a
//   distressed user or an explicit "no humor" preference suppress humor.
// - Otherwise each context caps the intensity (0 none … 3 playful); the user's preference and the
//   audience cap it further; a negative reaction to earlier humor lowers it by one.
// - Some styles are never allowed: humor that humiliates, targets identity, or could be mistaken
//   for fact; sarcasm at the user's expense.

export const POLICY_VERSION = "1.0.0";
export const CONTEXTS = [
	"emergency", "bereavement", "medical", "legal", "security_incident", "sensitive_personal",
	"negotiation", "professional", "debugging", "education", "casual", "creative",
] as const;
export type Context = (typeof CONTEXTS)[number];
export const STYLES = ["analogy", "understatement", "self_deprecating", "wordplay", "absurdist", "irony", "satire", "sarcasm", "dark"] as const;
export type Style = (typeof STYLES)[number];
export const NEVER = ["humiliating", "identity_targeting", "misleading_as_fact", "sarcasm_at_user"] as const;

const SUPPRESS: ReadonlySet<Context> = new Set(["emergency", "bereavement", "medical", "legal", "security_incident", "sensitive_personal"]);
const CAP: Record<Context, number> = {
	emergency: 0, bereavement: 0, medical: 0, legal: 0, security_incident: 0, sensitive_personal: 0,
	negotiation: 1, professional: 1, debugging: 1, education: 2, casual: 2, creative: 3,
};
const BY_INTENSITY: Record<number, Style[]> = {
	0: [],
	1: ["analogy", "understatement", "self_deprecating"],
	2: ["analogy", "understatement", "self_deprecating", "wordplay", "absurdist", "irony"],
	3: ["analogy", "understatement", "self_deprecating", "wordplay", "absurdist", "irony", "satire"],
};

export interface HumorInput {
	contexts: Context[];
	audience?: "individual" | "group" | "public";
	user_preference?: "none" | "light" | "playful";
	user_distress?: boolean;
	last_reaction?: "positive" | "neutral" | "negative";
	multilingual_audience?: boolean;
}
export interface HumorDecision {
	decision: "suppress" | "allow";
	max_intensity: number;
	allowed_styles: Style[];
	blocked_styles: string[];
	reasons: string[];
	guidance: string;
	policy_version: string;
}

export function humorPolicy(input: HumorInput): HumorDecision {
	const reasons: string[] = [];
	let cap = 3;
	const suppress = (why: string) => { reasons.push(why); cap = 0; };
	if (!input.contexts.length) suppress("no context was declared: unknown context is not treated as safe");
	for (const c of input.contexts) {
		if (SUPPRESS.has(c)) suppress(`context ${c}: humor could hurt, mislead or look careless`);
		else if (CAP[c] < cap) { cap = CAP[c]; reasons.push(`context ${c} caps intensity at ${CAP[c]}`); }
	}
	if (input.user_distress) suppress("the user appears distressed");
	if (input.user_preference === "none") suppress("the user asked for no humor");
	if (input.user_preference === "light" && cap > 1) { cap = 1; reasons.push("the user prefers light humor"); }
	if (input.user_preference === undefined && cap > 2) { cap = 2; reasons.push("no stated preference for playful humor"); }
	if (input.audience === "public" && cap > 1) { cap = 1; reasons.push("public audience: humor is read without context"); }
	if (input.audience === "group" && cap > 2) { cap = 2; reasons.push("group audience"); }
	if (input.last_reaction === "negative" && cap > 0) { cap -= 1; reasons.push("the user reacted negatively to earlier humor"); }
	const allowed = [...BY_INTENSITY[cap]!];
	const blocked: string[] = [...NEVER];
	for (const s of STYLES) if (!allowed.includes(s)) blocked.push(s);
	if ((input.multilingual_audience || input.audience === "public") && allowed.includes("wordplay")) {
		allowed.splice(allowed.indexOf("wordplay"), 1);
		blocked.push("wordplay");
		reasons.push("wordplay does not survive translation or a mixed-language audience");
	}
	const decision = cap === 0 ? "suppress" : "allow";
	const guidance = decision === "suppress"
		? "Use no humor in this reply."
		: `Humor is optional, never required: at most intensity ${cap} of 3, only if it makes the point clearer or the exchange warmer, never at the user's expense, never in a way that could be taken as fact. Styles: ${allowed.join(", ")}.`;
	return { decision, max_intensity: cap, allowed_styles: allowed, blocked_styles: [...new Set(blocked)], reasons, guidance, policy_version: POLICY_VERSION };
}

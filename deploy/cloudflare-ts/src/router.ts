// Deterministic, inspectable routing heuristics (seed only). Intent keywords are English, so a task
// with no intent signal — every task in most other languages — is UNKNOWN, not "simple": its level
// seed is L02_STANDARD and CLASSIFY must declare a level and stakes (WS32 N2, directive §2.2).
// The level can only rise from here. Derived from src/rigorx/adaptive_router.py (frozen v1).
//
// Risk floor (2026-11-26 audit, finding F): risk vocabulary is matched in English and in ten other
// widely used languages (the same categories in each: medical, legal, financial, security,
// emergency), and an explicit level (a /l01-style token or an override argument) can lower the level
// only down to the task's risk floor: L03_DEEP when any risk term appears, L05_CRITICAL when risk
// meets a destructive or irreversible action (delete, transfer, deploy to production, …) or three or
// more risk terms appear. Keyword lists are a heuristic: misspelt, spaced-out or paraphrased risk
// language is not detected, which is why CLASSIFY stakes set a second, host-declared floor.

export type TaskIntent =
	| "INFORMATION" | "RESEARCH" | "ANALYSIS" | "DECISION" | "EXECUTION"
	| "CREATIVE" | "TECHNICAL" | "COMMUNICATION" | "UNKNOWN";
export type AdaptiveLevel =
	| "L01_BASIC" | "L02_STANDARD" | "L03_DEEP" | "L04_COMPLEX" | "L05_CRITICAL" | "L06_HYPER_RIGOROUS";

export interface AdaptiveProfile {
	intent: TaskIntent;
	modes: string[];
	level: AdaptiveLevel;
	methods: string[];
	signals: string[];
	risk_score: number;
	explicit_override: boolean;
}

const INTENT_ORDER: TaskIntent[] = ["INFORMATION", "RESEARCH", "ANALYSIS", "DECISION", "EXECUTION", "CREATIVE", "TECHNICAL", "COMMUNICATION", "UNKNOWN"];

const PATTERNS: Array<[TaskIntent, string[]]> = [
	["RESEARCH", ["research", "investigat", "latest", "sources?", "citation", "verif(?:y|ies|ied|ying)\\b", "fact.?check", "look up"]],
	["ANALYSIS", ["analy[sz]", "diagnos", "root cause", "audit", "why\\b", "evaluate", "assess"]],
	["DECISION", ["recommend", "should i", "which .*best", "choose", "decision", "trade.?off", "pros.?cons"]],
	["EXECUTION", ["execute", "perform", "do this", "send(?:s|ing)?\\b", "book(?:s|ed|ing)?\\b", "creat(?:e|es|ed|ing)\\b", "updat(?:e|es|ed|ing)\\b", "delet(?:e|es|ed|ing)\\b", "schedule", "submit", "run this"]],
	["TECHNICAL", ["cod(?:e|es|ing)\\b", "debug", "program", "apis?\\b", "database", "deploy", "architecture", "software", "scripts?\\b"]],
	["CREATIVE", ["write", "draft", "story", "brainstorm", "creative", "design"]],
	["COMMUNICATION", ["email", "message", "translate", "rewrite", "polish", "respond to"]],
];
const MODE_PATTERNS: Array<[string, string[]]> = [
	["EXPLORATORY", ["explor", "discover", "brainstorm", "research", "investigat"]],
	["DESCRIPTIVE", ["describe", "summarize", "overview", "explain", "what is"]],
	["DIAGNOSTIC", ["diagnos", "troubleshoot", "root cause", "problem analysis"]],
	["CAUSAL", ["caus", "impact", "effect", "why did", "why does"]],
	["HISTORICAL", ["histor", "timeline", "over time", "origin", "evolution"]],
	["COMPARATIVE", ["compar", "versus", "vs\\b", "trade.?off", "pros.?cons"]],
	["QUANTITATIVE", ["quantit", "statistic", "calculate", "numeric", "data analysis", "measure"]],
	["QUALITATIVE", ["qualit", "interview", "narrative", "theme analysis", "perception"]],
	["FORENSIC", ["forensic", "full audit", "evidence trail", "trace", "investigation"]],
	["SYSTEMS", ["system", "ecosystem", "interdepend", "feedback loop", "network"]],
	["STRATEGIC", ["strateg", "competitive", "positioning", "geopolit", "long.?term"]],
	["ACTION_RESEARCH", ["implement", "intervention", "field test", "action plan", "deploy"]],
];
const RISK_PATTERNS = [
	"medical", "health", "diagnos", "medication", "legal", "lawyer", "financial",
	"investment", "banks?\\b", "security", "credential", "password", "privacy",
	"safety", "emergency", "irreversible", "delete permanently", "production system",
	// WS32 N2: security and incident vocabulary the original list missed ("authentication bypass" scored 0).
	"authenticat", "authoriz", "bypass", "vulnerab", "exploit", "breach", "leak", "secret",
	"tokens?\\b", "privilege", "malware", "incident", "encrypt",
];
// Same risk categories in other languages (WS32 decision: language-agnostic, not one language special-cased).
// Matched at a Unicode word start (a term may be a stem); Han and Kana terms are matched as substrings.
const RISK_TERMS_MULTILINGUAL = [
	// Bengali
	"ব্যাংক", "পাসওয়ার্ড", "ওষুধ", "ডাক্তার", "চিকিৎসা", "রোগ", "ডোজ", "আইন", "মামলা", "আদালত", "বিনিয়োগ", "ঋণ", "নিরাপত্তা", "হ্যাক", "জরুরি", "গোপন",
	// Hindi
	"बैंक", "पासवर्ड", "दवा", "डॉक्टर", "इलाज", "कानून", "अदालत", "निवेश", "सुरक्षा", "आपातकाल", "कर्ज",
	// Spanish, Portuguese, French, German
	"médic", "medicament", "salud", "abogad", "contraseña", "inversi", "segurid", "emergencia", "diagnóstic",
	"saúde", "advogad", "senha", "investiment", "seguranç", "emergência",
	"santé", "avocat", "juridique", "banque", "mot de passe", "investiss", "sécurité", "urgence",
	"medizin", "gesundheit", "rechtlich", "anwalt", "passwort", "kennwort", "investition", "sicherheit", "notfall",
	// Russian, Arabic
	"медицин", "лекарств", "врач", "юрид", "адвокат", "банк", "парол", "инвест", "безопасност", "экстрен",
	"طبي", "دواء", "طبيب", "قانون", "محام", "بنك", "كلمة المرور", "استثمار", "أمن", "طوارئ",
	// Chinese, Japanese (substring)
	"医疗", "药", "医生", "法律", "律师", "银行", "密码", "投资", "安全", "紧急", "诊断", "漏洞",
	"医療", "薬", "医者", "弁護士", "銀行", "パスワード", "投資", "セキュリティ", "緊急",
];
/** Destructive or irreversible actions: with any risk term they raise the floor to L05. */
const DESTRUCTIVE_TERMS = [
	"delet", "drop", "wipe", "erase", "destroy", "truncate", "rm -rf", "format", "overwrite", "revoke", "rotate", "shut down", "shutdown",
	"transfer", "wire", "pay", "purchase", "buy", "sell", "withdraw", "send money", "deploy", "production", "irreversibl", "permanent",
	"মুছে", "মুছ", "ডিলিট", "স্থায়ী", "স্থানান্তর", "বিক্রি", "পাঠা", "हटा", "डिलीट", "स्थानांतर", "भेज",
	"elimin", "borra", "transfier", "supprim", "efface", "virement", "lösch", "überweis", "exclu", "apag",
	"удал", "перевод", "حذف", "تحويل", "删除", "转账", "削除", "送金",
];
const SPACELESS_TERM = /[\u3040-\u30ff\u3400-\u9fff]/u;
/** Terms of `list` found in `text`: one combined pre-check, then per-term tests only when it matches. */
const combined = new Map<readonly string[], RegExp>();
// Verbs that destroy data whatever the context; critical even when the intent is unclear ("wipe the server").
const STRONG_DESTRUCTIVE = new Set(["delet", "drop", "wipe", "erase", "destroy", "truncate", "rm -rf", "মুছে", "মুছ", "ডিলিট", "हटा", "डिलीट",
	"elimin", "borra", "supprim", "efface", "lösch", "apag", "удал", "حذف", "删除", "削除"]);
function hits(list: readonly string[], text: string): string[] {
	let any = combined.get(list);
	if (!any) {
		any = new RegExp(list.map((t) => termRx(t).source).join("|"), "u");
		combined.set(list, any);
	}
	return any.test(text) ? list.filter((t) => termRx(t).test(text)) : [];
}
const termRx = (t: string) => rx(SPACELESS_TERM.test(t) ? t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : `(?<![\\p{L}\\p{M}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u");

const HYPER_PATTERNS = ["hyper.?rigorous", "l06", "adversarial", "red.?team", "failure analysis", "stress test", "full audit", "forensic"];
const LEVEL_TOKENS: Array<[AdaptiveLevel, string[]]> = [
	["L06_HYPER_RIGOROUS", ["/l06\\b", "/ultrathink\\b", "/beastmode\\b", "/hyper.?rigorous\\b"]],
	["L05_CRITICAL", ["/l05\\b", "/critical\\b"]],
	["L04_COMPLEX", ["/l04\\b", "/complex\\b"]],
	["L03_DEEP", ["/l03\\b", "/deepthink\\b", "/deep\\b"]],
	["L02_STANDARD", ["/l02\\b", "/standard\\b"]],
	["L01_BASIC", ["/l01\\b", "/basic\\b"]],
];
const PRIORITY: Record<TaskIntent, number> = {
	EXECUTION: 8, TECHNICAL: 7, DECISION: 6, ANALYSIS: 5, RESEARCH: 4, CREATIVE: 3, COMMUNICATION: 2, INFORMATION: 1, UNKNOWN: 0,
};
const DEFAULT_MODES: Record<TaskIntent, string[]> = {
	INFORMATION: ["DESCRIPTIVE"], RESEARCH: ["EXPLORATORY"], ANALYSIS: ["DIAGNOSTIC"], DECISION: ["STRATEGIC"],
	EXECUTION: ["ACTION_RESEARCH"], TECHNICAL: ["SYSTEMS"], CREATIVE: ["EXPLORATORY"], COMMUNICATION: ["QUALITATIVE"], UNKNOWN: ["EXPLORATORY"],
};
const METHODS: Record<TaskIntent, string[]> = {
	INFORMATION: ["direct-answer"],
	RESEARCH: ["source-discovery", "evidence-validation", "synthesis"],
	ANALYSIS: ["decomposition", "causal-or-diagnostic-analysis", "alternative-explanations"],
	DECISION: ["options", "criteria", "risk-reward", "recommendation"],
	EXECUTION: ["action-planning", "capability-check", "authorization", "receipt-validation"],
	TECHNICAL: ["specification", "implementation", "test", "security-review"],
	CREATIVE: ["divergent-generation", "constraint-check", "refinement"],
	COMMUNICATION: ["audience-fit", "tone", "clarity", "revision"],
	UNKNOWN: ["clarification"],
};

const cache = new Map<string, RegExp>();
function rx(source: string, flags = ""): RegExp {
	const key = `${flags}/${source}`;
	let r = cache.get(key);
	if (!r) {
		r = new RegExp(source, flags);
		cache.set(key, r);
	}
	return r;
}
const LEVEL_ORDER: AdaptiveLevel[] = ["L01_BASIC", "L02_STANDARD", "L03_DEEP", "L04_COMPLEX", "L05_CRITICAL", "L06_HYPER_RIGOROUS"];
const rank = (l: AdaptiveLevel) => LEVEL_ORDER.indexOf(l);
const wordStart = (p: string) => rx(`\\b(?:${p})`);
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const unique = (items: string[]) => [...new Set(items)];

export function route(prompt: string, overrideLevel?: AdaptiveLevel): AdaptiveProfile {
	if (typeof prompt !== "string" || !prompt.trim()) throw new Error("prompt must be non-empty text");
	const text = prompt.toLowerCase();
	const signals: string[] = [];
	const scores = Object.fromEntries(INTENT_ORDER.map((i) => [i, 0])) as Record<TaskIntent, number>;
	for (const [intent, patterns] of PATTERNS) {
		for (const pattern of patterns) {
			if (wordStart(pattern).test(text)) {
				scores[intent] += 1;
				signals.push(`${intent}:${pattern}`);
			}
		}
	}
	if (rx("\\b(question|what is|who is|when|where|explain|define)\\b").test(text)) scores.INFORMATION += 1;
	let intent: TaskIntent = INTENT_ORDER.reduce((best, c) =>
		scores[c] > scores[best] || (scores[c] === scores[best] && PRIORITY[c] > PRIORITY[best]) ? c : best,
	);
	if (scores[intent] === 0) intent = "UNKNOWN";

	let modes = MODE_PATTERNS.filter(([, ps]) => ps.some((p) => wordStart(p).test(text))).map(([m]) => m);
	if (!modes.length) modes = DEFAULT_MODES[intent];
	signals.push(...modes.map((m) => `MODE:${m}`));

	const riskHits = [...RISK_PATTERNS.filter((p) => wordStart(p).test(text)), ...hits(RISK_TERMS_MULTILINGUAL, text)];
	const riskScore = Math.min(5, riskHits.length);
	signals.push(...riskHits.map((p) => `RISK:${p}`));
	const destructive = hits(DESTRUCTIVE_TERMS, text);
	signals.push(...destructive.map((t) => `ACTION:${t}`));
	// A destructive action is critical on its own: "delete production database" names no risk term, yet it
	// must not be routable at L01. One broad term alone ("format a date") only raises the floor to L03.
	const destructiveCritical = destructive.length > 0
		&& (intent === "EXECUTION" || destructive.length >= 2 || riskScore > 0 || destructive.some((t) => STRONG_DESTRUCTIVE.has(t)));
	const riskFloor: AdaptiveLevel = riskScore >= 3 || destructiveCritical || (riskScore > 0 && intent === "EXECUTION") ? "L05_CRITICAL"
		: riskScore > 0 || destructive.length > 0 ? "L03_DEEP" : "L01_BASIC";

	let complexHits = 0;
	if (words(text) > 120) { complexHits += 1; signals.push("COMPLEX:long-input"); }
	if (rx("\\b(and then|multiple|several|step by step|phases|constraints|compare across)\\b").test(text)) { complexHits += 1; signals.push("COMPLEX:multi-step-or-constraints"); }
	if (rx("\\b(root cause|systemic|multi.?dimensional|comprehensive|end.?to.?end)\\b").test(text)) { complexHits += 1; signals.push("COMPLEX:deep-analysis"); }

	const tokenOverride = LEVEL_TOKENS.find(([, ps]) => ps.some((p) => rx(`(?<!\\S)${p}`).test(text)))?.[0];
	if (tokenOverride) signals.push(`SLASH_OVERRIDE:${tokenOverride}`);
	const hyper = HYPER_PATTERNS.some((p) => rx(p).test(text));
	if (hyper) signals.push("OVERRIDE:hyper-rigorous-explicit");

	let level: AdaptiveLevel;
	if (tokenOverride) level = tokenOverride;
	else if (hyper) level = "L06_HYPER_RIGOROUS";
	else if (riskScore >= 1 || destructiveCritical) level = "L05_CRITICAL";
	else if ((intent === "TECHNICAL" || intent === "EXECUTION") && complexHits >= 1) level = "L04_COMPLEX";
	else if (intent === "RESEARCH" || intent === "ANALYSIS" || intent === "DECISION" || complexHits >= 1) level = "L03_DEEP";
	else if (intent === "UNKNOWN") level = "L02_STANDARD";
	else if (words(text) <= 24 && intent === "INFORMATION") level = "L01_BASIC";
	else level = "L02_STANDARD";

	const explicit = overrideLevel !== undefined;
	if (overrideLevel !== undefined) {
		level = overrideLevel;
		signals.push(`USER_OVERRIDE:${level}`);
	}
	// An explicit level may lower the effort, but never below the risk floor.
	if ((explicit || tokenOverride) && rank(level) < rank(riskFloor)) {
		signals.push(`RISK_FLOOR:${riskFloor} (explicit ${level} raised)`);
		level = riskFloor;
	}
	let methods = [...METHODS[intent]];
	if (level === "L05_CRITICAL" || level === "L06_HYPER_RIGOROUS") methods.push("uncertainty-disclosure", "independent-verification", "failure-mode-review");
	if (level === "L06_HYPER_RIGOROUS") methods.push("adversarial-review", "provenance-audit", "stop-condition-check");
	methods = unique(methods);
	return { intent, modes: unique(modes), level, methods, signals, risk_score: riskScore, explicit_override: explicit };
}

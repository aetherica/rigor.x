// rigorx_compute (WS32 P1, ADR-007): a safe arithmetic evaluator with SI dimensional analysis.
// No eval, no dependencies. Every quantity carries a value in SI base units and a dimension vector
// over (m, kg, s, A, K, mol, cd) with rational exponents, so sqrt and fractional powers stay exact.
// Adding, comparing or taking a transcendental function of quantities with the wrong dimensions is
// an error, not a number — that is what catches unit mistakes such as a CGS value labelled SI.
//
// Constants: the exact SI 2019 defining constants where they apply (c, h, q_e, k_B, N_A) and CODATA
// 2022 recommended values for the others (G, eps0, mu0, m_e, m_p, Da), as published by NIST;
// cross-checked against the CODATA-2022 table of pint 0.26.2 (differential test, WS32 WP6).
// Affine temperature scales (°C, °F) are not supported: only differences in K are unambiguous.
// Gaussian electromagnetic units are NOT dimensionally identical to SI ones. Only the gauss is
// defined here, by the conventional correspondence for magnetic flux density B, 1 G ↔ 1e-4 T
// (NIST SP 811); do not use it for H. Other Gaussian quantities (charge, conductivity in s^-1, …)
// must be converted explicitly, for example sigma_SI = 4·pi·eps0·sigma_G.

export class ComputeError extends Error {
	override name = "ComputeError";
}
const fail = (m: string): never => {
	throw new ComputeError(m);
};

// ---------------------------------------------------------------- rational exponents

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
export class Q {
	readonly n: number;
	readonly d: number;
	constructor(n: number, d = 1) {
		if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) fail("internal: invalid rational");
		const g = gcd(n, d) || 1;
		const s = d < 0 ? -1 : 1;
		this.n = (s * n) / g;
		this.d = (s * d) / g;
	}
	add(o: Q) { return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
	mul(o: Q) { return new Q(this.n * o.n, this.d * o.d); }
	neg() { return new Q(-this.n, this.d); }
	eq(o: Q) { return this.n === o.n && this.d === o.d; }
	get zero() { return this.n === 0; }
	toString() { return this.d === 1 ? String(this.n) : `${this.n}/${this.d}`; }
}
/** A number as a small rational (denominator at most 12), or null. */
function rational(x: number): Q | null {
	for (let d = 1; d <= 12; d++) {
		const n = Math.round(x * d);
		if (Math.abs(n / d - x) < 1e-12 && Math.abs(n) <= 1_000) return new Q(n, d);
	}
	return null;
}

// ---------------------------------------------------------------- dimensions and quantities

export const BASE = ["m", "kg", "s", "A", "K", "mol", "cd"] as const;
export type Dim = Q[];
const dim = (...e: number[]): Dim => BASE.map((_, i) => new Q(e[i] ?? 0));
const NONE = dim();
const dimEq = (a: Dim, b: Dim) => a.every((q, i) => q.eq(b[i]!));
const dimMul = (a: Dim, b: Dim) => a.map((q, i) => q.add(b[i]!));
const dimPow = (a: Dim, p: Q) => a.map((q) => q.mul(p));
const dimless = (a: Dim) => a.every((q) => q.zero);
export function dimString(a: Dim): string {
	const parts = BASE.map((b, i) => (a[i]!.zero ? "" : a[i]!.eq(new Q(1)) ? b : `${b}^${a[i]}`)).filter(Boolean);
	return parts.length ? parts.join(" ") : "1";
}

export interface Quantity { v: number; dim: Dim }
const qty = (v: number, d: Dim = NONE): Quantity => ({ v, dim: d });

// ---------------------------------------------------------------- units

interface UnitDef { f: number; d: Dim; prefix: boolean }
const U = (f: number, d: Dim, prefix = true): UnitDef => ({ f, d, prefix });
const J = dim(2, 1, -2);
const UNITS: Record<string, UnitDef> = {
	m: U(1, dim(1)), g: U(1e-3, dim(0, 1)), s: U(1, dim(0, 0, 1)), A: U(1, dim(0, 0, 0, 1)), K: U(1, dim(0, 0, 0, 0, 1)),
	mol: U(1, dim(0, 0, 0, 0, 0, 1)), cd: U(1, dim(0, 0, 0, 0, 0, 0, 1)),
	Hz: U(1, dim(0, 0, -1)), N: U(1, dim(1, 1, -2)), Pa: U(1, dim(-1, 1, -2)), J: U(1, J), W: U(1, dim(2, 1, -3)),
	C: U(1, dim(0, 0, 1, 1)), V: U(1, dim(2, 1, -3, -1)), F: U(1, dim(-2, -1, 4, 2)), ohm: U(1, dim(2, 1, -3, -2)),
	"Ω": U(1, dim(2, 1, -3, -2)), S: U(1, dim(-2, -1, 3, 2)), Wb: U(1, dim(2, 1, -2, -1)), T: U(1, dim(0, 1, -2, -1)),
	H: U(1, dim(2, 1, -2, -2)), lm: U(1, dim(0, 0, 0, 0, 0, 0, 1)), lx: U(1, dim(-2, 0, 0, 0, 0, 0, 1)),
	Bq: U(1, dim(0, 0, -1)), Gy: U(1, dim(2, 0, -2)), Sv: U(1, dim(2, 0, -2)), kat: U(1, dim(0, 0, -1, 0, 0, 1)),
	rad: U(1, NONE), sr: U(1, NONE), L: U(1e-3, dim(3)), l: U(1e-3, dim(3)),
	eV: U(1.602176634e-19, J), // exact (SI 2019)
	min: U(60, dim(0, 0, 1), false), h: U(3_600, dim(0, 0, 1), false), d: U(86_400, dim(0, 0, 1), false),
	au: U(149_597_870_700, dim(1), false), deg: U(Math.PI / 180, NONE, false),
	bar: U(1e5, dim(-1, 1, -2)), atm: U(101_325, dim(-1, 1, -2), false), Torr: U(101_325 / 760, dim(-1, 1, -2), false),
	Da: U(1.66053906892e-27, dim(0, 1)), u: U(1.66053906892e-27, dim(0, 1), false), // CODATA 2022
	angstrom: U(1e-10, dim(1), false), "Å": U(1e-10, dim(1), false),
	// Gaussian/CGS units, so CGS values can be converted explicitly instead of being mislabelled.
	erg: U(1e-7, J), dyn: U(1e-5, dim(1, 1, -2)), G: U(1e-4, dim(0, 1, -2, -1), false), Gauss: U(1e-4, dim(0, 1, -2, -1), false),
	"%": U(0.01, NONE, false),
};
const PREFIXES: Record<string, number> = {
	Q: 1e30, R: 1e27, Y: 1e24, Z: 1e21, E: 1e18, P: 1e15, T: 1e12, G: 1e9, M: 1e6, k: 1e3, h: 1e2, da: 1e1,
	d: 1e-1, c: 1e-2, m: 1e-3, "µ": 1e-6, "μ": 1e-6, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15, a: 1e-18, z: 1e-21, y: 1e-24, r: 1e-27, q: 1e-30,
};
function unitAtom(sym: string): Quantity {
	const exact = UNITS[sym];
	if (exact) return qty(exact.f, exact.d);
	for (const [p, f] of Object.entries(PREFIXES).sort((a, b) => b[0].length - a[0].length)) {
		if (!sym.startsWith(p)) continue;
		const base = UNITS[sym.slice(p.length)];
		if (base && base.prefix) return qty(f * base.f, base.d);
	}
	return fail(`unknown unit: ${sym}`);
}

/** Parse a unit expression such as "kg m^2/s^2", "W m^-2 K^-4", "J/(mol K)", "1/s". */
export function parseUnit(src: string): Quantity {
	const s = src.trim();
	if (!s || s === "1") return qty(1);
	let i = 0;
	const ws = () => { while (i < s.length && s[i] === " ") i++; };
	const atom = (): Quantity => {
		ws();
		if (s[i] === "(") {
			i++;
			const inner = expr();
			ws();
			if (s[i] !== ")") fail(`unit "${src}": missing )`);
			i++;
			return powOf(inner);
		}
		if (s[i] === "1" && (i + 1 >= s.length || /[ /*·)]/.test(s[i + 1]!))) { i++; return qty(1); }
		const m = /^(?:[A-Za-zΩµμÅ%][A-Za-zΩµμÅ]*)/u.exec(s.slice(i));
		if (!m) fail(`unit "${src}": unexpected "${s.slice(i, i + 8)}"`);
		i += m![0].length;
		return powOf(unitAtom(m![0]));
	};
	const powOf = (q: Quantity): Quantity => {
		ws();
		let exp: number | null = null;
		if (s[i] === "^") {
			i++;
			ws();
			const m = /^[-+]?\d+(?:\/\d+)?/.exec(s.slice(i));
			if (!m) fail(`unit "${src}": exponent must be an integer or a fraction such as 1/2`);
			i += m![0].length;
			const [a, b] = m![0].split("/");
			exp = Number(a) / Number(b ?? 1);
		} else {
			const m = /^[-]?\d+/.exec(s.slice(i)); // m2, s-1
			if (m && i > 0 && /[A-Za-z)]/.test(s[i - 1]!)) { i += m[0].length; exp = Number(m[0]); }
		}
		if (exp === null) return q;
		const p = rational(exp)!;
		return qty(q.v ** exp, dimPow(q.dim, p));
	};
	const expr = (): Quantity => {
		let acc = atom();
		for (;;) {
			ws();
			if (i >= s.length || s[i] === ")") return acc;
			if (s[i] === "/") { i++; const r = atom(); acc = qty(acc.v / r.v, dimMul(acc.dim, dimPow(r.dim, new Q(-1)))); continue; }
			if (s[i] === "*" || s[i] === "·") i++;
			const r = atom();
			acc = qty(acc.v * r.v, dimMul(acc.dim, r.dim));
		}
	};
	const out = expr();
	if (i < s.length) fail(`unit "${src}": unexpected ")"`);
	return out;
}

// ---------------------------------------------------------------- constants and functions

const h = 6.62607015e-34;
export const CONSTANTS: Record<string, Quantity> = {
	pi: qty(Math.PI), e_num: qty(Math.E),
	c: qty(299_792_458, dim(1, 0, -1)), h: qty(h, dim(2, 1, -1)), hbar: qty(h / (2 * Math.PI), dim(2, 1, -1)),
	q_e: qty(1.602176634e-19, dim(0, 0, 1, 1)), k_B: qty(1.380649e-23, dim(2, 1, -2, 0, -1)), N_A: qty(6.02214076e23, dim(0, 0, 0, 0, 0, -1)),
	G: qty(6.6743e-11, dim(3, -1, -2)), eps0: qty(8.8541878188e-12, dim(-3, -1, 4, 2)), mu0: qty(1.25663706127e-6, dim(1, 1, -2, -2)),
	m_e: qty(9.1093837139e-31, dim(0, 1)), m_p: qty(1.67262192595e-27, dim(0, 1)),
	sigma_SB: qty((2 * Math.PI ** 5 * 1.380649e-23 ** 4) / (15 * h ** 3 * 299_792_458 ** 2), dim(0, 1, -3, 0, -4)),
	R_gas: qty(6.02214076e23 * 1.380649e-23, dim(2, 1, -2, 0, -1, -1)), g_n: qty(9.80665, dim(1, 0, -2)),
};
const DIMLESS_FUNCS: Record<string, (x: number) => number> = {
	exp: Math.exp, ln: Math.log, log10: Math.log10, log2: Math.log2, sin: Math.sin, cos: Math.cos, tan: Math.tan,
	asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
};

// ---------------------------------------------------------------- expression parser

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "unit"; v: string } | { t: "op"; v: string };
function tokenize(src: string): Tok[] {
	const out: Tok[] = [];
	let i = 0;
	while (i < src.length) {
		const ch = src[i]!;
		if (/\s/.test(ch)) { i++; continue; }
		const num = /^(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(src.slice(i));
		if (num) { out.push({ t: "num", v: Number(num[0]) }); i += num[0].length; continue; }
		const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
		if (id) { out.push({ t: "id", v: id[0] }); i += id[0].length; continue; }
		if (ch === "[") {
			const end = src.indexOf("]", i);
			if (end < 0) fail("missing ] after a unit");
			out.push({ t: "unit", v: src.slice(i + 1, end) });
			i = end + 1;
			continue;
		}
		if ("+-*/^(),".includes(ch)) { out.push({ t: "op", v: ch }); i++; continue; }
		fail(`unexpected character "${ch}"`);
	}
	if (out.length > 500) fail("expression is too long (more than 500 tokens)");
	return out;
}

function add(a: Quantity, b: Quantity, op: "+" | "-"): Quantity {
	if (!dimEq(a.dim, b.dim)) fail(`cannot ${op === "+" ? "add" : "subtract"} ${dimString(a.dim)} and ${dimString(b.dim)}`);
	return qty(op === "+" ? a.v + b.v : a.v - b.v, a.dim);
}
function mul(a: Quantity, b: Quantity): Quantity { return qty(a.v * b.v, dimMul(a.dim, b.dim)); }
function div(a: Quantity, b: Quantity): Quantity {
	if (b.v === 0) fail("division by zero");
	return qty(a.v / b.v, dimMul(a.dim, dimPow(b.dim, new Q(-1))));
}
function pow(a: Quantity, b: Quantity): Quantity {
	if (!dimless(b.dim)) fail(`an exponent must be dimensionless, not ${dimString(b.dim)}`);
	if (dimless(a.dim)) return qty(a.v ** b.v);
	const p = rational(b.v);
	if (!p) fail("a quantity with units can only be raised to a whole or simple fractional power");
	if (a.v < 0 && p!.d !== 1) fail("fractional power of a negative quantity");
	return qty(a.v ** b.v, dimPow(a.dim, p!));
}

export interface Variables { [name: string]: { value: number; unit?: string } }

export function evaluate(src: string, variables: Variables = {}): Quantity {
	const toks = tokenize(src);
	let k = 0;
	let depth = 0;
	const peek = () => toks[k];
	const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;
	const vars = new Map<string, Quantity>();
	for (const [name, x] of Object.entries(variables)) {
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) fail(`invalid variable name: ${name}`);
		if (typeof x?.value !== "number" || !Number.isFinite(x.value)) fail(`variable ${name} needs a finite numeric value`);
		const u = parseUnit(x.unit ?? "1");
		vars.set(name, qty(x.value * u.v, u.dim));
	}
	const expr = (): Quantity => {
		if (++depth > 50) fail("expression is nested too deeply");
		let a = term();
		while (isOp("+") || isOp("-")) { const op = toks[k++]!.v as "+" | "-"; a = add(a, term(), op); }
		depth--;
		return a;
	};
	const term = (): Quantity => {
		let a = unary();
		for (;;) {
			if (isOp("*")) { k++; a = mul(a, unary()); }
			else if (isOp("/")) { k++; a = div(a, unary()); }
			else if (peek()?.t === "unit") a = mul(a, power()); // 3 [eV], 3 [m]^2
			else return a;
		}
	};
	const unary = (): Quantity => {
		if (isOp("-")) { k++; const a = unary(); return qty(-a.v, a.dim); }
		if (isOp("+")) { k++; return unary(); }
		return power();
	};
	const power = (): Quantity => {
		const base = primary();
		if (isOp("^")) { k++; return pow(base, unary()); }
		return base;
	};
	const args = (): Quantity[] => {
		if (!isOp("(")) fail("a function needs (arguments)");
		k++;
		const out = [expr()];
		while (isOp(",")) { k++; out.push(expr()); }
		if (!isOp(")")) fail("missing )");
		k++;
		return out;
	};
	const primary = (): Quantity => {
		const t = peek();
		if (!t) return fail("unexpected end of expression");
		if (t.t === "num") { k++; return qty(t.v); }
		if (t.t === "unit") { k++; return parseUnit(t.v); }
		if (t.t === "op" && t.v === "(") { k++; const a = expr(); if (!isOp(")")) fail("missing )"); k++; return a; }
		if (t.t === "id") {
			k++;
			const name = t.v;
			if (isOp("(")) {
				const a = args();
				if (name in DIMLESS_FUNCS) {
					if (a.length !== 1) fail(`${name} takes one argument`);
					if (!dimless(a[0]!.dim)) fail(`${name} needs a dimensionless argument, not ${dimString(a[0]!.dim)}`);
					return qty(DIMLESS_FUNCS[name]!(a[0]!.v));
				}
				if (name === "sqrt") { if (a.length !== 1) fail("sqrt takes one argument"); if (a[0]!.v < 0) fail("sqrt of a negative quantity"); return pow(a[0]!, qty(0.5)); }
				if (name === "abs") { if (a.length !== 1) fail("abs takes one argument"); return qty(Math.abs(a[0]!.v), a[0]!.dim); }
				if (name === "pow") { if (a.length !== 2) fail("pow takes two arguments"); return pow(a[0]!, a[1]!); }
				if (name === "min" || name === "max") {
					for (const x of a) if (!dimEq(x.dim, a[0]!.dim)) fail(`${name} needs arguments of one dimension`);
					return qty((name === "min" ? Math.min : Math.max)(...a.map((x) => x.v)), a[0]!.dim);
				}
				return fail(`unknown function: ${name}`);
			}
			const v = vars.get(name) ?? CONSTANTS[name];
			if (!v) fail(`unknown name: ${name} (pass it in variables)`);
			return v!;
		}
		return fail(`unexpected "${t.v}"`);
	};
	const result = expr();
	if (k < toks.length) fail(`unexpected "${(toks[k] as { v: unknown }).v}"`);
	if (!Number.isFinite(result.v)) fail("the result is not a finite number (overflow or invalid operation)");
	return result;
}

export interface ComputeInput { expression: string; variables?: Variables; as?: string; expect?: { value: number; unit?: string; rel_tol?: number } }
export interface ComputeResult {
	value_si: number;
	unit_si: string;
	value_as: number | null;
	as: string | null;
	/** ratio = computed / expected (SI): a power of ten or 4·pi·eps0 ≈ 1.1e-10 points to a unit error. */
	check: null | { expected_value: number; expected_unit: string; expected_si: number; rel_error: number | null; ratio: number | null; rel_tol: number; passed: boolean; reason: string };
	ok: boolean;
}

export function compute(input: ComputeInput): ComputeResult {
	const r = evaluate(input.expression, input.variables ?? {});
	let valueAs: number | null = null;
	if (input.as) {
		const u = parseUnit(input.as);
		if (!dimEq(u.dim, r.dim)) fail(`cannot express ${dimString(r.dim)} in ${input.as} (${dimString(u.dim)})`);
		valueAs = r.v / u.v;
	}
	let check: ComputeResult["check"] = null;
	if (input.expect) {
		const e = input.expect;
		if (typeof e.value !== "number" || !Number.isFinite(e.value)) fail("expect.value must be a finite number");
		const tol = e.rel_tol ?? 1e-6;
		if (typeof tol !== "number" || !(tol >= 0 && tol <= 1)) fail("expect.rel_tol must be between 0 and 1");
		const u = parseUnit(e.unit ?? "1");
		const expectedSi = e.value * u.v;
		if (!dimEq(u.dim, r.dim)) {
			check = { expected_value: e.value, expected_unit: e.unit ?? "1", expected_si: expectedSi, rel_error: null, ratio: null, rel_tol: tol, passed: false,
				reason: `dimension mismatch: the expression gives ${dimString(r.dim)}, the expected unit is ${dimString(u.dim)}` };
		} else {
			const rel = expectedSi === 0 ? Math.abs(r.v) : Math.abs(r.v - expectedSi) / Math.abs(expectedSi);
			const passed = rel <= tol;
			const ratio = expectedSi === 0 ? null : r.v / expectedSi;
			check = { expected_value: e.value, expected_unit: e.unit ?? "1", expected_si: expectedSi, rel_error: rel, ratio, rel_tol: tol, passed,
				reason: passed ? "within tolerance" : `relative error ${rel.toPrecision(3)} exceeds ${tol}: computed ${r.v.toPrecision(6)}, expected ${expectedSi.toPrecision(6)} (${dimString(r.dim)}), ratio ${ratio === null ? "n/a" : ratio.toPrecision(4)}` };
		}
	}
	return { value_si: r.v, unit_si: dimString(r.dim), value_as: valueAs, as: input.as ?? null, check, ok: check ? check.passed : true };
}

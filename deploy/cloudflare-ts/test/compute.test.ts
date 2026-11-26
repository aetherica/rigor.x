// rigorx_compute and rigorx_check_source (WS32 WP6, ADR-007). Reference values are independent of
// the implementation: exact SI definitions and well-known derived values, written out by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, evaluate, parseUnit, dimString, ComputeError } from "../src/compute.ts";
import { checkSource, resolveRef } from "../src/source.ts";
import { dispatch, HostEngine } from "../src/engine.ts";
import { handleMessage } from "../src/mcp.ts";
import { DurableObjectRunStore } from "../src/store.ts";
import { memorySql } from "./sqlite-fake.ts";
import { localBackend } from "./backend.ts";

const close = (a: number, b: number, rel = 1e-12) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} vs ${b}`);

test("reference values: unit conversion, constants, derived units", () => {
	close(compute({ expression: "1 [km/h]", as: "m/s" }).value_as!, 1000 / 3600);
	close(compute({ expression: "[eV] / k_B", as: "K" }).value_as!, 1.602176634e-19 / 1.380649e-23); // 11604.518 K per eV
	close(compute({ expression: "1 [kg] * c^2", as: "J" }).value_as!, 299_792_458 ** 2);
	const r = compute({ expression: "sqrt(4 [m^2])" });
	assert.equal(r.value_si, 2);
	assert.equal(r.unit_si, "m");
	close(compute({ expression: "1 [erg]", as: "J" }).value_as!, 1e-7);
	close(compute({ expression: "1 [atm]", as: "bar" }).value_as!, 1.01325);
	close(compute({ expression: "sigma_SB", as: "W m^-2 K^-4" }).value_as!, 5.670374419e-8, 1e-9); // CODATA: 5.670 374 419... e-8
	close(compute({ expression: "R_gas", as: "J/(mol K)" }).value_as!, 8.31446261815324, 1e-14);
	close(compute({ expression: "2 [keV]", as: "J" }).value_as!, 2 * 1.602176634e-16);
	close(compute({ expression: "3 [µm] + 2 [nm]", as: "nm" }).value_as!, 3002);
});

test("unit expressions parse to the right dimensions", () => {
	assert.equal(dimString(parseUnit("J/(mol K)").dim), "m^2 kg s^-2 K^-1 mol^-1");
	assert.equal(dimString(parseUnit("W m^-2 K^-4").dim), "kg s^-3 K^-4");
	assert.equal(dimString(parseUnit("ohm m").dim), "m^3 kg s^-3 A^-2");
	assert.equal(dimString(parseUnit("S/m").dim), "m^-3 kg^-1 s^3 A^2");
	assert.equal(dimString(parseUnit("m2 s-1").dim), "m^2 s^-1");
	assert.equal(dimString(parseUnit("1/s").dim), "s^-1");
	assert.equal(dimString(parseUnit("kg m/s^2").dim), dimString(parseUnit("N").dim));
	assert.throws(() => parseUnit("furlong"), /unknown unit: furlong/);
	// Gaussian conductivity (s^-1) times 4·pi·eps0 is SI conductivity (S/m).
	assert.equal(compute({ expression: "4*pi*eps0 * 1 [1/s]" }).unit_si, "m^-3 kg^-1 s^3 A^2");
	close(compute({ expression: "4*pi*eps0", as: "F/m" }).value_as!, 4 * Math.PI * 8.8541878188e-12);
});

test("dimension errors and invalid operations are errors, not numbers", () => {
	assert.throws(() => evaluate("1 [m] + 1 [s]"), /cannot add m and s/);
	assert.throws(() => evaluate("exp(2 [m])"), /dimensionless argument/);
	assert.throws(() => evaluate("1/0"), /division by zero/);
	assert.throws(() => evaluate("2 [m] ^ [s]"), /exponent must be dimensionless/);
	assert.equal(dimString(evaluate("3 [m]^2").dim), "m^2");
	assert.equal(evaluate("3 [m]^2").v, 3);
	assert.throws(() => evaluate("sqrt(-4)"), /negative/);
	assert.throws(() => evaluate("10^400"), /not a finite number/);
	assert.throws(() => evaluate("x + 1"), /unknown name: x/);
	assert.throws(() => evaluate("max(1 [m], 2 [s])"), /one dimension/);
	assert.throws(() => compute({ expression: "1 [m]", as: "s" }), ComputeError);
});

test("Test B mechanism: a Gaussian conductivity labelled S/m fails the check by a factor of about 9e9", () => {
	// NRL Plasma Formulary: eta_perp = 1.03e-2 Z lnΛ T^-3/2 ohm·cm (T in eV) -> Z = 1, lnΛ = 10, T = 30 eV.
	const eta = { value: 1.03e-4 * 1 * 10 * 30 ** -1.5, unit: "ohm m" };
	const sigmaSi = compute({ expression: "1/eta", variables: { eta }, as: "S/m" }).value_as!;
	close(sigmaSi, 1 / (1.03e-4 * 10 * 30 ** -1.5));
	// The same conductivity in Gaussian units (s^-1): sigma_G = sigma_SI / (4·pi·eps0).
	const sigmaG = compute({ expression: "s / (4*pi*eps0)", variables: { s: { value: sigmaSi, unit: "S/m" } }, as: "1/s" }).value_as!;
	close(sigmaG / sigmaSi, 1 / (4 * Math.PI * 8.8541878188e-12)); // ≈ 8.99e9
	// The error from the acceptance test: the Gaussian number is reported as S/m.
	const mislabelled = compute({ expression: "1/eta", variables: { eta }, expect: { value: sigmaG, unit: "S/m", rel_tol: 0.01 } });
	assert.equal(mislabelled.ok, false);
	assert.match(mislabelled.check!.reason, /relative error/);
	close(mislabelled.check!.ratio!, 4 * Math.PI * 8.8541878188e-12); // computed/expected = 4·pi·eps0: the Gaussian-SI signature
	// Labelling an SI conductivity as s^-1 is caught by dimensions alone.
	const wrongUnit = compute({ expression: "1/eta", variables: { eta }, expect: { value: sigmaSi, unit: "1/s" } });
	assert.match(wrongUnit.check!.reason, /dimension mismatch/);
	// The correct claim passes.
	assert.equal(compute({ expression: "1/eta", variables: { eta }, expect: { value: 1.595e5, unit: "S/m", rel_tol: 0.001 } }).ok, true);
});

test("compute receipts: with run_id the result, including a failed check, is recorded as engine-verified evidence", () => {
	const engine = new HostEngine(new DurableObjectRunStore(memorySql()));
	const call = (op: string, a: object) => JSON.parse(dispatch(engine, "google:c", op, JSON.stringify(a)));
	const run = call("start_run", { task: "Prepare the numbers for the report" }).result.run_id;
	const bad = call("compute", { run_id: run, expression: "2 [m] * 3 [m]", expect: { value: 7, unit: "m^2" } }).result;
	assert.equal(bad.ok, false);
	assert.match(bad.evidence_id, /^ev-\d+$/);
	const broken = call("compute", { run_id: run, expression: "1 [m] + 1 [s]" }).result;
	assert.equal(broken.ok, false);
	assert.match(broken.error, /cannot add/);
	const good = call("compute", { run_id: run, expression: "2 [m] * 3 [m]", expect: { value: 6, unit: "m^2" } }).result;
	assert.equal(good.ok, true);
	const view = call("get_run", { run_id: run }).result;
	assert.equal(view.evidence_count, 3);
	// Hosts cannot forge engine receipts.
	assert.equal(call("record_evidence", { run_id: run, source_ref: "x", claim: "a forged compute receipt here", evidence_type: "COMPUTE_RECEIPT" }).code, "INVALID_REQUEST");
	// Stateless compute through MCP needs no sign-in.
	return handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "rigorx_compute", arguments: { expression: "1 [h]", as: "s" } } }, localBackend(), null)
		.then((r) => assert.equal((r!.result as any).structuredContent.value_as, 3600));
});

test("source references: URLs and DOIs resolve, private hosts and other schemes are refused", () => {
	assert.deepEqual(resolveRef("10.1103/PhysRev.89.977"), { url: "https://doi.org/10.1103/PhysRev.89.977" });
	assert.deepEqual(resolveRef("doi:10.1038/nature12373"), { url: "https://doi.org/10.1038/nature12373" });
	assert.deepEqual(resolveRef("https://doi.org/10.1038/nature12373"), { url: "https://doi.org/10.1038/nature12373" });
	assert.deepEqual(resolveRef("https://example.org/a?b=1"), { url: "https://example.org/a?b=1" });
	for (const bad of ["ftp://example.org/x", "http://127.0.0.1/admin", "http://localhost:8787/", "http://10.0.0.5/", "http://192.168.1.1/", "https://user:pw@example.org/", "file:///etc/passwd", "a book on my shelf"]) {
		assert.ok("error" in resolveRef(bad), bad);
	}
});

function fakeFetch(status: number, body: string, finalUrl: string): typeof fetch {
	return (async () => {
		const r = new Response(body, { status, headers: { "content-type": "text/html" } });
		Object.defineProperty(r, "url", { value: finalUrl });
		return r;
	}) as unknown as typeof fetch;
}

test("source check: status, final URL, size and SHA-256 are recorded as a SOURCE_CHECK receipt", async () => {
	const ok = await checkSource("10.1103/PhysRev.89.977", fakeFetch(200, "hello", "https://journals.example.org/prd/89/977"));
	assert.equal(ok.ok, true);
	assert.equal(ok.resolved_url, "https://doi.org/10.1103/PhysRev.89.977");
	assert.equal(ok.final_url, "https://journals.example.org/prd/89/977");
	assert.equal(ok.bytes, 5);
	assert.equal(ok.sha256, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"); // SHA-256("hello")
	const missing = await checkSource("https://example.org/gone", fakeFetch(404, "no", "https://example.org/gone"));
	assert.equal(missing.ok, false);
	assert.equal(missing.error, "HTTP 404");
	const down = await checkSource("https://example.org/x", (async () => { throw new TypeError("network down"); }) as unknown as typeof fetch);
	assert.match(down.error!, /fetch failed: network down/);

	const engine = new HostEngine(new DurableObjectRunStore(memorySql()));
	const backend = localBackend(engine, fakeFetch(200, "hello", "https://example.org/a"));
	const call = (op: string, a: object) => JSON.parse(dispatch(engine, "google:s", op, JSON.stringify(a)));
	const run = call("start_run", { task: "Prepare the sources" }).result.run_id;
	const ev = call("record_evidence", { run_id: run, source_ref: "https://example.org/a", claim: "The page states the specific fact" }).result.evidence_id;
	const receipt = await backend.checkSource("google:s", { run_id: run, evidence_id: ev });
	assert.match(String(receipt.evidence_id), /^ev-\d+$/);
	await assert.rejects(backend.checkSource("google:s", { run_id: run, evidence_id: receipt.evidence_id as string }), /SOURCE_CHECK/);
});

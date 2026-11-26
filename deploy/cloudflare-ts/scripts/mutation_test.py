"""Mutation testing of security-critical conditions (release directive §8.3).

Each mutation disables or inverts one guard; the TypeScript suite must fail ("killed"). A mutation
that survives means the guard has no test. Restores every file afterwards, even on error.
Usage (from deploy/cloudflare-ts): python3 scripts/mutation_test.py
"""
import pathlib
import subprocess
import sys

MUTATIONS = [
    ("SSRF: IPv4 special-purpose ranges ignored", "src/source.ts", "export function blockedIPv4(a: number[]): string | null {", "export function blockedIPv4(a: number[]): string | null {\n\treturn null;"),
    ("SSRF: redirect target not checked", "src/source.ts", 'if ("error" in checked) {\n\t\t\tconsole.log', 'if (false && "error" in checked) {\n\t\t\tconsole.log'),
    ("SSRF: DNS answers not checked", "src/source.ts", "export async function checkResolved(host: string, resolve: Resolver): Promise<string | null> {", "export async function checkResolved(host: string, resolve: Resolver): Promise<string | null> {\n\treturn null;"),
    ("Approval: expiry not enforced", "src/ledger.ts", "Date.parse(d.expires_at) < at.getTime()", "Date.parse(d.expires_at) < 0"),
    ("Approval: digest not compared", "src/ledger.ts", "if (d.operation_digest !== operationDigest(op))", "if (false)"),
    ("Approval: A5 accepts host-declared approval", "src/ledger.ts", 'if (op.tier === "A5" && !(a.verification', 'if (false && !(a.verification'),
    ("Approval: decision replay allowed", "src/engine.ts", 'if (r.status !== "pending") throw conflict', 'if (false) throw conflict'),
    ("Tenant: run load ignores owner", "src/store.ts", '"SELECT revision, snapshot_json, meta_json FROM host_runs WHERE run_id = ? AND owner_id = ?"', '"SELECT revision, snapshot_json, meta_json FROM host_runs WHERE run_id = ? AND ? IS NOT NULL"'),
    ("Quota: daily call limit skipped", "src/engine.ts", "if (used.calls >= l.callsPerDay) throw quota", "if (false) throw quota"),
    ("Evidence: unrelated compute validates numeric claim", "src/gate.ts", "if (!check || check.passed !== true || typeof check.expected_si !== \"number\") return false;", "return true;"),
    ("Execution: failed prerequisite ignored", "src/ledger.ts", "export function dependencyProblems(plan: Operation[], status: (id: string) => string): string[] {", "export function dependencyProblems(plan: Operation[], status: (id: string) => string): string[] {\n\treturn [];"),
    ("Idempotency: conflicting payload replayed", "src/engine.ts", "if (prior.operation !== operation || prior.digest !== fingerprint) {", "if (false) {"),
    ("Memory: tampered validated item keeps trust", "src/memory.ts", 'trust: integrity === "mismatch" ? "host_inferred" : r.trust', "trust: r.trust"),
    ("Routing: risk floor disabled", "src/router.ts", "if ((explicit || tokenOverride) && rank(level) < rank(riskFloor)) {", "if (false) {"),
    ("MCP: nesting depth unchecked", "src/mcp.ts", "if (jsonDepth(body, MAX_JSON_DEPTH) > MAX_JSON_DEPTH)", "if (false)"),
]

def run_tests() -> bool:
    r = subprocess.run(["node", "--no-warnings", "--experimental-strip-types", "--test", "test/"], capture_output=True, text=True, timeout=600, check=False)
    return r.returncode == 0

killed = 0
for name, path, old, new in MUTATIONS:
    p = pathlib.Path(path)
    original = p.read_text()
    if old not in original:
        print(f"ERROR  {name}: anchor not found in {path}")
        sys.exit(2)
    try:
        p.write_text(original.replace(old, new, 1))
        survived = run_tests()
    finally:
        p.write_text(original)
    killed += 0 if survived else 1
    print(f"{'SURVIVED' if survived else 'killed  '}  {name}")
print(f"mutation score: {killed}/{len(MUTATIONS)} killed")
sys.exit(0 if killed == len(MUTATIONS) else 1)

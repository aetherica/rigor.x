#!/usr/bin/env node
// Real-browser smoke test: drives browser/server.ts against a running GeckoDriver.
// Usage: node browser/smoke.mjs [https://example.com]
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const target = process.argv[2] ?? "https://example.com";
const server = spawn(process.execPath, ["--no-warnings", "--experimental-strip-types", fileURLToPath(new URL("./server.ts", import.meta.url))], { stdio: ["pipe", "pipe", "inherit"], env: process.env });
const pending = new Map();
createInterface({ input: server.stdout }).on("line", (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  pending.get(msg.id)?.(msg); pending.delete(msg.id);
});
let id = 0;
function rpc(method, params, timeoutMs = 120000) {
  const n = ++id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(method + " timed out")), timeoutMs);
    pending.set(n, (m) => { clearTimeout(timer); resolve(m); });
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n");
  });
}
const call = async (name, args) => {
  const r = await rpc("tools/call", { name, arguments: args });
  const text = r.result?.content?.[0]?.text ?? JSON.stringify(r.error);
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = { status: "?", raw: text }; }
  return parsed;
};

let failures = 0;
const check = (label, ok, detail) => { console.log((ok ? "PASS " : "FAIL ") + label + (detail ? "  -> " + detail : "")); if (!ok) failures++; };

try {
  await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "smoke", version: "1" } });
  const tools = await rpc("tools/list", {});
  check("7 tools listed", tools.result?.tools?.length === 7, String(tools.result?.tools?.length));

  const opened = await call("browser_open", { url: target });
  check("open " + target, opened.status === "OK", opened.status + " " + (opened.message ?? ""));

  const read = await call("browser_read", {});
  const ev = read.evidence ?? read.data?.evidence ?? read;
  check("read returns title + sha256", read.status === "OK" && !!JSON.stringify(read).match(/[a-f0-9]{64}/), (ev.title ?? "") + "");

  const enter = await call("browser_type", { selector: "input", text: "hello\n" });
  check("typing Enter is refused", enter.status === "BLOCKED", enter.status);

  const priv = await call("browser_open", { url: "http://192.168.1.1/" });
  check("private address is refused", priv.status === "BLOCKED", priv.status);
} catch (e) {
  check("run", false, e instanceof Error ? e.message : String(e));
} finally {
  server.stdin.end(); setTimeout(() => server.kill(), 3000).unref();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exitCode = failures ? 1 : 0;

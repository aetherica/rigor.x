import { test } from "node:test";
import assert from "node:assert/strict";
import { landingPage } from "../src/landing.ts";

test("landing page: connector address of the serving host, account and legal links, no scripts", () => {
	const html = landingPage("https://x.aetherica.workers.dev");
	assert.ok(html.startsWith("<!doctype html>"));
	assert.ok(html.includes("https://x.aetherica.workers.dev/mcp"));
	assert.ok(html.includes('href="/account"') && html.includes('href="/privacy"') && html.includes('href="/terms"'));
	assert.ok(!/<script/i.test(html));
	assert.ok(!html.includes("rigorx-mcp"));
	assert.ok(landingPage('https://a"b').includes("https://a&#34;b/mcp"));
});

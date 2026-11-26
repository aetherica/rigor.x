import { test } from "node:test";
import assert from "node:assert/strict";
import { handleMarketplaceWebhook, signatureFor } from "../src/marketplace.ts";

const body = JSON.stringify({ action: "purchased", marketplace_purchase: { account: { type: "User", id: 7, login: "someone" }, plan: { name: "Free", price_model: "FREE" } } });
const req = (sig: string | null, b = body, method = "POST") => new Request("https://x.example/webhooks/github-marketplace", {
	method, body: method === "POST" ? b : undefined,
	headers: { "x-github-event": "marketplace_purchase", "content-type": "application/json", ...(sig ? { "x-hub-signature-256": sig } : {}) },
});

test("marketplace webhook: signed events are accepted, anything else refused", async () => {
	const sig = await signatureFor("s3cret", new TextEncoder().encode(body));
	assert.equal((await handleMarketplaceWebhook(req(sig), "s3cret")).status, 204);
	assert.equal((await handleMarketplaceWebhook(req(sig), "other")).status, 401);
	assert.equal((await handleMarketplaceWebhook(req(null), "s3cret")).status, 401);
	assert.equal((await handleMarketplaceWebhook(req(sig, body + " "), "s3cret")).status, 401); // body changed
	assert.equal((await handleMarketplaceWebhook(req(sig), undefined)).status, 503);
	assert.equal((await handleMarketplaceWebhook(req(null, "", "GET"), "s3cret")).status, 405);
	const bad = "{not json";
	assert.equal((await handleMarketplaceWebhook(req(await signatureFor("s3cret", new TextEncoder().encode(bad)), bad), "s3cret")).status, 400);
});

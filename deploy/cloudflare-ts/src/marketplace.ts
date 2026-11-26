// GitHub Marketplace webhook (POST /webhooks/github-marketplace). GitHub sends marketplace_purchase
// events (purchased, changed, cancelled, pending_change…) and a ping when the hook is created. The
// listing has one free plan, so nothing is billed or provisioned: each verified event is logged
// (action, plan, account type and numeric ID, no names or e-mail addresses) and acknowledged.
//
// The signature (X-Hub-Signature-256, HMAC-SHA256 of the raw body) is checked against the Worker
// secret GITHUB_MARKETPLACE_WEBHOOK_SECRET; without the secret the endpoint answers 503.

export const MARKETPLACE_WEBHOOK_PATH = "/webhooks/github-marketplace";
const MAX_BODY = 256 * 1024;

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

function equalConstantTime(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export async function signatureFor(secret: string, body: Uint8Array): Promise<string> {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return `sha256=${hex(await crypto.subtle.sign("HMAC", key, body))}`;
}

export async function handleMarketplaceWebhook(request: Request, secret: string | undefined): Promise<Response> {
	if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
	if (!secret) return new Response("Webhook is not configured", { status: 503 });
	const declared = Number(request.headers.get("content-length") ?? "0");
	if (declared > MAX_BODY) return new Response("Payload too large", { status: 413 });
	const body = new Uint8Array(await request.arrayBuffer());
	if (body.byteLength > MAX_BODY) return new Response("Payload too large", { status: 413 });
	const given = request.headers.get("x-hub-signature-256") ?? "";
	if (!equalConstantTime(given, await signatureFor(secret, body))) {
		console.log(JSON.stringify({ evt: "rigorx_security", kind: "marketplace_webhook_bad_signature" }));
		return new Response("Invalid signature", { status: 401 });
	}
	const event = request.headers.get("x-github-event") ?? "";
	let payload: Record<string, any> = {};
	try {
		payload = JSON.parse(new TextDecoder().decode(body));
	} catch {
		return new Response("Invalid JSON", { status: 400 });
	}
	const purchase = payload.marketplace_purchase ?? {};
	console.log(JSON.stringify({
		evt: "rigorx_marketplace", event, action: typeof payload.action === "string" ? payload.action : null,
		delivery: request.headers.get("x-github-delivery"),
		account_type: purchase.account?.type ?? null, account_id: typeof purchase.account?.id === "number" ? purchase.account.id : null,
		plan: purchase.plan?.name ?? null, price_model: purchase.plan?.price_model ?? null,
	}));
	return new Response(null, { status: 204 });
}

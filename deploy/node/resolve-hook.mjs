// Resolve hook (runs off the main thread): "cloudflare:workers" -> cloudflare-workers-shim.mjs.
const SHIM = new URL("./cloudflare-workers-shim.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
	if (specifier === "cloudflare:workers") return { url: SHIM, shortCircuit: true };
	return nextResolve(specifier, context);
}

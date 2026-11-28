// Aetherica front door at x.aetherica.workers.dev.
//
// Every request is handed, unchanged, to the Aetherica service Worker over a service binding (APP).
// The URL keeps this host, so the service answers as x.aetherica.workers.dev: OAuth metadata,
// sign-in callbacks and the connector address all use this origin. Accounts, work and memory stay in
// the service Worker's storage; nothing is stored here.
//
// Aetherica Lab (invitation-only) lives at /ai on this host. Only the Lab's own paths go to the Lab
// Worker (LAB); every other path, including /mcp and sign-in, still goes to APP.
export function isLabPath(pathname) {
	return pathname === "/ai" || pathname.startsWith("/api/lab/") || pathname.startsWith("/fonts/");
}
export default {
	fetch(request, env) {
		if (env.LAB && isLabPath(new URL(request.url).pathname)) return env.LAB.fetch(request);
		return env.APP.fetch(request);
	},
};

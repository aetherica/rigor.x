// Aetherica front door at x.aetherica.workers.dev.
//
// Every request is handed, unchanged, to the Aetherica service Worker over a service binding (APP).
// The URL keeps this host, so the service answers as x.aetherica.workers.dev: OAuth metadata,
// sign-in callbacks and the connector address all use this origin. Accounts, work and memory stay in
// the service Worker's storage; nothing is stored here.
export default {
	fetch(request, env) {
		return env.APP.fetch(request);
	},
};

// Worker helpers without Workers-only imports, so the Node test runner can load them.

/**
 * Server-side suspension (account lifecycle, release directive §5.3): RIGORX_SUSPENDED_OWNERS is a
 * comma-separated list of SHA-256 hex prefixes (16 to 64 characters) of owner IDs. A matching owner
 * is refused on every owner-scoped call. Prefixes shorter than 16 characters are ignored, so a typo
 * cannot suspend a broad group of accounts.
 */
export function isSuspended(env: { RIGORX_SUSPENDED_OWNERS?: string }, ownerHash: string): boolean {
	const list = (env.RIGORX_SUSPENDED_OWNERS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^[0-9a-f]{16,64}$/.test(x));
	return list.some((prefix) => ownerHash.startsWith(prefix));
}

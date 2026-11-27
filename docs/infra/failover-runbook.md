# Aetherica Controlled Failover Runbook
1. Declare incident; capture Cloudflare Worker version, commit SHA, status, error rate and provider status.
2. Never automatically route production writes to staging or a second database.
3. Confirm portable Node image and main SHA are CI-green; inspect environment key names without exposing values.
4. If Cloudflare unavailable, use a separate DR deployment with synthetic/approved data. Verify target host is truly free before provisioning.
5. Configure origin, OAuth redirect allow-list and storage. Use Supabase only if schema migrated and connection verified; SQLite is temporary/volatile.
6. Test health/version, OAuth, approval, MCP initialize/tools/list, account isolation, persistence/restart.
7. If stale data or split-brain risk, read-only/degraded. No dual-write.
8. Owner approval required before production routing/DNS switch or migration.
9. Reconcile data under reviewed procedure; switch back after smoke tests and provenance.
10. Record timeline, SHA, providers, data-loss window, action, rollback.

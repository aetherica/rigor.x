# Free-Tier Ledger — Aetherica
Snapshot: 2026-11-27. Treat costs/limits as provisional until verified in dashboards.

| Provider | Role | Current status | Guardrail/caveat |
|---|---|---|---|
| GitHub | Source/CI | Public repo aetherica/x | Verify Actions limits; no paid runners |
| Cloudflare | Production Workers, D1/DO/KV/R2/Pages | Active Workers | Check plan quotas; no paid add-ons |
| Render | Staging | Free service live | Ephemeral disk, sleep, one instance; no paid plan |
| Supabase | Staging Postgres | Free project active | Idle pause, no PITR; not sole production data |
| Vercel | Optional previews/frontend | Access pending | Hobby only; no paid integrations |
| Railway | Optional DR sandbox | No project | Verified credits only; avoid always-on |
| Google | OAuth | Existing integration | OAuth only; avoid unrelated paid APIs |
| OpenAI Platform | Optional model | No API budget | Usage-billed; BYOK optional, default off |
| Claude | Coding agent | Existing workflow | Subscription/plan limits; API billing not assumed |

Before provisioning verify free plan, card requirement, quotas, pause behavior and billing. Owner approval required for anything chargeable.

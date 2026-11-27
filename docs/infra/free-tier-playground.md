# Aetherica Free-Tier Multi-Cloud Playground
**Architecture status:** proposed / implementation handoff
**Owner:** Aetherica
**Date:** 2026-11-27
**Constraint:** zero paid subscriptions or usage-based charges. Never activate a paid resource or exceed a free-tier budget without owner approval.

## Mission
Build a provider-diverse engineering playground for Claude Code. Claude is implementation engineer; architecture supervisor defines constraints, verifies provider state, reviews risky changes and maintains docs. Free plans only; verify current plan limits before provisioning.

## Current verified baseline
- GitHub: public repo aetherica/x; PR #13 (portable Node runtime) and #14 (Postgres storage) merged. PR #15 open; do NOT merge before migration 2 is applied and verified; database write requires owner approval.
- Cloudflare account Aetherica. Workers: aetherica, privacy, rigorx-mcp, terms, x. Production rigorx-mcp has query-string redaction and 10% sampling.
- Render: free service x, Singapore, Docker deploy/node/Dockerfile, linked to aetherica/x main, auto-deploy on commit. URL https://x-8xah.onrender.com. Latest deploy commit 8f1166c is LIVE. Staging only; free disk ephemeral; one instance.
- Supabase: rigor.x, Singapore, Postgres 17, ACTIVE_HEALTHY. Migration inventory from connector was empty and public tables none; security advisor INFO reports private RLS tables without policies (likely intended revoked access). Read-only grants inspection required before changes. Health/performance advisors clean.
- Railway: no projects returned; optional/unused.
- Vercel: team access currently blocked. Consent URL issued: https://vercel.com/sso/session-requests/eRPI9OkNpBkazS5Gpeno8QkGAqXsEMSz; owner approval required and link expires in 10 minutes. Optional.
- OpenAI Platform API is usage-billed; no budget assumed. ChatGPT subscription does not imply API credits. BYOK optional only.

## Target architecture
### Tier 0 — engineering control plane
- GitHub: source, PRs, CI, releases, docs. PR-based workflow. Enforce main branch checks/review where possible.
- CI: deterministic test/typecheck/audit/security checks. Least privilege; pin third-party actions to full SHAs; no production deploy on unreviewed PRs.
- Secrets only in provider secret stores/GitHub secrets; never repo, logs, PRs, prompts or artifacts.

### Tier 1 — primary production (Cloudflare)
- Workers: primary serverless runtime for production MCP/API.
- D1: relational state where SQLite semantics fit; migration files in repo and CI-tested.
- Durable Objects: per-owner/concurrency state.
- KV: cache and ephemeral OAuth state only where architecture explicitly permits.
- R2: durable files if needed, behind storage adapter.
- Pages: static frontend/documentation if useful.
- Cloudflare remains production source of truth. Deploy requires provenance, typecheck/tests and one deploy path.

### Tier 2 — portable staging / DR playground
- Render Free: current staging container. Sleep and ephemeral filesystem expected. Never assume local SQLite disk durable. One instance.
- Supabase Free Postgres: optional persistent staging adapter; can pause after inactivity and has free-plan limits/no PITR. Staging recovery must tolerate pause. Explicit, reviewed, checksummed migrations must precede code that requires them.
- Isolate staging from production bindings, tokens and user data. Use synthetic data.
- If Render is unavailable, portable Docker image may be moved to another host only after verified zero-cost allowance.

### Tier 3 — optional, never mandatory
- Vercel Hobby: optional preview/static frontend or Functions after team access approval and terms/limits check. No paid integrations.
- Railway: optional sandbox only if free allowance/credits are verified. No always-on services, volumes or DBs without confirmed zero cost. Currently no project.
- Do not create redundant always-on clones.

## AI workflow
- Claude Code: primary engineer; implement from repo/handoff, tests, feature branches/PRs; never merge/deploy production without authorization.
- GPT/Aetherica: architecture, risk/rollback, independent evidence validation, infra checks and acceptance criteria.
- OpenAI API disabled by default. Optional BYOK with hard budget guard; no key storage in app DB.
- Model providers optional and environment-configured; graceful failure.

## Zero-cost/failover rules
1. No paid plans/add-ons, billing upgrades, usage-billed API calls, resource creation that could incur charges, or credit consumption without owner approval.
2. Track quotas, expiry, idle pause, outbound limits, build minutes, storage, bandwidth and restrictions in free-tier-ledger.md.
3. Production critical path stays Cloudflare. Render/Supabase/Vercel/Railway are fallbacks, previews or staging—not mandatory dependencies.
4. Keep adapters for storage, runtime, deployment and model providers.
5. Free-tier databases without PITR must not be sole production source of truth. Document export/restore.
6. Failover is controlled. No automatic write switching or dual-write. Read-only/degraded until consistency is confirmed.

## Suggested layout (no repo reorganization without PR)
docs/infra/free-tier-playground.md — this architecture
docs/infra/free-tier-ledger.md — free allowances and cost snapshots
docs/infra/failover-runbook.md — controlled DR steps
docs/infra/secrets-and-rotation.md — secret names/locations only
docs/infra/deployment-matrix.md — runtime/host matrix
deploy/cloudflare-ts — primary Worker
deploy/node — portable staging runtime
scripts/smoke — smoke checks

## Gates
### A: Control plane
- Vercel access consent only if owner wants it; otherwise skip.
- Verify GitHub main branch rules and CI; document without weakening rules.
- Free-tier ledger, provider billing and quota checks; no resource creation.
### B: Staging consistency
- Inspect PR #15 and CI. Do NOT merge until migration 2 owner-approved/applied/verified.
- Verify Render health and environment key names (never values); STORAGE mode, origin, OAuth redirect and DB settings.
- Read-only Supabase migration/grant inspection. Do not apply migration without approval.
### C: Production and DR
- Verify Worker endpoints health/version/MCP handshake and commit/bindings.
- DR drill with synthetic data, no production secrets.
### D: Cost review
- Test quota alerts and idle behavior; if plan changes, stop and present alternatives.

## Claude Code handoff
1. Read this file, README, deploy/node/README, CI/deployment docs and PR #15. Avoid re-auditing settled code absent concrete new evidence.
2. Inventory with evidence. Implement only zero-cost code/config/docs Gate A/B work.
3. Do NOT apply migrations, merge #15, create/upgrade cloud resources, alter secrets, deploy production or spend API credits without owner approval.
4. Small PRs, full checks, rollback and exact verification. For blockers, state owner action; no workarounds by guessing.
5. When staging stable, update ledger and give reproducible smoke checklist.

## Acceptance
- Architecture and free-tier ledger documented.
- Cloudflare remains production; staging portable and non-production.
- No secrets or paid resources created.
- PR #15 migration dependency gated.
- CI evidence, deploy SHA and health/auth/MCP checks recorded.
- Claude reports blockers, approvals, rollback and next action.

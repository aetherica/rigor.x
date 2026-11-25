# WS24 — Release Build & Transport Hardening

## Model transport boundary
- Remote model endpoints must use HTTPS.
- Plain HTTP is accepted only for localhost/loopback addresses.
- Endpoint userinfo, query and fragment are rejected to reduce credential/endpoint ambiguity.
- Request timeout must be finite and positive.
- Response bodies are capped; oversized responses fail closed.
- API credentials are environment/config values, never printed.
- HTTP status and transport errors are redacted.

## CI/release engineering
- Actions pinned to full immutable commit SHAs.
- Python 3.13 and 3.15 matrix.
- Ruff and complete unittest suite.
- Build source distribution and wheel.
- Reinstall wheel, `pip check`, version CLI and agent CLI smoke.
- Release tag withheld until system-level acceptance is complete.

## Current release gates still open
Live provider API acceptance (not merely mocked transport); real host/plugin tool adapter; 999 per-command contract/implementation; 90 native command adapters; 36 knowledge domains; recovered canonical 30/33/111/15 item registries; research acquisition; evidence/provenance services; memory integration; security/red-team evaluation; broader reliability and performance benchmarks; final 0.4.0 release review.

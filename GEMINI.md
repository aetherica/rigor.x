# Aetherica (RIGOR-X)

The `aetherica` MCP server runs rigorous, multi-step work as a recorded run of up to twelve stages
(QUERY, CLASSIFY, SELECT_METHODS, ASSESS_COMPLEXITY, IDENTIFY_CAPABILITIES, PLAN, EXECUTE,
EVALUATE_EVIDENCE, VALIDATE, STRESS_TEST, OPTIMIZE, DELIVER). The level L01-L06 decides which
stages are required.

How the tools fit together:

- `rigorx_start_run` opens a run; `rigorx_submit_stage` submits each stage with the fields the
  previous result asks for. Acceptance requirements are registered at CLASSIFY and cannot be
  changed later.
- `rigorx_record_evidence` records a source and the claim it supports; `rigorx_check_source`
  fetches one recorded source and stores its status, metadata and hash; `rigorx_assess_sources`
  reports independent origins, discovery layers and what evidence is missing.
- `rigorx_compute` runs a logged calculation; `rigorx_verify` runs the validation gate.
- `rigorx_report_action` records actions taken with other tools, failures included.

Aetherica checks structure and completeness, not truth. A run's DELIVER stage states what was not
met or not verified.

Sign-in: the first call opens a browser for Google, GitHub or ChatGPT sign-in. Re-authenticate
with `/mcp auth aetherica`.

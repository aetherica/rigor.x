# Source Provenance & Extraction Notes

## Sources
| Source ID | Source | Type | URL | Applied scope |
|---|---|---|---|---|
| SRC-COMMUNITY-001 | Cris0338/GPT-Slash-Prompts | Community-maintained catalogue | https://github.com/Cris0338/GPT-Slash-Prompts | English catalogue files 01–11 on main |
| SRC-AIDER-001 | Aider command documentation | Official platform documentation | https://aider.chat/docs/usage/commands | Additional CLI command candidates |
| SRC-OPENCODE-001 | OpenCode TUI documentation | Official platform documentation | https://opencode.ai/docs/cli/tui/ | Additional TUI command candidates |
| SRC-GEMINI-001 | Gemini CLI command documentation | Official platform documentation | https://geminicli.com/docs/reference/commands/ | Additional CLI command candidates |
| SRC-CHATGPT-001 | ChatGPT slash command reference | Official OpenAI documentation | https://learn.chatgpt.com/docs/reference/slash-commands | ChatGPT desktop composer commands |
| SRC-CODEX-001 | Codex developer command reference | Official OpenAI documentation | https://learn.chatgpt.com/docs/developer-commands | Codex developer-surface commands |

## Extraction and normalization
- The community catalogue extraction contains 986 slash rows; 17 repeated tokens were collapsed, yielding 969 unique slash tokens.
- 30 additional unique CLI tokens were added from Aider, OpenCode and Gemini CLI documentation families, yielding 999 unique names.
- Every entry receives a stable ordinal ID and one functional group.
- Same-token duplicates are removed. Distinct alias spellings remain separate records and are labelled when the source inventory identifies them.
- Descriptions are transcribed from the source research inventory. This library does not claim independent command-by-command revalidation against each platform's latest version.

## Evidence status and limitations
- Community catalogue entries are community conventions, not official product specifications.
- Official-documentation additions are platform-specific. Inclusion does not imply support in ChatGPT or RIGOR-X.
- Official documentation source URLs are recorded for OpenAI, Aider, OpenCode and Gemini CLI families; command-level current-version review remains pending.
- Some alias/equivalent relationships need manual semantic review before canonical adoption.
- The 999 count is a normalized count of unique slash-prefixed names, not a count of 999 distinct executable capabilities.

## Required next validation
1. Validate every source entry's spelling, current availability, version and behaviour.
2. Resolve alias/equivalent relationships using semantic equivalence tests.
3. Identify image keywords, UI tokens and non-executable prompt macros.
4. Assign capability requirements and platform compatibility.
5. Produce the separate RIGOR-X operational registry only after owner-approved acceptance and runtime test coverage.

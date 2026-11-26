# RIGOR.X — ইঞ্জিনিয়ারিং অডিট, সংশোধন, Source Intelligence Gate ও প্রোডাকশন-হার্ডেনিং রিপোর্ট (২০২৬-১১-২৬)

**পরিধি:** `deploy/cloudflare-ts` (প্রোডাকশন Worker, canonical engine; লাইন-রেঞ্জ ধরে পড়া), `src/rigorx` (frozen protocol-1 Python reference; ঝুঁকিপূর্ণ প্যাটার্ন ধরে স্ক্যান), CI workflow, brand asset।
**শুরুর কমিট:** `bf70c7e` (main = origin/main, working tree clean)। **ব্রাঞ্চ:** `ccr-fd97ba46-y79jrw`। **main-এ merge বা deploy করা হয়নি** (কারণ PART H ও J-এ)।
**প্রমাণের ট্যাগ:** [A] এই সেশনে নিজে চালিয়ে যাচাই করা; [B] উৎস থেকে উদ্ধৃত (Cloudflare docs, MCP SDK, Crossref); [C] বিচারবুদ্ধি।
**লাইন নম্বর:** PART A-তে অডিট-করা কমিট `bf70c7e`-এর, PART B–C-তে নতুন কোডের।

---

## PART A — প্রকৃত ইঞ্জিনিয়ারিং প্রশংসা

প্রথমে যা ভালো, প্রমাণসহ। প্রশংসা মানে "ত্রুটি নেই" নয়: যেসব জায়গায় পরে ত্রুটি পাওয়া গেছে, সেখানেও মূল ধারণাটা কেন মূল্যবান তা আলাদা করে বলা আছে। Python reference-এর জন্য লাইন-ধরে নয়, প্যাটার্ন-স্ক্যান করা হয়েছে (সেটা frozen; প্রোডাকশন TypeScript)।

### A.1 সামগ্রিক স্থাপত্য — যা অবশ্যই রক্ষা করতে হবে

| বৈশিষ্ট্য | প্রমাণ (bf70c7e) | কেন গুরুত্বপূর্ণ |
|---|---|---|
| **প্রতি owner-এর জন্য আলাদা Durable Object** | `index.ts:50–53` owner-এর SHA-256 থেকে DO id; `index.ts:27–39` | একজনের ডেটা অন্যজনের SQLite-এ যায়ই না; tenant isolation কাঠামোগতভাবে, চেক দিয়ে নয়। Google `sub` সরাসরি DO নামে যায় না। |
| **Stateless tool Worker-এ, storage কেবল DO-তে** | `index.ts:41–48`: local engine-এর প্রতিটি storage method `refuse()` | দুর্ঘটনাবশত Worker-এ state লেখা অসম্ভব — "fail closed" ডিজাইন। |
| **একটাই runtime dependency** | `package.json`: শুধু `@cloudflare/workers-oauth-provider` | supply-chain পৃষ্ঠ ছোট; MCP নিজে লেখা (`mcp.ts`), তাই protocol-এর প্রতিটি আচরণ নিয়ন্ত্রণে। |
| **গোপনীয়তা: হোস্টের লেখা কেবল digest হিসেবে** | `text.ts:133–137` `storedNote`; `ledger.ts` জুড়ে `StoredText {sha256, chars}` | task, summary, claim-এর লেখা সার্ভারে নেই — শুধু SHA-256 আর দৈর্ঘ্য। privacy-by-design-এর বিরল সৎ বাস্তবায়ন। |
| **Append-only ইভেন্ট লগ + optimistic concurrency** | `store.ts:170` revision check, `store.ts:173–176` আগের প্রতিটি ইভেন্ট অপরিবর্তিত কিনা | রান-এর ইতিহাস পুনর্লিখন করা যায় না; audit trail-এর মেরুদণ্ড। |
| **স্কিমা মাইগ্রেশন idempotent, নতুন স্কিমা প্রত্যাখ্যান** | `store.ts:98–113` | অর্ধেক-প্রয়োগ হওয়া মাইগ্রেশন আবার চালালে নিরাপদ; পুরোনো কোড নতুন ডেটা নষ্ট করে না। |
| **Engine কেবল কাঠামো যাচাই করে, সত্য নয় — এবং সেটা বলেও** | `gate.ts:1–5` মন্তব্য; verify ফলাফলে `"structurally verified"` | অতিরিক্ত দাবি না করা — false assurance-এর বিরুদ্ধে সবচেয়ে বড় রক্ষাকবচ। |

### A.2 ফাইল-ধরে, লাইন-রেঞ্জ-ধরে বিশ্লেষণ (প্রোডাকশন Worker, `deploy/cloudflare-ts/src`)

**`index.ts` (৮৯ লাইন)**
- ১–১১: মন্তব্যে auth মডেল স্পষ্ট ("no static or shared token") — কোড পড়ার আগেই নিরাপত্তা-সীমা বোঝা যায়।
- ১৩–২১: import — প্রয়োজনীয় scaffolding, প্রশংসার কিছু নেই।
- ২৭–৩৯ `OwnerRuns`: DO-র ভেতরে engine তৈরি, `call()` একটাই RPC পথ — পৃষ্ঠ ছোট।
- ৪১–৪৮: local engine-এর সব storage method throw করে — উপরে বলা fail-closed।
- ৫০–৫৩ `ownerKey`: owner → SHA-256 → DO নাম; পরিচয় DO namespace-এ ফাঁস হয় না।
- ৫৫–৭৪ `backend`: RPC envelope `{ok, code, message}` — DO থেকে exception নয়, টাইপড ত্রুটি আসে। *সীমাবদ্ধতা (পরে A3):* source check-এর ক্রমে fetch আগে, quota পরে।
- ৭৬–৮৩ `serveMcp`: অপ্রত্যাশিত ত্রুটি log হয়, ক্লায়েন্ট পায় শুধু `-32603 Internal error` — stack trace ফাঁস হয় না।
- ৮৫–৮৯: প্রতিটি request OAuth provider-এর মধ্য দিয়ে যায়; `/mcp` টোকেন ছাড়া পৌঁছায় না।

**`auth.ts` (১৯৩) ও `google.ts` (১৪৬)**
- `auth.ts:67–95`: consent page → Google; `beginConsent`/`approveConsent` browser-bound single-use handle — CSRF ও replay থেকে রক্ষা।
- `auth.ts:97–141`: Google token exchange; ব্যর্থতায় কেবল status log, token নয়।
- `auth.ts:173–193`: প্রতি origin-এ একটি provider; `auth.ts:189` "No resolveExternalToken" — বাইরের টোকেন গ্রহণযোগ্য নয়, এটা সচেতন সিদ্ধান্ত।
- `google.ts:35` `scope: "openid"` — নাম বা ইমেইল চাওয়াই হয় না (data minimisation)।
- `google.ts:60–76` `parseGoogleIdToken`: iss, aud, exp, sub যাচাই; signature check বাদ দেওয়ার যুক্তি OIDC Core 3.1.3.7 উদ্ধৃত করে লেখা — সিদ্ধান্তের পেছনে মানদণ্ড।
- `google.ts:78` `escapeHtml` এবং consent page-এর প্রতিটি অবিশ্বস্ত মানে তার ব্যবহার; `google.ts:102` loopback redirect-এ সতর্কতা — phishing-সচেতন UX।
- `owner = google:<sub>`, ইমেইল কখনো নয় — পরিচয়-স্থিতিশীলতা ও গোপনীয়তা দুটোই।

**`mcp.ts` (৩৬৪)**
- ১–১২: দুই প্রোটোকল যুগ (handshake ও stateless 2026-07-28) একসাথে — মন্তব্যে reference SDK-র ক্রম উদ্ধৃত।
- ৭৭–১৪৭ `TOOLS`: প্রতিটি tool-এর বর্ণনায় সীমা ও শর্ত ("stores only as a digest", "not a truth guarantee") — হোস্ট মডেলকে সৎ থাকতে সাহায্য করে।
- ১৪৯–১৫২ `annotations`: readOnly/destructive/openWorld hint সঠিকভাবে — হোস্ট UI ঝুঁকি দেখাতে পারে।
- ১৮৪–২৩২ `handleMessage`: tool ত্রুটি `isError` result হিসেবে, protocol ত্রুটি JSON-RPC error হিসেবে — MCP-র সঠিক বিভাজন; `rigorx_verify`-এ পুরোনো `criteria` এলে সাহায্যকারী বার্তা।
- ২৩৪–২৫১ `humorTool`: প্রতিটি enum যাচাই।
- ২৬৫–২৭৫ `decodeHeaderValue`: `fatal: true` UTF-8 — নষ্ট header কখনো ভুলবশত body-র সাথে মিলবে না।
- ২৭৮–৩০৪ `classifyModern`: যাচাইয়ের ক্রম reference SDK-র মতো (`-32602 → -32020 → -32022`); auto-negotiating client-কে সমর্থিত সংস্করণ জানায়।
- ৩৩৭–৩৬৪ `handleHttp`: POST-only, batch প্রত্যাখ্যান। *সীমাবদ্ধতা (G):* body-র আকার, nesting depth, id-এর ধরন অসীমাবদ্ধ।

**`engine.ts` (৮৩৫)**
- ৩৯–৪৫ `newRunId`: ২৪ random byte → অনুমান-অযোগ্য run id।
- ৫৬–৬২ `QuotaLimits`: মন্তব্যে প্রতিটি সীমার অর্থ ও "provisional" স্পষ্ট — অস্থায়ী সংখ্যাকে স্থায়ী ভান করা হয়নি।
- ১৩৬–১৫১ `startRun`: task কেবল digest; level router থেকে seed।
- ১৬০–১৮৪ `submitStage`: mandatory stage skip অসম্ভব; partial/blocked-এ কারণ বাধ্যতামূলক।
- ১৯২: `ENGINE_TYPES` হোস্ট তৈরি করতে পারে না — compute/source-check receipt জাল করা যায় না। গুরুত্বপূর্ণ trust boundary।
- ২১৫–২৪০ `verify`: প্রতিটি যাচাই gate_version সহ রেকর্ড — পরে নিয়ম বদলালেও পুরোনো ফল শনাক্তযোগ্য।
- ৩৬৫–৩৯৩ `requiredDisclosures` ও `engineLimitations`: DELIVER-এ কী অপূর্ণ তা engine নিজে হিসাব করে — হোস্টের সততার ওপর নির্ভর নয়।
- ৫৪১–৫৬৬ `meter`: dispatch-এর আগে quota; ব্যর্থ চেষ্টাও গোনা (abuse প্রতিরোধ)।
- ৬১৬–৬২৬ `checkSummary`: অন্য স্টেজের summary পুনরাবৃত্তি ধরা — "copy-paste rigor" প্রতিরোধ।
- ৬২৮–৬৩৫ `asOf`: ভবিষ্যৎ তারিখ প্রত্যাখ্যান।
- ৬৩৭–৬৪৭ `capture`: terminal run-এ কিছু লেখা যায় না; প্রতিরানে সীমা।
- ৬৭০–৬৭৩ `runId`: ভুল ফরম্যাট = "not found" — অন্য owner-এর run আছে কিনা বোঝার কোনো oracle নেই।
- ৭৯৩–৮৩৩ `dispatch`: allow-list (`RUN_OPERATIONS`); অজানা operation প্রত্যাখ্যান।
- *সীমাবদ্ধতা:* এক operation-এর মাঝপথে ত্রুটিতে আগের write থেকে যায় (C1); compute-এ অপ্রত্যাশিত exception 500 হয় (E)।

**`run.ts` (২১৬) ও `protocol.ts` (৭৮)**
- `protocol.ts:24–40` `ADDED_AT`: mandatory stage-গুলো level অনুযায়ী ক্রমবর্ধমান — টেবিল-চালিত, পড়তে ও পরীক্ষা করতে সহজ।
- `protocol.ts:45` `STAKES_FLOOR`: ঘোষিত stakes level-এর নিচের সীমা ঠিক করে।
- `run.ts:146–152` `raiseLevel`: level কখনো নামে না।
- `run.ts:155–175` `reenter`: budget-সীমিত; অ-mandatory stage-এ ফেরার প্রান্তিক ক্ষেত্রও সামলানো।
- `run.ts:178–204` `optimizeOutcome`: fingerprint দিয়ে no-progress ধরা, সর্বোচ্চ ২ চক্র — অসীম লুপের বিরুদ্ধে প্রমাণযোগ্য সুরক্ষা।

**`ledger.ts` (৩৬১)**
- ১১৫–১৫৪ `classifyContract`: `ledger.ts:120` — router কোনো সংকেত না পেলে level ও stakes ঘোষণা বাধ্যতামূলক ("unknown is not low risk")। দারুণ দার্শনিক সঠিকতা।
- ১৮১–২৩৭ `planContract` + `findCycle` (Kahn's algorithm, ২১৩): plan graph-এ cycle পথসহ রিপোর্ট।
- ২৬৩–৩২২ `evaluationContract`: `ledger.ts:279` "measured ZERO needs evidence … never ZERO" — unknown কে zero বানানোর বিরুদ্ধে কোড-স্তরের নিয়ম।
- ৩২৪–৩৪০ `stressContract`: প্রতিটি must-requirement-এর অন্তত একটি failure scenario (৩৩৮)।
- *সীমাবদ্ধতা:* EXECUTE-এ dependency যাচাই নেই (D); approval যেকোনো operation-এর জন্য চলে (B1)।

**`gate.ts` (২৩৬)**
- ১০৪–১১১ `requirements_have_own_evidence`, ১১৩–১৩০ `items_have_own_evidence`: একটি উৎস দিয়ে নয়টি প্রতিযোগী "কভার" করা যায় না — Test A-র মূল শিক্ষা কোডে।
- ১৫৫: "unknown age is not fresh" — তারিখহীন উৎস তাজা নয়।
- ১৬২–১৬৫ `cited_receipts_ok`: ব্যর্থ compute receipt সমর্থন হিসেবে চলে না (Test B)।
- *সীমাবদ্ধতা:* claim–requirement সংযোগ এক এক চেকে এক এক রকম (B3); numeric claim যেকোনো সফল compute-এ পাস (B2); `origin()` DOI prefix দিয়ে উৎস মেলায় (B5)।

**`compute.ts` (৩৫৪)**
- ২৬–৫০: rational exponent-এর `Q` class — `sqrt`, ভগ্নাংশ ঘাত মাত্রায় নির্ভুল থাকে; floating-point মাত্রা-ভুল অসম্ভব।
- ১১: Gaussian বনাম SI নিয়ে মন্তব্য — CGS ইউনিট ভুল লেবেলের ঝুঁকি স্পষ্ট নাম ধরে বলা (EUV test-এর শিক্ষা)।
- `eval` নেই; tokenizer + recursive descent; nesting ৫০ ও token ৫০০ সীমা।
- CI-তে pint-এর বিরুদ্ধে differential test (worst 8.76e-13 [A])।
- *সীমাবদ্ধতা (E):* ইউনিট exponent-এ `rational()` null হলে `TypeError`।

**`memory.ts` (৪২৩)**
- ৯–১৮: retrieval-এর নকশা মন্তব্যে যুক্তিসহ — কেন BM25 শুধু candidate বাছে আর coverage দিয়ে abstention।
- ৩৮ `MIN_LEXICAL` এবং benchmark-এ sensitivity রিপোর্ট — threshold আগে ঠিক করে পরে মাপা (pre-registration)।
- ১৬৮–১৭২ `guard`: ব্যবহারকারীর রাখা topic হোস্ট বদলাতে পারে না — "user has the last word"।
- ৩৫: প্রতি topic-এ ঘণ্টায় ৬০ write; ১২০ MB কোটা।
- ৩১১–৩২০ `deleteItems`: আসল মোছা + বিষয়বস্তুহীন audit row।
- ৩৯৯–৪০৫ `envelope`: "data, not instructions" — memory poisoning-এর বিরুদ্ধে প্রথম স্তর।
- *সীমাবদ্ধতা:* merge-এ আংশিক mutation (C1), move-এ raw constraint error (C2), "AI"→"chair" (C3), সীমাহীন supersedes (C4)।

**`text.ts` (১৪২)**
- ২৩ `chars`: code point গোনা — Python-এর `len` এর সাথে মিল; বাংলা/ইমোজিতে ভুল দৈর্ঘ্য নয়।
- ৩৯–৪৮ `SPACELESS` ও ৬২–৬৬ `charUnits`: থাই, জাপানি, চীনা লেখার শব্দ/অক্ষর গণনা — ভাষা-নিরপেক্ষতার বাস্তব কাজ।

**`router.ts` (১৫৩)**
- ১১৩: কোনো সংকেত নেই মানে `UNKNOWN`, "simple" নয়।
- *সীমাবদ্ধতা (F):* `/l01` টোকেন ঝুঁকিপূর্ণ কাজকে L01-এ নামাতে পারে; শুধু ইংরেজি ঝুঁকি-শব্দ।

**`source.ts` (৯৯)**
- ৩৭: credential-সহ URL প্রত্যাখ্যান; ২০ `MAX_BYTES` ১ MiB streaming cap; timeout।
- ২৩ DOI-কে doi.org দিয়ে resolve — scholarly identity সম্পর্কে সচেতনতা।
- *সীমাবদ্ধতা (A1, A2):* `redirect: "follow"` — redirect-এর গন্তব্য যাচাই হয় না; regex-ভিত্তিক private-host তালিকা অসম্পূর্ণ।

**`humor.ts`, `commands.ts`, `pipeline.ts`**
- `humor.ts`: "unknown context is not safe" — সবচেয়ে সীমাবদ্ধ নিয়ম জেতে; গবেষণা উদ্ধৃত, এবং নিজেকে "heuristic, not validated" বলে।
- `commands.ts`: ৯৯৯-এন্ট্রি catalogue, Python resolver-এর সাথে ১৩ prompt-এ অভিন্ন (CI)।
- `pipeline.ts`: protocol-1 run read-only রাখার জন্য — পুরোনো ডেটা হারায় না।

**Python reference (`src/rigorx`, ৪,১৭৬ লাইন)** — `model_backend.py:24–31` `_NoRedirect`: API key কেবল কনফিগার করা endpoint-এই যায়; `:60` remote endpoint-এ HTTPS বাধ্যতামূলক। `eval`, `pickle`, `subprocess` ব্যবহার নেই [A]।

**CI** — action-গুলো commit SHA দিয়ে pinned, `permissions: contents: read`; workerd-এ আসল DO SQLite ও আসল auth path; অফিসিয়াল MCP SDK দিয়ে তিন মোডে conformance। একক ডেভেলপার প্রজেক্টে এই মানের CI বিরল [A]।

### A.3 মূল্যায়ন [C]
এই কোডবেসের সবচেয়ে মূল্যবান গুণ **সৎ নকশা**: সীমা লিখে রাখা, unknown-কে zero না বানানো, "structurally verified"-এর বেশি দাবি না করা, প্রতিটি সিদ্ধান্তের পেছনে ADR ও মানদণ্ড। ত্রুটিগুলো প্রায় সবই এই নীতির *অসম্পূর্ণ প্রয়োগ* — নীতির ব্যর্থতা নয়। তাই সংশোধনগুলো পুরোনো কাঠামো ভেঙে নয়, সেই নীতিকে শেষ পর্যন্ত টেনে নিয়ে করা হয়েছে।

---

## PART B — সম্পূর্ণ অডিট (Finding register)

প্রতিটি পূর্ববর্তী সূত্র (A1–H) বর্তমান কোডে পুনর্যাচাই করা হয়েছে: **১৭টি reproduction test লেখা হয়েছিল ঠিক-করা আচরণ দাবি করে, এবং সবকটি `bf70c7e`-এ fail করেছিল** [A] (`test/audit.test.ts`; আগের আউটপুট সংরক্ষিত)। "Confidence: CONFIRMED" মানে test বা live probe-এ পুনরুৎপাদিত।

| ID | ফাইল:লাইন (bf70c7e) | Severity | মূল কারণ | ব্যর্থতার দৃশ্য | সংশোধন (নতুন কোড) | প্রমাণ |
|---|---|---|---|---|---|---|
| **A1** redirect SSRF | `source.ts:57–60` | HIGH (কোড); Cloudflare-এ কার্যত MEDIUM | `redirect: "follow"`; শুধু প্রথম URL যাচাই | public URL → 302 → `169.254.169.254` (metadata) বা loopback | `source.ts:296` manual redirect; প্রতি hop `checkUrl` (`:172`); loop ও >১০ hop থামে | audit test A1×2; **live**: postman-echo 302→169.254.169.254 প্রত্যাখ্যাত "link-local (IPv4)" এবং `[::ffff:7f00:1]` প্রত্যাখ্যাত [A] |
| **A2** private host | `source.ts:23` regex | HIGH | string regex; IPv6/mapped/CGNAT/NAT64/trailing dot বাদ | `[::ffff:7f00:1]`, `[fe80::1]`, `[::]`, `100.64.0.1`, `localhost.`, `224.0.0.1` সব ALLOW ছিল [A] | `source.ts:89–170`: IPv4/IPv6 parser, IANA special-purpose রেজিস্ট্রি (RFC 6890+), mapped/compatible/NAT64/6to4 এর ভেতরের IPv4 যাচাই, local suffix, single-label, port allowlist | ৪২-এন্ট্রি corpus test |
| **A3** quota-র আগে fetch | `index.ts:61–65` | MEDIUM | fetch আগে, metered `record_source_check` পরে | কোটা শেষ owner অসীম বাইরের request করাতে পারত (cost amplification) | `engine.ts:72–79`: `evidence_for_check` এখন reservation (metered), fetch-এর আগেই; terminal run/পূর্ণ evidence fetch-এর আগে প্রত্যাখ্যাত | test: কোটা শেষে fetch = 0; বাতিল run-এ fetch = 0 [A] |
| **B1** approval-এর সত্যতা | `ledger.ts:254–258` | HIGH | যেকোনো `USER_APPROVAL` যেকোনো operation-এ, একাধিকবার, মেয়াদহীন | এক approval দিয়ে দুটি A4 operation; plan বদলালেও পুরোনো approval চলে | `engine.ts:252–268` `approves` বাধ্যতামূলক; operation digest, approval_id, ২৪ ঘণ্টা মেয়াদ; `ledger.ts:241–262` single-use, digest মেলানো; gate-এও একই | test: পুনর্ব্যবহার, মেয়াদোত্তীর্ণ, plan-পরিবর্তন প্রত্যাখ্যাত; মেয়াদ বিচার হয় operation সম্পন্ন হওয়ার সময়ে, পরের validation-এ নয় [A]। **বাকি:** authenticity এখনো `host_declared` (PART I) |
| **B2** numeric binding | `gate.ts:210–212` | HIGH | "কোনো সফল compute receipt আছে কি না" | `1+1` compute দিয়ে "42 kW" claim L06 পাস; ৪২ kW যাচাই দিয়ে "৪৩ kW" পাস | `gate.ts:34–55` `receiptSupportsClaim`: receipt-এর `expect` পাস এবং সেটাই claim-এর মান (মাত্রা ও SI মান 1e-9) | test B2×2; conformance Test B হালনাগাদ [A] |
| **B3** requirement-link bypass | `gate.ts:170, 199, 210` | HIGH | কিছু চেক শুধু `requirement_ids`, কিছু evidence-overlap | `requirement_ids` বাদ দিলে UNKNOWN মান met requirement সমর্থন করত | `gate.ts:198–206` একটি resolver (ids অথবা শেয়ার করা evidence), সব চেকে | test B3 [A] |
| **B4** validated memory provenance | `engine.ts:497–502` | HIGH | শুধু "run validated কিনা" | যেকোনো লেখা `run_validated` (উচ্চ trust) হিসেবে জমা | `engine.ts:635–668` `validatedAnchor`: লেখাটি হুবহু validated claim/evidence (SHA-256), met requirement-এ যুক্ত; `content_sha256` সংরক্ষিত; recall-এ `integrity` | test: জাল প্রত্যাখ্যাত, এক শব্দ বদলালে প্রত্যাখ্যাত, tamper হলে trust নেমে যায় [A] |
| **B5** source independence | `gate.ts:51–59`, `:206–209` | MEDIUM | `origin()` = host বা DOI prefix | একই প্রকাশকের দুটি ভিন্ন গবেষণা = ১ উৎস; `news.`/`www.` = ২ উৎস; একই DOI বনাম publisher URL = ২ | `sources.ts:336–409` union-find independence group; L06 চেক তা ব্যবহার করে | `test/sources.test.ts` [A] |
| **C1** merge atomicity | `memory.ts:216–232` | MEDIUM | collision ধরা পড়ে item সরানোর পরে; DO-তে exception rollback করে না | merge ব্যর্থ, কিন্তু item ও কিছু subtopic সরে গেছে | `memory.ts:238–247` preflight; **প্রতিটি operation একটি transaction** (`index.ts:37` `transactionSync`, `engine.ts:960`) | unit test; **workerd-এ**: throw করলে rollback, merge-collision-এ তালিকা অপরিবর্তিত [A] |
| **C2** move collision | `memory.ts:202–214` | LOW–MEDIUM | UNIQUE constraint-এর ওপর নির্ভর | raw SQLite error → HTTP 500 | `memory.ts:224–227` আগেই যাচাই, `INVALID_REQUEST` | test [A] |
| **C3** retrieval precision | `memory.ts:87–98, 347` | MEDIUM | ছোট token substring হিসেবে | "AI" খুঁজলে "chair" আসত | `memory.ts:85–110` whole-word ম্যাচ | test; benchmark অপরিবর্তিত (recall@3 1.000, MRR 1.000) [A] |
| **C4** supersedes scope | `memory.ts:271–274, 301` | HIGH | যেকোনো topic-এর যেকোনো item | হোস্ট অন্য topic-এর user_confirmed item নিষ্ক্রিয় করতে পারত | `memory.ts:292–298` একই topic; user-এর বা উচ্চতর trust-এর item কেবল user বদলাতে পারে | test [A] |
| **C5** quota completeness | `engine.ts:65–68` | LOW | reads/deletes মিটারহীন; `memory_topic list` mutation হিসেবে গোনা | CPU-ভারী recall সীমাহীন; topic তালিকা দেখলেই দৈনিক কোটা খরচ | `engine.ts:81–83` reads/deletes burst-এ গোনা, দৈনিক কোটায় নয়; topic list = read | test; workerd [A] |
| **D** dependency integrity | `ledger.ts:239–261` | MEDIUM | EXECUTE-এ `depends_on` দেখা হত না | prerequisite failed, dependent "done" | `ledger.ts:264–271, 288–291` প্রত্যাখ্যান; gate `dependencies_done` | test [A] |
| **E** compute exception | `compute.ts:147` | MEDIUM | `rational(exp)!` null হলে `TypeError` | `2 [m^2000]` → HTTP 500 | `compute.ts:151` controlled error; exponent সীমা; unit factor overflow ধরা; engine-এ defence-in-depth | **live production-এ পুনরুৎপাদিত** ("Bad Gateway"; control `2 [m^2]` ঠিক) [A]; ২০,০০০-কেস fuzz [A] |
| **F** risk floor | `router.ts:128–147` | HIGH | explicit level ঝুঁকিকে override করত; শুধু ইংরেজি | `/l01 delete the production database…` → L01 | `router.ts:175–207`: explicit level risk floor-এর নিচে নয় (ঝুঁকি → L03; ঝুঁকি+ধ্বংসাত্মক বা ≥৩ → L05); ১০টি ভাষায় ঝুঁকি-শব্দ | **live production-এ পুনরুৎপাদিত**: L01, এবং বাংলা ব্যাংক-পাসওয়ার্ড প্রশ্ন risk 0 [A] |
| **G** MCP protocol limits | `mcp.ts:337–364` | MEDIUM | body, depth, id সীমাহীন | ২ MB body গৃহীত; object id গৃহীত | `mcp.ts:357–416`: ১ MiB (413), depth ৩২, id = string/integer | test [A] |
| **H** test gaps | — | MEDIUM | append-only চেক, SSRF redirect, approval, provenance-এর test ছিল না | — | ৩৭টি নতুন TypeScript test (+ workerd ২, Python ২) | PART G |

**নতুন আবিষ্কৃত ত্রুটি (আগের তালিকায় ছিল না):**

| ID | Severity | বিবরণ | অবস্থা |
|---|---|---|---|
| N1 | MEDIUM | `rigorx_check_source` ফলাফলের বিবরণ (status, sha) হোস্টকে ফেরত দিত না — শুধু evidence_id | ঠিক: `check` ও untrusted-data notice ফেরত [A] |
| N2 | MEDIUM | redirect সীমা ৫ বাস্তবে কম: Springer DOI-তে ৬ hop (live) | ঠিক: ১০; live Springer resolve [A] |
| N3 | LOW | dev server-এ topic memory ছিল না (MemoryStore দেওয়া হয়নি) | ঠিক |
| N4 | LOW | source-check প্রবাহ তিন জায়গায় কপি (Worker, test, dev server) | ঠিক: `runSourceCheck` (`source.ts:379`) |
| N5 | LOW | README বাসি (schema "version 2", resolve_commands "not available") | ঠিক |
| N6 | LOW | Elsevier DOI HTML/JS redirect পাতায় থামে ("Redirecting") | খোলা (PART I); Crossref metadata পূরণ করে |
| N7 | INFO | prompt-injection: উৎসের লেখা হোস্টে ফেরার পথ | নতুন: শুধু পরিষ্কার metadata + `injection_signals` |

---

## PART C — BEFORE / AFTER

| বিষয় | আগে | এখন | কেন ভালো | Trade-off |
|---|---|---|---|---|
| Redirect | runtime অনুসরণ করত, গন্তব্য অযাচাইকৃত | প্রতি hop যাচাই, chain রেকর্ড (`redirects`) | SSRF বন্ধ; কোন পথে পৌঁছল দেখা যায় | hop প্রতি একটি subrequest (≤১৩, Free প্ল্যানে ৫০ সীমা [B]) |
| কোটা ও fetch | fetch আগে | reservation আগে | কোটা শেষে বাইরের request শূন্য | ব্যর্থ fetch-ও কোটা খরচ করে (ইচ্ছাকৃত) |
| Numeric claim | যেকোনো সফল compute | claim-এর নিজের মান যাচাই করা compute | "অসম্পর্কিত হিসাব দিয়ে বৈধতা" অসম্ভব | L06-এ numeric claim-এ `value` বাধ্যতামূলক (protocol কঠোরতর) |
| Claim–requirement | চেকভেদে ভিন্ন | এক resolver | ID বাদ দিয়ে ফাঁকি অসম্ভব | ভাগ করা evidence-এ false positive সম্ভব (রক্ষণশীল পছন্দ) |
| Approval | যেকোনো, বারবার, চিরকাল | একটি operation, একবার, ২৪ ঘণ্টা, digest-বাঁধা | replay ও scope-escalation বন্ধ | হোস্টকে `approves` দিতে হবে; সত্যতা এখনো host-declared |
| Memory trust | `run_validated` ঘোষণাতেই | SHA-256-বাঁধা anchor | বিশ্বস্ত memory জাল করা যায় না | লেখা হুবহু claim হতে হবে |
| Operation atomicity | আংশিক write থেকে যেত | transaction | ব্যর্থ operation কিছুই বদলায় না | নগণ্য overhead (নিচে মাপা) |
| Independence | host/DOI prefix | canonical identity + union-find | একই কাজ এক উৎস; ভিন্ন কাজ ভিন্ন | একই registrable site-এর ভিন্ন subdomain একই উৎস (কঠোরতর); fixtures হালনাগাদ |
| Routing | `/l01` সব জিতত | risk floor | ঝুঁকিপূর্ণ কাজে যাচাই বাদ দেওয়া যায় না | `/l01 what is a password manager` এখন L03 |
| Store append-only চেক | পুরোনো snapshot পুনরায় parse + প্রতি ইভেন্ট দুবার serialize | SQLite `json_array_length` + একবার serialize | একই নিশ্চয়তা, কম CPU | — |

---

## PART D — SOURCE INTELLIGENCE GATE (নয়টি ডোমেইন)

**স্থাপত্য:** `src/sources.ts` + tool `rigorx_assess_sources` + `rigorx_check_source`-এর adapter + gate 2.1.0। মূলনীতি: ডোমেইন হলো *আবিষ্কারের* শ্রেণি, বিশ্বাসের স্তর নয় — কোনো উৎস শ্রেণির কারণে credibility পায় না; শ্রেণি শুধু কোন চেক প্রযোজ্য তা বদলায় [A: `inferDomain`-এ কোনো score নেই]।

**৬.১ Identity:** `canonicalRef` (`sources.ts:156`) DOI (সব বানান, publisher URL-এর `/doi/…`), arXiv (version বাদ), PubMed/PMC, x.com/twitter.com status, youtu.be/youtube.com, reddit, Wayback archive → original + snapshot, এবং normalized URL (scheme, www/m/amp, tracking parameter, fragment, trailing slash বাদ)। Source check থেকে alias: final URL, rel=canonical, citation_doi, content SHA-256, wire byline।
**৬.২ Lifecycle:** DISCOVERED → (ACQUISITION_FAILED | ACQUIRED → PARSED) → CROSS_CHECKED; verdict ACCEPTED / DISPUTED / REJECTED / INSUFFICIENT, প্রতিটির কারণসহ। ("NORMALIZED" প্রতিটি উৎসে সবসময় ঘটে, তাই আলাদা অবস্থা হিসেবে দেখানো হয় না।)
**৬.৩ Provenance:** raw bytes রাখা হয় না (privacy নীতি: শুধু SHA-256 + metadata); hash দিয়ে বিষয়বস্তু-পরিবর্তন ধরা যায়; append-only receipt।
**৬.৪ Cross-domain:** নির্দেশনার উদাহরণটি হুবহু test করা হয়েছে (`test/sources.test.ts`): ছয়টি রিপোর্ট + archive একটি পোস্টের → **১টি independent origin**, `missing: "a second independent origin (all 7 sources trace to x:status:99)"`, স্থানীয় সাক্ষীর বিপরীত দাবি → `DISPUTED` [A]।
**৬.৫ Claim-level:** প্রতি claim-এ independent_origins, shared_origins (কেন মেলানো হল), domains, contradiction, retraction, missing evidence, D09 অবস্থা।

| ডোমেইন | বাস্তবায়িত কার্যকারিতা | Acquisition | Cross-check | নিরাপত্তা-সীমা | অবস্থা | Test |
|---|---|---|---|---|---|---|
| D01 Surface web | সরাসরি fetch, metadata, canonical | `rigorx_check_source` | rel=canonical, redirect chain, hash | শুধু public host, প্রতি hop | **OPERATIONAL** | live: Nature DOI ৪ hop, metadata সঠিক [A] |
| D02 Specialist | DOI/arXiv/PubMed identity; Crossref metadata ও **retraction** | doi.org + api.crossref.org | এক কাজ এক উৎস; retracted কাজ gate-এ ব্যর্থ | public API মাত্র | **PARTIAL** (OpenAlex citation graph, dataset version নেই) | live: Wakefield 1998 `retracted: true` (২০১০, Retraction Watch); Nature কাগজ false [A] |
| D03 Restricted | হোস্ট যা নিজের অনুমোদিত connector-এ পড়েছে তা `access` সহ রেকর্ড | কোনোটি নয় (নকশাগতভাবে) | একক origin হিসেবে corroboration দরকার | auth bypass, credential, চুরি করা ডেটা নিষিদ্ধ; private host fetch প্রত্যাখ্যাত | **CONTRACT_ONLY** | test |
| D04 Local/ground | `field:<id>` intake, `as_of`, ঘোষিত D04 | হোস্ট | ভিন্ন origin হলে আলাদা group | RIGOR-X field data বানায় না | **CONTRACT_ONLY** | test |
| D05 Archive | archive → original identity; Wayback availability | archive.org API | archive ও original এক group | archived ≠ authentic | **PARTIAL** (snapshot diff নেই) | live: example.com snapshot [A] |
| D06 Social/UGC | post identity host-নিরপেক্ষ; repost = derived_from | public URL fetch | এক পোস্টের সব রিপোর্ট এক origin | login/scraping নেই | **PARTIAL** (platform API-তে credential লাগবে) | test |
| D07 Mainstream | metadata; wire byline ও canonical দিয়ে syndication | `rigorx_check_source` | দশটি wire-কপি = ১ | public মাত্র | **PARTIAL** (correction tracking নেই) | test |
| D08 Alternative | D01-এর মতো; funding ইত্যাদি ঘোষণাযোগ্য | — | না বাতিল, না বিশ্বাস | — | **PARTIAL** (funding lookup নেই) | — |
| D09 Fringe/unverified | নিয়ন্ত্রিত পথ; claim status → D09 অবস্থা (UNVERIFIED…REFUTED) | হোস্ট ঘোষণা করে | **L03+-এ শুধু D09 দিয়ে requirement met হয় না** | instruction/trust বদলাতে পারে না; elevated হয় না | **OPERATIONAL** | gate test [A] |

**Untrusted content (§07):** fetch-করা বিষয়বস্তু পুরো ফেরত যায় না; শুধু ৩০০ অক্ষর পর্যন্ত metadata, control/zero-width/bidi অক্ষর মুছে; `injection_signals` ("asks to ignore earlier instructions", "asks to mark something as verified" ইত্যাদি) — test-এ যাচাই [A]। এটা heuristic, সম্পূর্ণ নয় [C]।

---

## PART E — PERFORMANCE

পরিমাপ: `scripts/bench.ts`, একই harness দুটি checkout-এ (`bf70c7e` git worktree বনাম নতুন), Node 22.23.5 + node:sqlite, প্রতিটি তিনবার, median-এর median [A]। workerd নয় — Cloudflare-এ CPU সময় শুধু dashboard-এ দেখা যায় (সীমাবদ্ধতা)।

| Operation | আগে median (ms) | এখন median (ms) | পরিবর্তন | p95 আগে → এখন |
|---|---|---|---|---|
| `memory_recall` (২,০০০ item) | 35.80 | 26.02 | **−27%** | 142.2 → 90.5 (**−36%**) |
| `record_evidence` (৩৫০–৪০০তম) | 2.68 | 2.40 | −10% | 3.30 → 3.67 (noise-সীমায়) |
| ৪০০ `record_evidence` মোট | 653 | 622 | −5% | — |
| `start_run` | 0.169 | 0.213 | +0.04 ms | 0.38 → 0.48 |
| `get_run` | 0.025 | 0.030 | +0.006 ms | — |
| `route` | 0.026 | 0.048 | +0.022 ms | — |
| `memory_write` | 0.41 | 0.44 | noise-সীমায় | — |
| `tools/list` | 0.003 | 0.004 | — | — |

- **উন্নতির কারণ:** recall-এ ছোট term-এর prefilter SQLite-এর `instr()`-এ (C-তে), MMR শুধু শীর্ষ `max(8×limit, 64)` candidate-এ, trigram set একবার; store save-এ পুনরায় parse নেই।
- **Regression ও কারণ (সৎভাবে):** `route` +২২ µs — বহুভাষিক ঝুঁকি-lexicon (F-এর মূল্য); তাই `start_run` +০.০৪ ms। transaction overhead আলাদা করে মাপা হয়েছে: tx-সহ ও tx-ছাড়া পার্থক্য noise-এর মধ্যে [A]।
- **Network:** `check_source` এখন সর্বোচ্চ ১ + ১০ hop + Crossref + Wayback = ১৩ বাইরের request (Free প্ল্যান সীমা ৫০ [B]); কোটা শেষে ০ (আগে সীমাহীন)।
- **Cache:** icon-গুলো static asset — Worker চলে না, request বিনামূল্যে ও সীমাহীন [B: Cloudflare docs]; tools/list `ttlMs` ১ ঘণ্টা (আগের মতো)।
- **খরচ:** workerd-এ rows written অপরিবর্তিত (start_run 5, অন্য write 3, get_run 0) [A]।
- **মাপা হয়নি:** workerd CPU, p95 latency প্রোডাকশনে, throughput — অনুমান করা হয়নি।

---

## PART F — LOGO & UI

- **উৎস:** সংযুক্ত emblem = `assets/brand/aetherica-emblem.png` বাইট-অভিন্ন (SHA-256 `2567e338…`) [A]; ৪৭৩×৪৫৬, RGBA কিন্তু সব pixel অস্বচ্ছ।
- **জ্যামিতি:** ring কেন্দ্র প্রায় (২৪০, ২৫০), ব্যাসার্ধ ~১৪৫; halo-র শিখা উৎস ছবির উপরের কিনারায় কাটা; drips y≈৪৫০; "0°" নিচে-বামে (~২৭০ px দূরে)।
- **সিদ্ধান্ত:** উৎসের ভেতরে থাকা সবচেয়ে বড় বৃত্ত (ব্যাস ৪৫৬, কেন্দ্র (২৪০, ২২৮)) — প্রতিটি pixel emblem-এর নিজের, কিছুই আঁকা/বানানো হয়নি। ring, halo ও শিখা, ষাঁড়, পাশের শিখা, drips সব আছে।
- **Trade-off (প্রকাশিত):** "0°" চিহ্ন ও বেস-লাইনের বাম প্রান্ত বাদ পড়ে। বড় বৃত্ত (r=২৬৮) বানিয়ে দেখা হয়েছে: ~৬০ px পটভূমি বানাতে হয় এবং কাটা halo-শিখা শক্ত রেখা দেখায় — তাই বাতিল। "0°" রাখতে বড় বা vector master লাগবে।
- **ফাইল:** `deploy/cloudflare-ts/public/icon-{32,48,64,96,128,192,256,448}.png`, `favicon.ico` (16/32/48 ICO)। RGBA 8-bit, কোণে alpha ০, কেন্দ্রে ২৫৫, শুধু IHDR/IDAT/IEND (metadata নেই), কখনো upscale নয়, deterministic (দুবার চালালে বাইট-অভিন্ন) [A]। জেনারেটর: `assets/brand/tools/make_circular_icon.py`।
- **UI integration:** MCP `serverInfo.icons` (৪৮/৯৬/১৯২/৪৪৮, absolute URL, `image/png`) — হোস্টের connector তালিকায়; consent, privacy, terms ও message পাতায় emblem ও favicon। Workers static assets (`run_worker_first` সব পথ, icon ছাড়া) — OAuth navigation-এর routing অপরিবর্তিত।
- **Rendering যাচাই:** `wrangler dev`-এ icon `image/png`, বাইট-অভিন্ন; navigation request (`Sec-Fetch-Mode: navigate`) এখনো Worker-এ; consent CSP শুধু `frame-ancestors 'none'` তাই ছবি চলে [A]। Chromium-এ (৩৯০px, deviceScaleFactor 2) light ও dark mode-এ: ছবি লোড, natural 192×192, দেখানো 72×72, horizontal overflow নেই, কোণ স্বচ্ছ [A] (`test/integration/ui-render.mjs`)। CI-তে `tests/test_brand_icons.py` (stdlib PNG decoder) বৃত্ত, স্বচ্ছতা, chunk যাচাই করে।
- **সীমাবদ্ধতা:** dark পটভূমিতে icon-এর গাঢ় কিনারা কম দৃশ্যমান (emblem-এর নিজের পটভূমি); Claude/ChatGPT আসলে icon দেখায় কিনা deploy ও connector refresh-এর পর দেখা বাকি।

---

## PART G — TEST RESULTS

| Test | Status | Evidence (command → result) | Notes |
|---|---|---|---|
| Typecheck | **PASS** | `npm run typecheck` (tsc --strict) → no errors | |
| Unit tests (TS) | **PASS** | `npm test` → 115/115 (আগে 78) | +২৭ audit, +১০ sources |
| Reproduction (আগে) | **FAIL→PASS** | একই ১৭টি test `bf70c7e`-এ 17/17 fail | ত্রুটি নিশ্চিতকরণ |
| Conformance | **PASS** | ৫টি scenario (২টি fixture spec অনুযায়ী হালনাগাদ) | |
| Integration (workerd) | **PASS** | `node test/integration/run.mjs` → 7/7 | নতুন: transaction rollback, merge collision |
| Auth probe | **PASS** | `node test/integration/auth-probe.mjs` → 7/7 | নতুন: static asset, navigation |
| MCP SDK conformance | **PASS** | `mcp_smoke.py` auto/legacy/2026-07-28 → COMPLETED ×3 | |
| Security | **PASS** | SSRF corpus (৪২), redirect, quota, approval, provenance, injection, MCP limits; ২০,০০০ compute fuzz | live SSRF redirect প্রত্যাখ্যাত |
| Python | **PASS** | `python -m unittest discover -s tests` → 205 OK (আগে 203) | +brand icons |
| Lint | **PASS** | `ruff check src tests examples deploy assets` | |
| Parity | **PASS** | catalogue sync; compute vs pint worst 8.76e-13 | |
| Build | **PASS (local)** | wrangler dev দুই config-এ চলে | `wrangler deploy` চালানো হয়নি |
| Performance | **PASS (local)** | `scripts/bench.ts` ×৩ ×২ | workerd নয় |
| UI | **PASS** | Chromium light/dark, phone width | |
| Live production | **PARTIAL** | unauthenticated 401 + metadata ঠিক; route/compute দিয়ে F ও E production-এ উপস্থিত নিশ্চিত | নতুন কোড deploy হয়নি, তাই live-এ যাচাই হয়নি |
| Dependency audit | **BLOCKED/অচালিত** | `npm audit` চালানো হয়নি | lockfile অপরিবর্তিত, নতুন dependency নেই |
| GitHub CI | **অচালিত** | workflow শুধু main-এ push বা PR-এ চলে | |

---

## PART H — GIT SUMMARY

- **শুরু:** `bf70c7e`। **ব্রাঞ্চ:** `ccr-fd97ba46-y79jrw` (push করা)। checkpoint `ce918d9`, তারপর শেষ কমিট (এই রিপোর্টসহ)।
- **পরিবর্তন:** ৫০+ ফাইল (প্রায় ১৭টি নতুন, ৩৩টি সংশোধিত, কোনোটি মোছা হয়নি)।
- **নতুন:** `src/sources.ts`, `test/audit.test.ts`, `test/sources.test.ts`, `test/integration/ui-render.mjs`, `scripts/bench.ts`, `scripts/live_source_check.ts`, `public/*` (৯টি icon), `assets/brand/tools/make_circular_icon.py`, `tests/test_brand_icons.py`, এই রিপোর্ট।
- **নতুন dependency:** নেই। secret/credential: নেই (diff পরীক্ষিত)।
- **main-এ merge হয়নি:** মালিকের স্থায়ী নির্দেশ "কাজ শেষ হলেই merge" (main-এ push = স্বয়ংক্রিয় deploy), কিন্তু এই directive-এর §17/§STAGE 10 বলে "Deployment must be a separately controlled action … Do not deploy without appropriate authorization"। বর্তমান নির্দেশ অগ্রাধিকার পায়, তাই merge/deploy মালিকের সিদ্ধান্তের জন্য রাখা হয়েছে।

---

## PART I — REMAINING BLIND SPOTS

**HIGH**
- **User approval-এর সত্যতা:** approval এখন operation-বাঁধা, single-use, মেয়াদি — কিন্তু তবুও হোস্টের ঘোষণা। সত্যিকারের প্রমাণের জন্য দরকার out-of-band approval পাতা (Worker-এ, Google দিয়ে একই অ্যাকাউন্টে sign-in, action-এর বিবরণ দেখিয়ে) যা ENGINE_VERIFIED approval তৈরি করবে। নকশা পরিষ্কার, তৈরি হয়নি।
- **নতুন কোড production-এ নেই:** F ও E production-এ এখনো আছে (live-এ দেখা)।

**MEDIUM**
- DNS rebinding (public নাম → private IP) RIGOR-X resolve করে না; Cloudflare edge private network-এ route করে না [B], কিন্তু dev server করে।
- HTML/JS redirect (Elsevier) অনুসরণ হয় না।
- Independence: check ছাড়া publisher URL ও DOI মেলে না; public suffix তালিকা আংশিক; paraphrase-কপি ধরা পড়ে না।
- Prompt-injection শনাক্তকরণ heuristic।
- GitHub CI এই ব্রাঞ্চে চলেনি।

**LOW**
- `route` CPU +২২ µs; multilingual lexicon-এর শব্দ বানান-ভুল/ভাঙা লেখা ধরে না।
- icon-এ "0°" নেই (উৎসের সীমা)।

**BLOCKED**
- workerd-এ CPU/latency পরিমাপ (dashboard লাগে)।
- Claude/ChatGPT-এ নতুন tool ও icon live দেখা (deploy ও connector refresh লাগে)।
- Platform API (social), OpenAlex, funding database — credential/প্রদায়ক নেই।

**FUTURE IMPROVEMENT**
- snapshot diff (D05), correction tracking (D07), citation graph (D02), field-data geocoding (D04)।
- বড় memory মূল্যায়ন (LongMemEval-ধরনের)।

---

## PART J — FINAL STATUS

**TESTED** — সব unit, conformance, workerd integration, auth, SDK conformance, UI ও নিরাপত্তা test পাস, এবং প্রতিটি সংশোধনের আগে ত্রুটিটি test-এ পুনরুৎপাদিত হয়েছিল।

**কেন RELEASE CANDIDATE নয়:** (১) নতুন কোড deploy ও live-যাচাই হয়নি; (২) GitHub CI এই ব্রাঞ্চে চলেনি; (৩) নিরাপত্তা পর্যালোচনা একজনের (এই সেশন), স্বাধীন নয়; (৪) user-verified approval তৈরি হয়নি। "SECURITY REVIEWED" দাবিও করা হচ্ছে না একই কারণে (৩)।

**মালিকের করণীয় (একসাথে):**
1. সিদ্ধান্ত: এই ব্রাঞ্চ main-এ merge করবেন কিনা (merge = স্বয়ংক্রিয় deploy)।
2. Deploy-এর পর: Claude ও ChatGPT-তে RIGOR-X connector refresh (২২টি tool, নতুন parameter, icon)।
3. আগের অসমাপ্ত: Worker secret `RIGORX_SPIKE_TOKEN` ও `ALLOWED_EMAILS` মুছুন (কোড এগুলো পড়ে না) — এই সেশন থেকে যাচাই করা যায়নি এগুলো এখনো আছে কিনা।
4. ঐচ্ছিক: emblem-এর বড় বা vector master দিলে "0°" সহ icon বানানো যাবে।
5. পরে: Workers Paid ও চূড়ান্ত quota সংখ্যা।

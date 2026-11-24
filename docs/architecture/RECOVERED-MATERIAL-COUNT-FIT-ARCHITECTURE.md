# RIGOR-X — Recovered Material Analysis & Count-Fit Architecture

**Version:** 0.1.0 | **Date:** 2026-11-25 | **Status:** PROPOSED — owner ratification pending

## 1. Design rule
The owner's target cardinalities are fixed: 30 formulas, 33 algorithms, 111 topics, 15 operators, 18 functional groups, 36 knowledge domains, 999 slash-command corpus entries and a separate 102-command interface/operational layer. Historical recovery and analytical reconstruction are distinct. Each record carries its source/status; no proposal is mislabelled as recovered history.

## 2. The 36 Knowledge Domains — historical list recovered
1. **KD-01** — Psychology / Human Nature
2. **KD-02** — Behavioral Psychology
3. **KD-03** — Power / Authority
4. **KD-04** — Positioning / Strategic Advantage
5. **KD-05** — Influence / Persuasion
6. **KD-06** — Political Strategy / Statecraft
7. **KD-07** — Military / Warfare
8. **KD-08** — Geopolitics / International Relations
9. **KD-09** — Economics / Political Economy
10. **KD-10** — Finance / Wealth
11. **KD-11** — Negotiation
12. **KD-12** — Intelligence / Information
13. **KD-13** — Deception
14. **KD-14** — Leadership / Command
15. **KD-15** — Organizational Strategy
16. **KD-16** — Governance / Administration
17. **KD-17** — Sociology / Social Structure
18. **KD-18** — Mass Psychology / Ideology
19. **KD-19** — Communication / Rhetoric
20. **KD-20** — Competition / Game Theory
21. **KD-21** — Strategy / Planning
22. **KD-22** — Decision Science / Judgment
23. **KD-23** — Risk / Survival
24. **KD-24** — Conflict Management
25. **KD-25** — Ethics
26. **KD-26** — Law / Rules
27. **KD-27** — History / Civilizational Dynamics
28. **KD-28** — Education / Knowledge Acquisition
29. **KD-29** — Personal Strategy / Self-Mastery
30. **KD-30** — Operations / Execution
31. **KD-31** — Resources / Dependency
32. **KD-32** — Innovation / Adaptation
33. **KD-33** — Psychological Resilience
34. **KD-34** — Human Relationships / Social Dynamics
35. **KD-35** — Strategic Models / Frameworks
36. **KD-36** — Culture / Identity / Symbolic Systems

## 3. The 15 Analytical Operators
Fourteen names are historical assistant-record candidates; OP-015 is proposed to complete the requested count.
- **OP-001 — Deductive Reasoning:** Derive necessary conclusions from explicit premises.
- **OP-002 — Inductive Reasoning:** Generalize cautiously from observed cases and patterns.
- **OP-003 — Abductive Reasoning:** Generate and compare the best explanations for observations.
- **OP-004 — Causal Reasoning:** Model causal mechanisms, confounders and interventions.
- **OP-005 — Counterfactual Reasoning:** Evaluate alternative outcomes under changed conditions.
- **OP-006 — Bayesian Reasoning:** Update beliefs from evidence and prior probabilities.
- **OP-007 — Analogical Reasoning:** Transfer structural insight across comparable domains.
- **OP-008 — Systems Thinking:** Analyse interdependence, feedback and emergent behaviour.
- **OP-009 — Game-Theoretic Reasoning:** Analyse strategic interaction and incentive-compatible choices.
- **OP-010 — Adversarial Reasoning:** Test claims and systems against capable opposition.
- **OP-011 — Temporal Reasoning:** Analyse sequence, duration, timing and path dependence.
- **OP-012 — Probabilistic Forecasting:** Estimate uncertain future states and calibrate forecasts.
- **OP-013 — Decision-Theoretic Reasoning:** Choose actions under objectives, uncertainty and trade-offs.
- **OP-014 — Optimization:** Search for best feasible outcomes under constraints.
- **OP-015 — Constraint-Based Reasoning:** Find feasible solutions while enforcing hard constraints. *(proposed; not historical recovery)*

## 4. The 30 Formula architecture — proposed
- **FM-001 Weighted score:** `S=Σ(wᵢxᵢ)` — Aggregate normalized indicators with explicit weights.
- **FM-002 Bayes' theorem:** `P(H|E)=P(E|H)P(H)/P(E)` — Update hypothesis probability from evidence.
- **FM-003 Odds update:** `O(H|E)=O(H)×LR(E)` — Update odds using likelihood ratios.
- **FM-004 Shannon entropy:** `H(X)=−Σp(x)log₂p(x)` — Quantify uncertainty in a distribution.
- **FM-005 Information gain:** `IG=H(prior)−E[H(posterior)]` — Measure uncertainty reduction from evidence.
- **FM-006 Kullback–Leibler divergence:** `Dₖₗ(P||Q)=ΣP(x)log(P(x)/Q(x))` — Measure distribution shift.
- **FM-007 Jaccard similarity:** `J(A,B)=|A∩B|/|A∪B|` — Compare overlap between sets.
- **FM-008 Cosine similarity:** `cos(θ)=a·b/(||a||||b||)` — Compare vector direction.
- **FM-009 Pearson correlation:** `r=cov(X,Y)/(σXσY)` — Measure linear association, not causation.
- **FM-010 Covariance:** `Cov(X,Y)=E[(X−μX)(Y−μY)]` — Measure joint variation.
- **FM-011 Linear regression:** `ŷ=β₀+Σβᵢxᵢ` — Estimate conditional linear relationships.
- **FM-012 Bayesian posterior predictive:** `p(y*|D)=∫p(y*|θ)p(θ|D)dθ` — Predict while propagating parameter uncertainty.
- **FM-013 Confidence interval:** `estimate ± critical_value×SE` — Represent sampling uncertainty under stated assumptions.
- **FM-014 Standard score:** `z=(x−μ)/σ` — Normalize observations against a reference distribution.
- **FM-015 Min–max normalization:** `x'=(x−min)/(max−min)` — Scale values to a common range.
- **FM-016 Robust normalization:** `x'=(x−median)/IQR` — Scale while reducing outlier sensitivity.
- **FM-017 Uncertainty propagation:** `Var(f)≈∇fᵀΣ∇f` — Propagate input uncertainty through a function.
- **FM-018 Expected value:** `E[X]=Σpᵢxᵢ` — Calculate probability-weighted outcomes.
- **FM-019 Expected utility:** `EU(a)=Σp(s|a)U(s)` — Evaluate actions by utility under uncertainty.
- **FM-020 Risk-adjusted return:** `RAR=(R−R_f)/risk_measure` — Compare return against an explicit risk measure.
- **FM-021 Value of information:** `VOI=E[max_a EU(a|E)]−max_a EU(a)` — Estimate the decision value of additional evidence.
- **FM-022 Cost-benefit net value:** `NB=ΣBenefits−ΣCosts` — Compare monetized benefits and costs.
- **FM-023 Return on investment:** `ROI=(Gain−Cost)/Cost` — Measure return relative to investment.
- **FM-024 Pareto dominance:** `x≻y iff xᵢ≥yᵢ ∀i and xⱼ>yⱼ` — Identify options dominated across objectives.
- **FM-025 Reliability series system:** `Rₛ=ΠRᵢ` — Estimate joint reliability of serial components.
- **FM-026 Reliability parallel system:** `Rₚ=1−Π(1−Rᵢ)` — Estimate redundancy-based reliability.
- **FM-027 Bayesian evidence reliability:** `wᵢ=log LRᵢ with dependence correction` — Weight evidence while accounting for dependence.
- **FM-028 Source independence penalty:** `I_eff=n/(1+ρ(n−1))` — Discount repeated or correlated sources.
- **FM-029 Time decay:** `w(t)=e^(−λΔt)` — Reduce relevance of stale time-sensitive evidence.
- **FM-030 Calibration error:** `ECE=Σ_b(|B_b|/N)|acc(B_b)−conf(B_b)|` — Measure confidence calibration.

## 5. The 33 Algorithm architecture — proposed
- **AL-001 Task and intent classification:** Classify request, deliverable, domain, stakes and constraints.
- **AL-002 Adaptive intensity selection:** Select L01–L06 from complexity, uncertainty and consequence.
- **AL-003 Context reconstruction:** Rebuild relevant context with provenance and conflict checks.
- **AL-004 Task decomposition:** Split goals into dependency-aware executable subtasks.
- **AL-005 Knowledge activation:** Select relevant domains, topics, formulas and operators.
- **AL-006 Dynamic mode selection:** Choose the minimum sufficient reasoning and research modes.
- **AL-007 Source discovery:** Discover candidate sources across enabled acquisition channels.
- **AL-008 Source acquisition and provenance:** Retrieve, identify and preserve source lineage and retrieval state.
- **AL-009 Entity resolution:** Resolve aliases and distinguish entities with similar identifiers.
- **AL-010 Claim extraction:** Convert source material into atomic, attributable claims.
- **AL-011 Evidence grading:** Classify claim support, limitations and uncertainty.
- **AL-012 Source-dependence analysis:** Detect copied, circular or correlated reporting.
- **AL-013 Contradiction detection:** Find incompatible claims, definitions, dates and denominators.
- **AL-014 Bayesian evidence updating:** Update confidence as evidence is added or challenged.
- **AL-015 Hypothesis generation:** Generate competing explanations for observed facts.
- **AL-016 Causal graph construction:** Represent causal variables, mechanisms and confounders.
- **AL-017 Counterfactual evaluation:** Compare observed outcomes with plausible alternatives.
- **AL-018 Temporal sequence reconstruction:** Build event timelines and detect temporal inconsistencies.
- **AL-019 Actor and power-network mapping:** Map actors, authority, dependencies and control relations.
- **AL-020 Incentive and game analysis:** Model strategic choices, payoffs and equilibrium pressures.
- **AL-021 Adversarial review:** Attempt to falsify claims, plans and system assumptions.
- **AL-022 Risk and failure analysis:** Identify failure modes, likelihood, impact and detectability.
- **AL-023 Multi-objective optimization:** Find feasible trade-offs across competing objectives.
- **AL-024 Decision analysis:** Rank options against objectives, constraints and uncertainty.
- **AL-025 Forecast and scenario analysis:** Generate conditional scenarios with calibrated uncertainty.
- **AL-026 Memory retrieval and relevance:** Retrieve useful memory while separating relevance from reliability.
- **AL-027 Memory conflict resolution:** Reconcile conflicting memories with source and version priority.
- **AL-028 Command routing:** Route commands to groups, handlers and supported host capabilities.
- **AL-029 Tool and model capability routing:** Select only actually available and authorized tools/models.
- **AL-030 Execution orchestration:** Execute dependency-ordered tasks with checkpoints and receipts.
- **AL-031 Loop and stagnation detection:** Detect repeated actions, no-progress states and stop conditions.
- **AL-032 Independent verification:** Validate outputs, calculations, citations, tests and side effects.
- **AL-033 Feedback and adaptive refinement:** Use measured feedback to update routing and improve future execution.

## 6. The 111 Analytical Topics — proposed count-fit
36 domains × 3 topics = 108; plus 3 cross-domain topics = 111.
- **TP-001** (Psychology / Human Nature) — Cognitive architecture
- **TP-002** (Psychology / Human Nature) — Human needs and drives
- **TP-003** (Psychology / Human Nature) — Personality and individual differences
- **TP-004** (Behavioral Psychology) — Behavioural biases
- **TP-005** (Behavioral Psychology) — Heuristics and bounded rationality
- **TP-006** (Behavioral Psychology) — Habit formation and behavioural change
- **TP-007** (Power / Authority) — Authority structures
- **TP-008** (Power / Authority) — Power resources and asymmetry
- **TP-009** (Power / Authority) — Legitimacy and compliance
- **TP-010** (Positioning / Strategic Advantage) — Strategic positioning
- **TP-011** (Positioning / Strategic Advantage) — Competitive advantage
- **TP-012** (Positioning / Strategic Advantage) — Bargaining position and leverage
- **TP-013** (Influence / Persuasion) — Persuasion mechanisms
- **TP-014** (Influence / Persuasion) — Influence networks
- **TP-015** (Influence / Persuasion) — Trust and credibility
- **TP-016** (Political Strategy / Statecraft) — State capacity
- **TP-017** (Political Strategy / Statecraft) — Political institutions
- **TP-018** (Political Strategy / Statecraft) — Policy formation and statecraft
- **TP-019** (Military / Warfare) — Deterrence and coercion
- **TP-020** (Military / Warfare) — Conflict strategy
- **TP-021** (Military / Warfare) — Operational command and control
- **TP-022** (Geopolitics / International Relations) — Geopolitical alignment
- **TP-023** (Geopolitics / International Relations) — Regional security complexes
- **TP-024** (Geopolitics / International Relations) — International institutions and order
- **TP-025** (Economics / Political Economy) — Market structure
- **TP-026** (Economics / Political Economy) — Political economy
- **TP-027** (Economics / Political Economy) — Incentives and externalities
- **TP-028** (Finance / Wealth) — Capital allocation
- **TP-029** (Finance / Wealth) — Liquidity and solvency
- **TP-030** (Finance / Wealth) — Wealth formation and distribution
- **TP-031** (Negotiation) — Negotiation architecture
- **TP-032** (Negotiation) — Bargaining models
- **TP-033** (Negotiation) — Commitment and credible signalling
- **TP-034** (Intelligence / Information) — Intelligence cycles
- **TP-035** (Intelligence / Information) — Information asymmetry
- **TP-036** (Intelligence / Information) — Collection and analytic tradecraft
- **TP-037** (Deception) — Deception indicators
- **TP-038** (Deception) — Disinformation dynamics
- **TP-039** (Deception) — Verification and attribution
- **TP-040** (Leadership / Command) — Leadership models
- **TP-041** (Leadership / Command) — Command responsibility
- **TP-042** (Leadership / Command) — Delegation and accountability
- **TP-043** (Organizational Strategy) — Organizational design
- **TP-044** (Organizational Strategy) — Organizational culture
- **TP-045** (Organizational Strategy) — Principal-agent problems
- **TP-046** (Governance / Administration) — Institutional governance
- **TP-047** (Governance / Administration) — Administrative capacity
- **TP-048** (Governance / Administration) — Regulatory design and enforcement
- **TP-049** (Sociology / Social Structure) — Social stratification
- **TP-050** (Sociology / Social Structure) — Collective action
- **TP-051** (Sociology / Social Structure) — Networks and social capital
- **TP-052** (Mass Psychology / Ideology) — Ideology formation
- **TP-053** (Mass Psychology / Ideology) — Group identity and polarization
- **TP-054** (Mass Psychology / Ideology) — Collective belief dynamics
- **TP-055** (Communication / Rhetoric) — Rhetorical framing
- **TP-056** (Communication / Rhetoric) — Narrative structures
- **TP-057** (Communication / Rhetoric) — Communication channels and effects
- **TP-058** (Competition / Game Theory) — Competitive dynamics
- **TP-059** (Competition / Game Theory) — Game theory and strategic interaction
- **TP-060** (Competition / Game Theory) — Market entry and rivalry
- **TP-061** (Strategy / Planning) — Strategic planning
- **TP-062** (Strategy / Planning) — Objective decomposition
- **TP-063** (Strategy / Planning) — Path dependency and sequencing
- **TP-064** (Decision Science / Judgment) — Judgment under uncertainty
- **TP-065** (Decision Science / Judgment) — Decision biases
- **TP-066** (Decision Science / Judgment) — Multi-criteria decision analysis
- **TP-067** (Risk / Survival) — Risk identification
- **TP-068** (Risk / Survival) — Resilience and survival
- **TP-069** (Risk / Survival) — Tail risk and systemic exposure
- **TP-070** (Conflict Management) — Conflict escalation
- **TP-071** (Conflict Management) — Mediation and settlement
- **TP-072** (Conflict Management) — Coalition and stakeholder management
- **TP-073** (Ethics) — Normative frameworks
- **TP-074** (Ethics) — Ethical trade-offs
- **TP-075** (Ethics) — Legitimacy and accountability
- **TP-076** (Law / Rules) — Legal institutions
- **TP-077** (Law / Rules) — Rule systems and compliance
- **TP-078** (Law / Rules) — Rights, duties and enforcement
- **TP-079** (History / Civilizational Dynamics) — Historical causation
- **TP-080** (History / Civilizational Dynamics) — Institutional path dependence
- **TP-081** (History / Civilizational Dynamics) — Civilizational change
- **TP-082** (Education / Knowledge Acquisition) — Learning science
- **TP-083** (Education / Knowledge Acquisition) — Knowledge transfer
- **TP-084** (Education / Knowledge Acquisition) — Skill acquisition and retention
- **TP-085** (Personal Strategy / Self-Mastery) — Self-regulation
- **TP-086** (Personal Strategy / Self-Mastery) — Personal capability development
- **TP-087** (Personal Strategy / Self-Mastery) — Goal formation and discipline
- **TP-088** (Operations / Execution) — Process design
- **TP-089** (Operations / Execution) — Execution control
- **TP-090** (Operations / Execution) — Performance measurement and improvement
- **TP-091** (Resources / Dependency) — Resource allocation
- **TP-092** (Resources / Dependency) — Dependency mapping
- **TP-093** (Resources / Dependency) — Scarcity and bottleneck analysis
- **TP-094** (Innovation / Adaptation) — Innovation systems
- **TP-095** (Innovation / Adaptation) — Adaptation and diffusion
- **TP-096** (Innovation / Adaptation) — Technological transition
- **TP-097** (Psychological Resilience) — Stress response
- **TP-098** (Psychological Resilience) — Psychological recovery
- **TP-099** (Psychological Resilience) — Coping and adaptive capacity
- **TP-100** (Human Relationships / Social Dynamics) — Interpersonal trust
- **TP-101** (Human Relationships / Social Dynamics) — Relationship dynamics
- **TP-102** (Human Relationships / Social Dynamics) — Cooperation and reciprocity
- **TP-103** (Strategic Models / Frameworks) — Model design and selection
- **TP-104** (Strategic Models / Frameworks) — Framework validation
- **TP-105** (Strategic Models / Frameworks) — Systems integration
- **TP-106** (Culture / Identity / Symbolic Systems) — Cultural transmission
- **TP-107** (Culture / Identity / Symbolic Systems) — Symbols and meaning systems
- **TP-108** (Culture / Identity / Symbolic Systems) — Identity formation and change
- **TP-109** (Cross-domain) — Cross-domain systems and feedback loops
- **TP-110** (Cross-domain) — Evidence integrity and uncertainty calibration
- **TP-111** (Cross-domain) — Human-machine collaboration and adaptive orchestration

## 7. The 18 Functional Groups — mapped from recovered 999 corpus categories
The existing corpus has 18 categories whose counts sum exactly to 999. The category names and counts are the strongest available basis for the 18-FG framing. These are proposed functional mappings pending owner ratification.
| ID | Functional Group | Corpus count |
|---|---|---:|
| FG-01 | Aliases & shorthand variants | 6 |
| FG-02 | Communication, email & social messaging | 26 |
| FG-03 | Comparison, evaluation & decision support | 21 |
| FG-04 | Documents, projects & automation | 46 |
| FG-05 | Education, learning & tutoring | 27 |
| FG-06 | Finance, business & investment | 7 |
| FG-07 | General-purpose AI workflows | 30 |
| FG-08 | Hardware, maker & digital fabrication | 32 |
| FG-09 | Information extraction & knowledge organization | 46 |
| FG-10 | Output format & response control | 31 |
| FG-11 | Platform-native commands & interface controls | 33 |
| FG-12 | Reasoning, diagnosis & critical analysis | 41 |
| FG-13 | Research, discovery & source verification | 30 |
| FG-14 | Science, mathematics & data analysis | 51 |
| FG-15 | Software, coding & technical engineering | 159 |
| FG-16 | Translation, language & localization | 20 |
| FG-17 | Visual design, image generation & photography | 346 |
| FG-18 | Writing, editing & content refinement | 47 |
| **TOTAL** | **18** | **999** |

## 8. The 999 Slash Command universe
Repository data confirms 999 unique normalized tokens, but they are a research/candidate corpus, not 999 implemented handlers.
| Classification | Count |
|---|---:|
| MACRO ALIAS | 6 |
| MACRO | 647 |
| NATIVE | 31 |
| NATIVE — OPENAI | 14 |
| NATIVE — CHATGPT | 8 |
| NATIVE — CODEX | 34 |
| UI/MENU | 3 |
| IMAGE KEYWORD | 256 |
| **TOTAL** | **999** |

Every token remains in scope. Semantic review, host compatibility, FG routing, alias normalization and handler status must be completed separately.

## 9. The separate 102 Interface/Operational layer
| Segment | Count | State |
|---|---:|---|
| Historical plugin reference definitions | 91 | Reported; runtime verification pending |
| Missing historical definitions | 11 | NOT_RECOVERED |
| **Target** | **102** | **PARTIAL** |
The 102 layer is the core control surface; the 999 layer is the broad command universe. Keep separate IDs and link them through reviewed mappings. Do not invent the 11 missing historical definitions.

## 10. Cross-registry architecture
`KD → TP → OP → FM → AL → FG → CMD` is a traceability graph, not a one-to-one pipeline. Domains contain topics; topics activate operators; operators use formulas; algorithms compose methods; functional groups own execution responsibilities; commands route user intent. The 102 control surface can orchestrate reviewed members of the 999 corpus.

Each record must eventually carry: definition, source status, canonical status, owner group, dependencies, inputs, outputs, failure modes, tests and verification receipt.

## 11. Integrity checks performed
- Domains: 36
- Operators: 15 (14 historical candidates + 1 proposal)
- Formulas: 30
- Algorithms: 33
- Topics: 111 (108 domain + 3 cross-domain)
- Functional Groups: 18
- Command corpus: 999 (18 category counts sum to 999)
- Interface/Operational layer: 102 target (91 reported + 11 unresolved)

Formula, Algorithm, Topic and Functional Group content is proposed, not historical. The 36 Domain list and 14 Operator names are historical assistant-record candidates pending owner ratification. The 999 corpus is source-recovered; runtime implementation is not verified.

## 12. Execution sequence
1. Ratify/revise FG mappings and OP-015.
2. Validate all 999 records, categories, provenance and alias semantics.
3. Build KD/TP/OP/FM/AL/FG/command crosswalks.
4. Recover 11 missing interface commands.
5. Define FG execution contracts and handler ownership.
6. Implement validators and routing tests, then runtime handlers.

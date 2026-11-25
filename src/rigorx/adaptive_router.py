"""Deterministic, transparent adaptive request routing heuristics.

This is an inspectable pre-routing heuristic, not an AI classifier. Host/model
reasoning can refine the route; the heuristic only provides a starting profile
and records its signals.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum


class TaskIntent(StrEnum):
    INFORMATION = "INFORMATION"
    RESEARCH = "RESEARCH"
    ANALYSIS = "ANALYSIS"
    DECISION = "DECISION"
    EXECUTION = "EXECUTION"
    CREATIVE = "CREATIVE"
    TECHNICAL = "TECHNICAL"
    COMMUNICATION = "COMMUNICATION"
    UNKNOWN = "UNKNOWN"


class AdaptiveLevel(StrEnum):
    L01_BASIC = "L01_BASIC"
    L02_STANDARD = "L02_STANDARD"
    L03_DEEP = "L03_DEEP"
    L04_COMPLEX = "L04_COMPLEX"
    L05_CRITICAL = "L05_CRITICAL"
    L06_HYPER_RIGOROUS = "L06_HYPER_RIGOROUS"


@dataclass(frozen=True, slots=True)
class AdaptiveProfile:
    intent: TaskIntent
    modes: tuple[str, ...]
    level: AdaptiveLevel
    methods: tuple[str, ...]
    signals: tuple[str, ...]
    risk_score: int
    explicit_override: bool = False

    def to_dict(self) -> dict[str, object]:
        return {
            "intent": self.intent.value,
            "modes": list(self.modes),
            "level": self.level.value,
            "methods": list(self.methods),
            "signals": list(self.signals),
            "risk_score": self.risk_score,
            "explicit_override": self.explicit_override,
        }


class AdaptiveRouter:
    """Select a method profile using deterministic, inspectable text signals."""

    _patterns: tuple[tuple[TaskIntent, tuple[str, ...]], ...] = (
        (TaskIntent.RESEARCH, (r"research", r"investigat", r"latest", r"source", r"citation", r"verify", r"fact.?check", r"look up")),
        (TaskIntent.ANALYSIS, (r"analy[sz]", r"diagnos", r"root cause", r"audit", r"why", r"evaluate", r"assess")),
        (TaskIntent.DECISION, (r"recommend", r"should i", r"which .*best", r"choose", r"decision", r"trade.?off", r"pros.?cons")),
        (TaskIntent.EXECUTION, (r"execute", r"perform", r"do this", r"send", r"book", r"create", r"update", r"delete", r"schedule", r"submit", r"run this")),
        (TaskIntent.TECHNICAL, (r"code", r"debug", r"program", r"api", r"database", r"deploy", r"architecture", r"software", r"script")),
        (TaskIntent.CREATIVE, (r"write", r"draft", r"story", r"brainstorm", r"creative", r"design")),
        (TaskIntent.COMMUNICATION, (r"email", r"message", r"translate", r"rewrite", r"polish", r"respond to")),
    )
    _mode_patterns: tuple[tuple[str, tuple[str, ...]], ...] = (
        ("EXPLORATORY", (r"explor", r"discover", r"brainstorm", r"research", r"investigat")),
        ("DESCRIPTIVE", (r"describe", r"summarize", r"overview", r"explain", r"what is")),
        ("DIAGNOSTIC", (r"diagnos", r"troubleshoot", r"root cause", r"problem analysis")),
        ("CAUSAL", (r"caus", r"impact", r"effect", r"why did", r"why does")),
        ("HISTORICAL", (r"histor", r"timeline", r"over time", r"origin", r"evolution")),
        ("COMPARATIVE", (r"compar", r"versus", r"vs\b", r"trade.?off", r"pros.?cons")),
        ("QUANTITATIVE", (r"quantit", r"statistic", r"calculate", r"numeric", r"data analysis", r"measure")),
        ("QUALITATIVE", (r"qualit", r"interview", r"narrative", r"theme analysis", r"perception")),
        ("FORENSIC", (r"forensic", r"full audit", r"evidence trail", r"trace", r"investigation")),
        ("SYSTEMS", (r"system", r"ecosystem", r"interdepend", r"feedback loop", r"network")),
        ("STRATEGIC", (r"strateg", r"competitive", r"positioning", r"geopolit", r"long.?term")),
        ("ACTION_RESEARCH", (r"implement", r"intervention", r"field test", r"action plan", r"deploy")),
    )
    _risk_patterns = (
        r"medical", r"health", r"diagnos", r"medication", r"legal", r"lawyer", r"financial",
        r"investment", r"bank", r"security", r"credential", r"password", r"privacy",
        r"safety", r"emergency", r"irreversible", r"delete permanently", r"production system",
    )
    _hyper_patterns = (r"hyper.?rigorous", r"l06", r"adversarial", r"red.?team", r"failure analysis", r"stress test", r"full audit", r"forensic")

    def route(self, prompt: str, *, override_level: AdaptiveLevel | None = None) -> AdaptiveProfile:
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("prompt must be non-empty text")
        text = prompt.casefold()
        signals: list[str] = []
        scores: dict[TaskIntent, int] = {intent: 0 for intent in TaskIntent}
        for intent, patterns in self._patterns:
            for pattern in patterns:
                if re.search(pattern, text):
                    scores[intent] += 1
                    signals.append(f"{intent.value}:{pattern}")
        if re.search(r"\b(question|what is|who is|when|where|explain|define)\b", text):
            scores[TaskIntent.INFORMATION] += 1
        priority = {
            TaskIntent.EXECUTION: 8,
            TaskIntent.TECHNICAL: 7,
            TaskIntent.DECISION: 6,
            TaskIntent.ANALYSIS: 5,
            TaskIntent.RESEARCH: 4,
            TaskIntent.CREATIVE: 3,
            TaskIntent.COMMUNICATION: 2,
            TaskIntent.INFORMATION: 1,
            TaskIntent.UNKNOWN: 0,
        }
        intent = max(scores, key=lambda candidate: (scores[candidate], priority[candidate]))
        if scores[intent] == 0:
            intent = TaskIntent.INFORMATION

        modes = [mode for mode, patterns in self._mode_patterns if any(re.search(pattern, text) for pattern in patterns)]
        if not modes:
            modes = {
                TaskIntent.INFORMATION: ["DESCRIPTIVE"],
                TaskIntent.RESEARCH: ["EXPLORATORY"],
                TaskIntent.ANALYSIS: ["DIAGNOSTIC"],
                TaskIntent.DECISION: ["STRATEGIC"],
                TaskIntent.EXECUTION: ["ACTION_RESEARCH"],
                TaskIntent.TECHNICAL: ["SYSTEMS"],
                TaskIntent.CREATIVE: ["EXPLORATORY"],
                TaskIntent.COMMUNICATION: ["QUALITATIVE"],
                TaskIntent.UNKNOWN: ["EXPLORATORY"],
            }[intent]
        signals.extend(f"MODE:{mode}" for mode in modes)

        risk_hits = [pattern for pattern in self._risk_patterns if re.search(pattern, text)]
        risk_score = min(5, len(risk_hits))
        if risk_hits:
            signals.extend(f"RISK:{pattern}" for pattern in risk_hits)

        complex_hits = 0
        if len(text.split()) > 120:
            complex_hits += 1
            signals.append("COMPLEX:long-input")
        if re.search(r"\b(and then|multiple|several|step by step|phases|constraints|compare across)\b", text):
            complex_hits += 1
            signals.append("COMPLEX:multi-step-or-constraints")
        if re.search(r"\b(root cause|systemic|multi.?dimensional|comprehensive|end.?to.?end)\b", text):
            complex_hits += 1
            signals.append("COMPLEX:deep-analysis")
        level_tokens = (
            (AdaptiveLevel.L06_HYPER_RIGOROUS, (r"/l06\b", r"/ultrathink\b", r"/beastmode\b", r"/hyper.?rigorous\b")),
            (AdaptiveLevel.L05_CRITICAL, (r"/l05\b", r"/critical\b")),
            (AdaptiveLevel.L04_COMPLEX, (r"/l04\b", r"/complex\b")),
            (AdaptiveLevel.L03_DEEP, (r"/l03\b", r"/deepthink\b", r"/deep\b")),
            (AdaptiveLevel.L02_STANDARD, (r"/l02\b", r"/standard\b")),
            (AdaptiveLevel.L01_BASIC, (r"/l01\b", r"/basic\b")),
        )
        token_override = next(
            (level for level, patterns in level_tokens if any(re.search(pattern, text) for pattern in patterns)),
            None,
        )
        if token_override is not None:
            signals.append(f"SLASH_OVERRIDE:{token_override.value}")
        if any(re.search(p, text) for p in self._hyper_patterns):
            signals.append("OVERRIDE:hyper-rigorous-explicit")

        if token_override is not None:
            level = token_override
        elif any(re.search(p, text) for p in self._hyper_patterns):
            level = AdaptiveLevel.L06_HYPER_RIGOROUS
        elif risk_score >= 1:
            level = AdaptiveLevel.L05_CRITICAL
        elif intent in {TaskIntent.TECHNICAL, TaskIntent.EXECUTION} and complex_hits >= 1:
            level = AdaptiveLevel.L04_COMPLEX
        elif intent in {TaskIntent.RESEARCH, TaskIntent.ANALYSIS, TaskIntent.DECISION} or complex_hits >= 1:
            level = AdaptiveLevel.L03_DEEP
        elif len(text.split()) <= 24 and intent is TaskIntent.INFORMATION:
            level = AdaptiveLevel.L01_BASIC
        else:
            level = AdaptiveLevel.L02_STANDARD

        explicit = override_level is not None
        if explicit:
            if not isinstance(override_level, AdaptiveLevel):
                raise TypeError("override_level must be AdaptiveLevel")
            level = override_level
            signals.append(f"USER_OVERRIDE:{level.value}")

        methods = {
            TaskIntent.INFORMATION: ("direct-answer",),
            TaskIntent.RESEARCH: ("source-discovery", "evidence-validation", "synthesis"),
            TaskIntent.ANALYSIS: ("decomposition", "causal-or-diagnostic-analysis", "alternative-explanations"),
            TaskIntent.DECISION: ("options", "criteria", "risk-reward", "recommendation"),
            TaskIntent.EXECUTION: ("action-planning", "capability-check", "authorization", "receipt-validation"),
            TaskIntent.TECHNICAL: ("specification", "implementation", "test", "security-review"),
            TaskIntent.CREATIVE: ("divergent-generation", "constraint-check", "refinement"),
            TaskIntent.COMMUNICATION: ("audience-fit", "tone", "clarity", "revision"),
            TaskIntent.UNKNOWN: ("clarification",),
        }[intent]
        if level in {AdaptiveLevel.L05_CRITICAL, AdaptiveLevel.L06_HYPER_RIGOROUS}:
            methods = (*methods, "uncertainty-disclosure", "independent-verification", "failure-mode-review")
        if level is AdaptiveLevel.L06_HYPER_RIGOROUS:
            methods = (*methods, "adversarial-review", "provenance-audit", "stop-condition-check")
        return AdaptiveProfile(intent, tuple(dict.fromkeys(modes)), level, tuple(dict.fromkeys(methods)), tuple(signals), risk_score, explicit)

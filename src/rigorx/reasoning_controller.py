"""Experimental bounded reasoning controller and mechanism selector (control-plane only)."""
from __future__ import annotations

import math
import re
from collections import deque
from dataclasses import dataclass
from enum import StrEnum

from .reasoning_guard import GuardAction, GuardDecision, ReasoningGuard


class TaskKind(StrEnum):
    GENERAL="GENERAL"; RESEARCH="RESEARCH"; CAUSAL="CAUSAL"; DECISION="DECISION"
    QUANTITATIVE="QUANTITATIVE"; CREATIVE="CREATIVE"; TECHNICAL="TECHNICAL"; DIAGNOSTIC="DIAGNOSTIC"
class Mechanism(StrEnum):
    STRUCTURED_DECOMPOSITION="STRUCTURED_DECOMPOSITION"; EVIDENCE_SEARCH="EVIDENCE_SEARCH"
    CAUSAL_COUNTERFACTUAL="CAUSAL_COUNTERFACTUAL"; PROBABILISTIC="PROBABILISTIC"
    CONSTRAINT_OPTIMIZATION="CONSTRAINT_OPTIMIZATION"; TEMPORAL_SEQUENTIAL="TEMPORAL_SEQUENTIAL"
    TOOL_AUGMENTED="TOOL_AUGMENTED"; STRATEGIC_SYSTEMS="STRATEGIC_SYSTEMS"
    CREATIVE_DIVERGENCE="CREATIVE_DIVERGENCE"
class ControllerAction(StrEnum):
    CONTINUE="CONTINUE"; DIVERSIFY="DIVERSIFY"; REPLAN="REPLAN"
    STOP_LOOP_SIGNAL="STOP_LOOP_SIGNAL"; STOP_BUDGET="STOP_BUDGET"; STOP_STALLED="STOP_STALLED"

@dataclass(frozen=True,slots=True)
class TaskProfile:
    task_kind:TaskKind=TaskKind.GENERAL
    intensity:int=2
    uncertainty:float=0.0
    risk:float=0.0
    evidence_required:bool=False
    tool_capable:bool=False
    time_sensitive:bool=False
    available_mechanisms:frozenset[Mechanism]|None=None
    def __post_init__(self):
        if isinstance(self.intensity,bool) or not isinstance(self.intensity,int): raise TypeError("intensity must be an integer in 1..6")
        if not 1<=self.intensity<=6: raise ValueError("intensity must be 1..6 (L01-L06)")
        if not isinstance(self.task_kind,TaskKind): raise TypeError("task_kind must be TaskKind")
        for n,v in (("uncertainty",self.uncertainty),("risk",self.risk)):
            if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not 0<=v<=1:
                raise ValueError(f"{n} must be finite in [0,1]")
        for n,v in (("evidence_required",self.evidence_required),("tool_capable",self.tool_capable),("time_sensitive",self.time_sensitive)):
            if not isinstance(v,bool): raise TypeError(f"{n} must be bool")
        if self.available_mechanisms is not None:
            if not isinstance(self.available_mechanisms,frozenset): raise TypeError("available_mechanisms must be frozenset or None")
            if any(not isinstance(m,Mechanism) for m in self.available_mechanisms): raise TypeError("available_mechanisms must contain Mechanism values")

@dataclass(frozen=True,slots=True)
class MechanismPlan:
    primary:Mechanism|None
    supporting:tuple[Mechanism,...]
    rationale:tuple[str,...]
    intensity:int
    capability_gaps:tuple[str,...]=()
@dataclass(frozen=True,slots=True)
class SemanticLoopSignal:
    similarity:float
    compared_state:int
    triggered:bool
    method:str="token-set-jaccard"
    advisory_only:bool=True
@dataclass(frozen=True,slots=True)
class ControllerReceipt:
    action:ControllerAction
    step:int
    guard:GuardDecision
    semantic_signal:SemanticLoopSignal|None
    reason:str
    recovery_attempts:int

def _tokens(text:str)->set[str]:
    if not isinstance(text,str): raise TypeError("state must be str")
    return set(re.findall(r"[\w]+",text.casefold(),flags=re.UNICODE))
def token_jaccard(left:str,right:str)->float:
    a,b=_tokens(left),_tokens(right)
    return len(a&b)/len(a|b) if a and b else 0.0

class SemanticLoopMonitor:
    """Advisory lexical overlap signal; it is not semantic-equivalence detection."""
    def __init__(self,*,window:int=6,threshold:float=0.88,min_tokens:int=6):
        if window<2: raise ValueError("window >= 2 required")
        if not math.isfinite(threshold) or not 0<threshold<=1: raise ValueError("threshold must be in (0,1]")
        if min_tokens<1: raise ValueError("min_tokens >= 1 required")
        self.window=window; self.threshold=threshold; self.min_tokens=min_tokens
        self._states:deque[tuple[int,str]]=deque(maxlen=window)
        self._step=0
    def reset_episode(self)->None:
        self._states.clear()
        self._step=0
    def observe(self,state:str)->SemanticLoopSignal|None:
        if not isinstance(state,str) or not state.strip(): raise ValueError("state must be non-empty")
        score,index=0.0,-1
        if len(_tokens(state))>=self.min_tokens:
            for i,prev in enumerate(self._states):
                similarity=token_jaccard(state,prev)
                if similarity>score: score,index=similarity,i
        signal=SemanticLoopSignal(score,index,True) if index>=0 and score>=self.threshold else None
        self._states.append(state)
        return signal

class MechanismSelector:
    """Candidate planner. Selected mechanisms are not executed."""
    def select(self,profile:TaskProfile)->MechanismPlan:
        selected=[]; rationale=[]; gaps=[]; allowed=profile.available_mechanisms
        def add(m,why):
            if allowed is not None and m not in allowed: gaps.append(f"{m.value} unavailable: {why}")
            elif m not in selected: selected.append(m); rationale.append(why)
        add(Mechanism.STRUCTURED_DECOMPOSITION,"default task decomposition")
        if profile.task_kind is TaskKind.RESEARCH or profile.evidence_required:
            add(Mechanism.EVIDENCE_SEARCH,"research/evidence requirement")
        if profile.task_kind in {TaskKind.CAUSAL,TaskKind.DIAGNOSTIC}:
            add(Mechanism.CAUSAL_COUNTERFACTUAL,"causal/root mechanism analysis")
            add(Mechanism.STRATEGIC_SYSTEMS,"system interdependencies and feedback")
        if profile.task_kind is TaskKind.DECISION or profile.risk>=0.6:
            add(Mechanism.CONSTRAINT_OPTIMIZATION,"decision trade-offs or high risk")
            add(Mechanism.PROBABILISTIC,"uncertainty-aware evaluation")
        if profile.task_kind is TaskKind.QUANTITATIVE:
            add(Mechanism.CONSTRAINT_OPTIMIZATION,"quantitative constraints")
            add(Mechanism.PROBABILISTIC,"statistical interpretation")
        if profile.time_sensitive: add(Mechanism.TEMPORAL_SEQUENTIAL,"time-sensitive analysis")
        if profile.tool_capable: add(Mechanism.TOOL_AUGMENTED,"tools declared available by caller")
        if profile.task_kind is TaskKind.CREATIVE: add(Mechanism.CREATIVE_DIVERGENCE,"divergent ideation")
        if profile.uncertainty>=0.6 or profile.intensity>=5:
            add(Mechanism.PROBABILISTIC,"high uncertainty/intensity")
        if not selected:
            selected=[Mechanism.STRUCTURED_DECOMPOSITION]
            rationale=["fallback candidate only; capability unconfirmed"]
            gaps.append("no mechanism confirmed available")
        return MechanismPlan(selected[0],tuple(selected[1:]),tuple(rationale),profile.intensity,tuple(gaps))

class ReasoningController:
    """Exact-repeat/progress/budget guard plus advisory lexical signal and recovery budget."""
    def __init__(self,*,max_steps:int=32,repeat_limit:int=2,stall_window:int=5,
                 semantic_window:int=6,semantic_threshold:float=0.88,recovery_budget:int=2,
                 semantic_signal_action:ControllerAction=ControllerAction.DIVERSIFY):
        if isinstance(recovery_budget,bool) or not isinstance(recovery_budget,int) or recovery_budget<0: raise ValueError("recovery_budget must be an integer >= 0")
        if semantic_signal_action not in {ControllerAction.DIVERSIFY,ControllerAction.REPLAN}:
            raise ValueError("semantic action may only DIVERSIFY or REPLAN")
        self.guard=ReasoningGuard(max_steps=max_steps,repeat_limit=repeat_limit,stall_window=stall_window)
        self.semantic=SemanticLoopMonitor(window=semantic_window,threshold=semantic_threshold)
        self.recovery_budget=recovery_budget; self.semantic_signal_action=semantic_signal_action
        self._recovery_attempts=0
    def observe(self,state:str,*,progress:float|None=None)->ControllerReceipt:
        guard=self.guard.observe(state,progress=progress); signal=self.semantic.observe(state)
        if guard.action is GuardAction.STOP_BUDGET: action,reason=ControllerAction.STOP_BUDGET,guard.reason
        elif guard.action is GuardAction.STOP_REPEATED_STATE: action,reason=ControllerAction.STOP_LOOP_SIGNAL,guard.reason
        elif guard.action is GuardAction.STOP_STALLED: action,reason=ControllerAction.STOP_STALLED,guard.reason
        elif guard.action is GuardAction.DIVERSIFY: action,reason=ControllerAction.DIVERSIFY,guard.reason
        elif signal:
            if self._recovery_attempts>=self.recovery_budget:
                action,reason=ControllerAction.STOP_LOOP_SIGNAL,"lexical signal repeated; recovery budget exhausted"
            else:
                self._recovery_attempts+=1
                action,reason=self.semantic_signal_action,"advisory lexical-overlap signal; diversify/replan"
        else: action,reason=ControllerAction.CONTINUE,guard.reason
        return ControllerReceipt(action,guard.step_count,guard,signal,reason,self._recovery_attempts)
    def reset_recovery_budget(self)->None:
        """Reset only for a separately scoped recovery episode."""
        self._recovery_attempts=0

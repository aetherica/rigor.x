"""Tiny fixture benchmark for lexical overlap; not generalization evidence."""
from rigorx.reasoning_controller import SemanticLoopMonitor
CASES=(
("loop","We need more evidence from the primary source before the claim is accepted.","We need more evidence from the primary source before the claim is accepted today."),
("loop","Repeat the same source check and confirm the date again.","Repeat the same source check and confirm the date again now."),
("loop","We need more evidence from the primary source before the claim is accepted.","We still need primary-source evidence before accepting this claim."),
("loop","Compare the source dates and definitions to resolve the mismatch.","Resolve the discrepancy by checking dates and definitions against sources."),
("non_loop","Collect the missing source and record its publication date.","Calculate the variance using the new dataset and report the unit."),
("non_loop","Check whether the supplier changed its price this quarter.","Interview workers about overtime and transport safety."),
("non_loop","Map the decision-makers and identify the approval chain.","Estimate the cash conversion cycle using receivables, inventory and payables."),
("non_loop","Find the latest official trade data and check revisions.","Explain the three competing causal hypotheses and identify falsifiers."),
)
def run_benchmark(threshold:float=.88)->dict[str,float|int]:
    tp=fp=tn=fn=0
    for label,left,right in CASES:
        monitor=SemanticLoopMonitor(threshold=threshold,window=5,min_tokens=6)
        monitor.observe(left); predicted=monitor.observe(right) is not None; actual=label=="loop"
        if actual and predicted: tp+=1
        elif not actual and predicted: fp+=1
        elif not actual: tn+=1
        else: fn+=1
    return {"threshold":threshold,"cases":len(CASES),"true_positive":tp,"false_positive":fp,
      "true_negative":tn,"false_negative":fn,"precision":tp/(tp+fp) if tp+fp else 0.0,
      "recall":tp/(tp+fn) if tp+fn else 0.0,"false_positive_rate":fp/(fp+tn) if fp+tn else 0.0}
if __name__=="__main__": print(run_benchmark())

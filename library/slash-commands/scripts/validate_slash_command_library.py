#!/usr/bin/env python3
"""Validate structural invariants of the RIGOR-X slash-command library."""
import csv, json, pathlib, re, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA,CSV,GROUPS,MANIFEST=ROOT/"commands.json",ROOT/"commands.csv",ROOT/"groups.json",ROOT/"manifest.json"
def fail(message): print("FAIL: "+message,file=sys.stderr); raise SystemExit(1)
def main():
    payload=json.loads(DATA.read_text(encoding="utf-8")); groups=json.loads(GROUPS.read_text(encoding="utf-8")); commands=payload.get("commands",[]); manifest=payload.get("manifest",{}); standalone=json.loads(MANIFEST.read_text(encoding="utf-8"))
    if len(commands)!=999: fail("expected 999 records; got "+str(len(commands)))
    ids=[x.get("id") for x in commands]; names=[x.get("name") for x in commands]
    if len(set(ids))!=999: fail("command IDs are not unique")
    if len(set(names))!=999: fail("command names are not unique")
    if len(groups)!=17: fail("expected 17 groups")
    known={g["id"]:g for g in groups}; allowed={"NATIVE","NATIVE — OPENAI","NATIVE — CHATGPT","NATIVE — CODEX","UI/MENU","MACRO","MACRO ALIAS","IMAGE KEYWORD","UNCLASSIFIED"}
    for x in commands:
        if not re.fullmatch(r"SLC-[0-9]{4}",x.get("id","")): fail("invalid ID "+str(x.get("id")))
        if not re.fullmatch(r"/[A-Za-z0-9][A-Za-z0-9_.;:-]*",x.get("name","")): fail("invalid name "+str(x.get("name")))
        if not x.get("description","").strip(): fail("empty description "+x["name"])
        if x.get("group_id") not in known: fail("unknown group "+x["name"])
        if x.get("classification") not in allowed: fail("unknown classification "+x["name"])
        src=x.get("source",{})
        for key in ("source_id","repository_or_platform","source_ref","url","source_type","verification_status"):
            if not src.get(key): fail("missing source."+key+" for "+x["name"])
    counts={}
    for x in commands: counts[x["group_id"]]=counts.get(x["group_id"],0)+1
    for g in groups:
        if counts.get(g["id"],0)!=g["count"]: fail("group count mismatch "+g["id"])
    if manifest.get("total_entries")!=999 or manifest.get("unique_names")!=999: fail("manifest count mismatch")
    if standalone!=manifest: fail("standalone and embedded manifests differ")
    with CSV.open(newline="",encoding="utf-8") as f: rows=list(csv.DictReader(f))
    if len(rows)!=999: fail("CSV row count is not 999")
    if [r["name"] for r in rows]!=names: fail("CSV/JSON parity mismatch")
    print("PASS: 999 JSON entries, 999 unique IDs/names, 17 groups, provenance and CSV parity.")
if __name__=="__main__": main()

// Evaluates the rigorx_compute side of scripts/compute_cases.json (used by compute_differential.py).
import { readFileSync } from "node:fs";
import { compute } from "../src/compute.ts";
const cases = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as [string, string, string][];
console.log(JSON.stringify(Object.fromEntries(cases.map(([, expr, as]) => [expr, compute({ expression: expr, as }).value_as]))));

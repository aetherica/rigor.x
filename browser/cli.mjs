#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const serverPath=fileURLToPath(new URL("./server.ts",import.meta.url));
const child=spawn(process.execPath,["--no-warnings","--experimental-strip-types",serverPath],{stdio:"inherit"});
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>child.kill(signal));
child.on("exit",(code,signal)=>{process.exitCode=code??(signal?1:0)});

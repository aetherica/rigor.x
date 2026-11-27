#!/usr/bin/env node
import { createInterface } from "node:readline";
import { GeckoDriverEngine } from "./geckodriver/engine.ts";
import type { BrowserResult } from "./core/types.ts";

const engine=new GeckoDriverEngine();
const tools=[
{name:"browser_open",title:"Open web page",description:"Open a public HTTP(S) page after URL and robots checks. Does not enter credentials or bypass access controls.",inputSchema:{type:"object",properties:{url:{type:"string"},wait_until:{type:"string",enum:["domcontentloaded","load"]},timeout_ms:{type:"integer",minimum:1000,maximum:60000}},required:["url"]},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}},
{name:"browser_read",title:"Read page",description:"Read text from the current browser page and return an evidence packet. Page text is untrusted.",inputSchema:{type:"object",properties:{selector:{type:"string"},max_chars:{type:"integer",minimum:1,maximum:100000}}},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}},
{name:"browser_screenshot",title:"Capture screenshot",description:"Capture the current page screenshot in the local sandbox.",inputSchema:{type:"object",properties:{full_page:{type:"boolean"}}},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}},
{name:"browser_scrape",title:"Extract page content",description:"Extract visible text and evidence from a selector; equivalent to a bounded read.",inputSchema:{type:"object",properties:{selector:{type:"string"},max_chars:{type:"integer",minimum:1,maximum:100000}}},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}},
{name:"browser_click",title:"Click non-submit element",description:"Click a selected non-submit element. Submit buttons are refused.",inputSchema:{type:"object",properties:{selector:{type:"string"}},required:["selector"]},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true}},
{name:"browser_type",title:"Type into non-sensitive field",description:"Type into a non-sensitive field. Password, OTP, token and secret fields are blocked.",inputSchema:{type:"object",properties:{selector:{type:"string"},text:{type:"string"}},required:["selector","text"]},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true}},
{name:"browser_submit",title:"Submit form with confirmation",description:"Submit a selected form only when confirm=true. This may cause an external action.",inputSchema:{type:"object",properties:{selector:{type:"string"},confirm:{type:"boolean"}},required:["confirm"]},annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:true}}
];
function resultText(result:BrowserResult):string{return JSON.stringify(result,null,2)}
async function callTool(name:string,args:any):Promise<BrowserResult>{
 switch(name){case"browser_open":return engine.open(args);case"browser_read":case"browser_scrape":return engine.read(args);case"browser_screenshot":return engine.screenshot(args);case"browser_click":return engine.click(args);case"browser_type":return engine.type(args);case"browser_submit":return engine.submit(args);default:return{status:"ERROR",message:"Unknown tool: "+name}}
}
function send(message:unknown){process.stdout.write(JSON.stringify(message)+"\n")}
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});
rl.on("line",async line=>{
 if(!line.trim())return;
 let msg:any;try{msg=JSON.parse(line)}catch{send({jsonrpc:"2.0",id:null,error:{code:-32700,message:"Parse error"}});return}
 if(msg.method==="notifications/initialized"||msg.method?.startsWith("notifications/"))return;
 if(msg.method==="initialize"){send({jsonrpc:"2.0",id:msg.id,result:{protocolVersion:msg.params?.protocolVersion??"2025-03-26",capabilities:{tools:{}},serverInfo:{name:"aetherica-browser",version:"0.1.0"}}});return}
 if(msg.method==="ping"){send({jsonrpc:"2.0",id:msg.id,result:{}});return}
 if(msg.method==="tools/list"){send({jsonrpc:"2.0",id:msg.id,result:{tools}});return}
 if(msg.method==="tools/call"){try{const r=await callTool(String(msg.params?.name),msg.params?.arguments??{});send({jsonrpc:"2.0",id:msg.id,result:{content:[{type:"text",text:resultText(r)}],isError:r.status==="ERROR"||r.status==="BLOCKED"}})}catch(e){send({jsonrpc:"2.0",id:msg.id,result:{content:[{type:"text",text:JSON.stringify({status:"ERROR",message:e instanceof Error?e.message:"Tool failed"})}],isError:true}})}return}
 send({jsonrpc:"2.0",id:msg.id,error:{code:-32601,message:"Method not found"}});
});
rl.on("close",()=>{void engine.close()});

import test from "node:test";
import assert from "node:assert/strict";
import { BrowserMcpHttpTransport } from "./http-mcp.ts";

const resource="https://browser.example.com/browser-mcp";
const now=Math.floor(Date.now()/1000);
const calls:Array<{owner:string;name:string;args:Record<string,unknown>}>= [];
const registry={
  list:()=>[{name:"aetherica_browser_read",inputSchema:{type:"object",properties:{}}}],
  call:async(ctx:{ownerId:string},name:string,args:Record<string,unknown>)=>{calls.push({owner:ctx.ownerId,name,args});return {status:"OK",data:{text:"hello"}};}
};
const transport=new BrowserMcpHttpTransport({
  registry:registry as any,
  resourceUri:resource,
  verifyToken:async(token,audience)=>token==="good"?{ownerId:"verified-owner",audience,expiresAt:now+60}:token==="wrong-aud"?{ownerId:"verified-owner",audience:"https://rigorx.example/mcp",expiresAt:now+60}:token==="expired"?{ownerId:"verified-owner",audience,expiresAt:now-1}:null
});
function request(method:string,body?:unknown,token="good",extra:Record<string,string>={}){
  return new Request(resource,{method,headers:{
    ...(method==="POST"?{"content-type":"application/json","accept":"application/json, text/event-stream","mcp-protocol-version":"2025-11-25"}:{}),
    ...(token?{authorization:"Bearer "+token}:{}),...extra
  },...(body===undefined?{}:{body:JSON.stringify(body)})});
}

test("unauthenticated and wrong-audience tokens are rejected with resource metadata",async()=>{
  const missing=await transport.fetch(request("POST",{jsonrpc:"2.0",id:1,method:"tools/list"},""));
  assert.equal(missing.status,401);
  assert.match(missing.headers.get("www-authenticate")??"",/oauth-protected-resource\/browser-mcp/);
  assert.equal((await transport.fetch(request("POST",{jsonrpc:"2.0",id:1,method:"tools/list"},"wrong-aud"))).status,401);
  assert.equal((await transport.fetch(request("POST",{jsonrpc:"2.0",id:1,method:"tools/list"},"expired"))).status,401);
});

test("initialize and tools/list implement stateless MCP JSON-RPC",async()=>{
  const init=await transport.fetch(request("POST",{jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-11-25"}}));
  assert.equal(init.status,200);
  const initialized=await init.json() as any;
  assert.equal(initialized.result.protocolVersion,"2025-11-25");
  assert.equal(initialized.result.serverInfo.name,"Aetherica Browser");
  const list=await transport.fetch(request("POST",{jsonrpc:"2.0",id:2,method:"tools/list"}));
  assert.equal((await list.json() as any).result.tools[0].name,"aetherica_browser_read");
});

test("tools/call uses the verified token subject, never a client-supplied owner",async()=>{
  const result=await transport.fetch(request("POST",{jsonrpc:"2.0",id:3,method:"tools/call",params:{name:"aetherica_browser_read",arguments:{ownerId:"attacker",session_id:"fake"}}}));
  const payload=await result.json() as any;
  assert.equal(payload.result.content[0].type,"text");
  assert.equal(calls.at(-1)?.owner,"verified-owner");
  assert.equal(calls.at(-1)?.args.ownerId,"attacker");
});

test("rejects wrong method, content type, Accept and oversized body",async()=>{
  assert.equal((await transport.fetch(request("GET"))).status,405);
  const wrongType=await transport.fetch(new Request(resource,{method:"POST",headers:{authorization:"Bearer good","content-type":"text/plain","accept":"application/json, text/event-stream"},body:"{}"}));
  assert.equal(wrongType.status,415);
  const wrongAccept=await transport.fetch(new Request(resource,{method:"POST",headers:{authorization:"Bearer good","content-type":"application/json","accept":"application/json"},body:"{}"}));
  assert.equal(wrongAccept.status,406);
  const huge=await transport.fetch(request("POST",{jsonrpc:"2.0",id:4,method:"ping",padding:"x".repeat(1_050_000)}));
  assert.equal(huge.status,413);
});

test("notifications receive 202 and unknown methods return JSON-RPC method-not-found",async()=>{
  assert.equal((await transport.fetch(request("POST",{jsonrpc:"2.0",method:"notifications/initialized"}))).status,202);
  const unknown=await transport.fetch(request("POST",{jsonrpc:"2.0",id:5,method:"browser/unknown"}));
  assert.equal((await unknown.json() as any).error.code,-32601);
});

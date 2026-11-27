import test from "node:test";
import assert from "node:assert/strict";
import { GeckoDriverEngine } from "./engine.ts";
const ELEMENT="element-6066-11e4-a52e-4f735466cecf";
test("open/read evidence using a fake W3C WebDriver and mocked robots response",async(t)=>{
 let current="https://example.com/",session="fake-session";
 const server=await import("node:http").then(({createServer})=>createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
  const path=req.url??"/";
  const send=(value,sessionId)=>{res.setHeader("content-type","application/json");res.end(JSON.stringify({value,...(sessionId?{sessionId}:{})}))};
  if(path==="/session"&&req.method==="POST"){send({capabilities:{}},session);return}
  if(path.endsWith("/url")&&req.method==="POST"){current=body.url;send(null);return}
  if(path.endsWith("/url")&&req.method==="GET"){send(current);return}
  if(path.endsWith("/title")){send("Example Test");return}
  if(path.endsWith("/execute/sync")){const s=body.script;if(s.includes("document.body ? document.body.innerText"))send("A safe test page");else if(s.includes("outerHTML"))send("<html><title>Example Test</title><body>A safe test page</body></html>");else if(s.includes("document.querySelector"))send({tag:"DIV",type:"",role:""});else send(null);return}
  if(path.endsWith("/element")&&req.method==="POST"){send({[ELEMENT]:"el1"});return}
  if(path.endsWith("/click")||path.endsWith("/clear")||path.endsWith("/value")){send(null);return}
  if(path.endsWith("/screenshot")){send(Buffer.from("not-a-real-png").toString("base64"));return}
  if(path.endsWith("/session/fake-session")&&req.method==="DELETE"){send(null);return}
  res.statusCode=404;send({error:"unknown command"});
 })).listen(0,"127.0.0.1");
 await new Promise<void>(resolve=>server.once("listening",resolve));
 const address=server.address();assert.ok(address&&typeof address!=="string");
 const endpoint="http://127.0.0.1:"+address.port;
 const originalFetch=globalThis.fetch;
 t.mock.method(globalThis,"fetch",async(input:any,init:any)=>{
  const url=String(input);
  if(url==="https://example.com/robots.txt")return new Response("User-agent: *\nDisallow: /blocked\n",{status:200});
  return originalFetch(input,init);
 });
 const engine=new GeckoDriverEngine({endpoint});
 try{
  const opened=await engine.open({url:"https://example.com/"});assert.equal(opened.status,"OK");
  const read=await engine.read();assert.equal(read.status,"OK");assert.equal(read.data?.text,"A safe test page");assert.equal(read.evidence?.final_url,"https://example.com/");assert.equal(read.evidence?.sha256?.length,64);
  const blocked=await engine.open({url:"https://example.com/blocked"});assert.equal(blocked.status,"BLOCKED");
  const click=await engine.click({selector:"button[type=submit]"});assert.equal(click.status,"BLOCKED");
  const submit=await engine.submit({confirm:false});assert.equal(submit.status,"BLOCKED");
 }finally{await engine.close();server.close();}
});
test("private URL is refused before browser session starts",async()=>{const e=new GeckoDriverEngine();const r=await e.open({url:"http://127.0.0.1"});assert.equal(r.status,"BLOCKED");});

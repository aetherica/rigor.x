import test from "node:test";
import assert from "node:assert/strict";
import type { BrowserEngine, BrowserResult } from "../core/types.ts";
import type { BrowserProvider, BrowserSession, BrowserSessionOptions, BrowserProviderId, ProviderSession } from "./contract.ts";
import { ProviderRouter } from "../routing/provider-router.ts";
import { BrowserSessionManager, type BrowserSessionRecord, type BrowserSessionStore } from "../sessions/manager.ts";
import { BrowserRuntime } from "./runtime.ts";

class Store implements BrowserSessionStore {
  records=new Map<string,BrowserSessionRecord>();
  async get(id:string){return this.records.get(id);}
  async listByOwner(owner:string){return [...this.records.values()].filter(r=>r.ownerId===owner);}
  async put(record:BrowserSessionRecord){this.records.set(record.handle,record);}
  async delete(id:string){this.records.delete(id);}
}
class FakeEngine implements BrowserEngine {
  readonly name="fake";
  closed=false;
  lastUrl="";
  async open(options:any):Promise<BrowserResult>{this.lastUrl=options.url;return{status:"OK",data:{url:options.url}};}
  async read():Promise<BrowserResult<{text:string;title:string;url:string}>>{return{status:"OK",data:{text:"page",title:"title",url:this.lastUrl}};}
  async click():Promise<BrowserResult>{return{status:"OK"};}
  async type():Promise<BrowserResult>{return{status:"OK"};}
  async submit():Promise<BrowserResult>{return{status:"OK"};}
  async screenshot():Promise<BrowserResult<{path:string}>>{return{status:"OK",data:{path:"/tmp/test.png"}};}
  async download():Promise<BrowserResult<{path:string;size:number;content_type:string}>>{return{status:"OK",data:{path:"/tmp/file.txt",size:4,content_type:"text/plain"}};}
  async close(){this.closed=true;}
}
function provider():BrowserProvider {
  const active=new Map<string,ProviderSession>();
  return {
    id:"steel" as BrowserProviderId,
    health:()=>({provider:"steel",configured:true,status:"configured"}),
    createSession:async()=>{const s={provider:"steel" as const,id:"remote",status:"running" as const,cdpUrl:"wss://provider.example/cdp"};active.set(s.id,s);return s;},
    getSession:async(id)=>{const s=active.get(id);if(!s)throw new Error("missing");return s;},
    stopSession:async(id)=>{active.delete(id);},
  };
}

test("runtime exposes create, navigate, read/scrape, write/type, screenshot, fetch and close",async()=>{
  const store=new Store(),p=provider(),manager=new BrowserSessionManager(new ProviderRouter([p]),store);
  const made:FakeEngine[]=[];
  const runtime=new BrowserRuntime(manager,()=>{const e=new FakeEngine();made.push(e);return e;});
  const session=await runtime.create("owner-a");
  assert.equal(session.status,"running");
  assert.equal("cdpUrl" in session,false);
  assert.equal((await runtime.navigate("owner-a",session.sessionId,{url:"https://example.com"})).status,"OK");
  assert.equal((await runtime.read("owner-a",session.sessionId)).status,"OK");
  assert.equal((await runtime.scrape("owner-a",session.sessionId,{selector:"main"})).status,"OK");
  assert.equal((await runtime.write("owner-a",session.sessionId,{selector:"input[name=q]",text:"hello"})).status,"OK");
  assert.equal((await runtime.type("owner-a",session.sessionId,{selector:"input[name=q]",text:"hello"})).status,"OK");
  assert.equal((await runtime.screenshot("owner-a",session.sessionId)).status,"OK");
  assert.equal((await runtime.fetch("owner-a",session.sessionId,{url:"https://example.com/file.txt"})).status,"OK");
  await assert.rejects(()=>runtime.read("owner-b",session.sessionId),/not found/);
  await runtime.close("owner-a",session.sessionId);
  assert.equal(made[0]?.closed,true);
  assert.equal(store.records.size,0);
});

test("runtime serializes actions for one session",async()=>{
  const store=new Store(),manager=new BrowserSessionManager(new ProviderRouter([provider()]),store);
  let active=0,maxActive=0;
  const engine:BrowserEngine={
    name:"serial",
    async open(){active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,20));active--;return{status:"OK"};},
    async read(){return{status:"OK",data:{text:"",title:"",url:""}};},
    async click(){return{status:"OK"};},async type(){return{status:"OK"};},async submit(){return{status:"OK"};},
    async screenshot(){return{status:"OK",data:{path:"x"}};},async download(){return{status:"OK",data:{path:"x",size:0,content_type:"text/plain"}};},async close(){}
  };
  const runtime=new BrowserRuntime(manager,()=>engine),session=await runtime.create("owner");
  await Promise.all([runtime.navigate("owner",session.sessionId,{url:"https://a.example"}),runtime.navigate("owner",session.sessionId,{url:"https://b.example"})]);
  assert.equal(maxActive,1);
});

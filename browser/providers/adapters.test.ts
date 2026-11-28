import test from "node:test";
import assert from "node:assert/strict";
import { SteelProvider } from "./steel.ts";
import { HyperbrowserProvider } from "./hyperbrowser.ts";
import { BrowserbaseProvider } from "./browserbase.ts";
import { BrowserProviderError, type BrowserProvider } from "./contract.ts";
import { ProviderRouter } from "../routing/provider-router.ts";

function fakeFetch(handler: (url: string, init?: RequestInit) => unknown): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const value = handler(String(input), init);
    return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

test("Steel adapter creates, retrieves and releases sessions using documented REST contract", async () => {
  const calls: Array<{url:string;init?:RequestInit}> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); calls.push({url,init});
    const body = url.endsWith("/v1/sessions") ? {id:"steel-1",status:"live",websocketUrl:"wss://steel.example/cdp?token=opaque",debugUrl:"https://steel.example/view"} : {id:"steel-1",status:"live",websocketUrl:"wss://steel.example/cdp?token=opaque"};
    return new Response(JSON.stringify(body),{status:200});
  }) as typeof fetch;
  const provider = new SteelProvider({apiKey:"test-secret",fetcher});
  const created = await provider.createSession();
  assert.equal(created.provider,"steel");
  assert.equal(created.status,"running");
  assert.equal(created.liveViewUrl,"https://steel.example/view");
  await provider.getSession("steel-1");
  await provider.stopSession("steel-1");
  assert.equal(calls[0]?.init?.method,"POST");
  assert.equal(new Headers(calls[0]?.init?.headers).get("steel-api-key"),"test-secret");
  assert.equal(calls[2]?.url,"https://api.steel.dev/v1/sessions/steel-1/release");
});

test("Hyperbrowser adapter uses API key header and session lifecycle endpoints", async () => {
  const calls: Array<{url:string;init?:RequestInit}> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url=String(input);calls.push({url,init});
    return new Response(JSON.stringify({id:"hb-1",status:"active",wsEndpoint:"wss://hb.example/cdp",liveUrl:"https://hb.example/live"}),{status:200});
  }) as typeof fetch;
  const provider=new HyperbrowserProvider({apiKey:"hb-secret",fetcher});
  const session=await provider.createSession({timeoutMs:300_000});
  assert.equal(session.cdpUrl,"wss://hb.example/cdp");
  assert.equal(JSON.parse(String(calls[0]?.init?.body)).timeoutMinutes,5);
  assert.equal(new Headers(calls[0]?.init?.headers).get("x-api-key"),"hb-secret");
  await provider.stopSession("hb-1");
  assert.equal(calls[1]?.url,"https://api.hyperbrowser.ai/api/session/hb-1/stop");
  assert.equal(calls[1]?.init?.method,"PUT");
});

test("Browserbase adapter requires project ID and uses REQUEST_RELEASE lifecycle", async () => {
  const calls: Array<{url:string;init?:RequestInit}> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url=String(input);calls.push({url,init});
    return new Response(JSON.stringify({id:"bb-1",status:"RUNNING",connectUrl:"wss://bb.example/cdp"}),{status:200});
  }) as typeof fetch;
  const provider=new BrowserbaseProvider({apiKey:"bb-secret",projectId:"project-1",fetcher});
  const session=await provider.createSession({timeoutMs:120_000});
  assert.equal(session.status,"running");
  assert.equal(JSON.parse(String(calls[0]?.init?.body)).timeout,120);
  await provider.stopSession("bb-1");
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)),{status:"REQUEST_RELEASE"});
});

test("provider router falls back only for retryable provider failures", async () => {
  const makeProvider=(id:"steel"|"hyperbrowser"|"browserbase",failure?:BrowserProviderError):BrowserProvider=>({
    id,
    health:()=>({provider:id,configured:true,status:"configured"}),
    createSession:async()=>{if(failure)throw failure;return{provider:id,id:id+"-session",status:"running",cdpUrl:"wss://example.test"};},
    getSession:async()=>{throw new Error("unused");},
    stopSession:async()=>{},
  });
  const router=new ProviderRouter([
    makeProvider("steel",new BrowserProviderError("steel","busy",429)),
    makeProvider("hyperbrowser"),
  ]);
  const routed=await router.createSession();
  assert.equal(routed.session.provider,"hyperbrowser");
  assert.deepEqual(routed.attempted,["steel","hyperbrowser"]);

  const authRouter=new ProviderRouter([
    makeProvider("steel",new BrowserProviderError("steel","unauthorized",401)),
    makeProvider("hyperbrowser"),
  ]);
  await assert.rejects(()=>authRouter.createSession(),/unauthorized/);
});

test("provider HTTP errors never expose response body", async () => {
  const provider=new SteelProvider({apiKey:"secret",fetcher:(async()=>new Response("secret-bearing provider response",{status:401})) as typeof fetch});
  await assert.rejects(()=>provider.createSession(),(error:unknown)=>{
    assert.ok(error instanceof BrowserProviderError);
    assert.equal(error.message.includes("secret-bearing"),false);
    return true;
  });
});

test("unconfigured providers do not claim live health", () => {
  const provider=new BrowserbaseProvider({apiKey:"key"});
  assert.equal(provider.health().configured,false);
  assert.equal(provider.health().status,"missing_credentials");
});

void fakeFetch;

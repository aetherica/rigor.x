import test from "node:test";
import assert from "node:assert/strict";
import { BrowserProviderError, type BrowserProvider, type BrowserProviderId, type ProviderSession } from "../providers/contract.ts";
import { ProviderRouter } from "../routing/provider-router.ts";
import { BrowserSessionManager, type BrowserSessionRecord, type BrowserSessionStore } from "./manager.ts";

class MemoryStore implements BrowserSessionStore {
  records = new Map<string, BrowserSessionRecord>();
  async get(handle: string) { return this.records.get(handle); }
  async listByOwner(ownerId: string) { return [...this.records.values()].filter((r) => r.ownerId === ownerId); }
  async put(record: BrowserSessionRecord) { this.records.set(record.handle, record); }
  async delete(handle: string) { this.records.delete(handle); }
}

function makeProvider(): BrowserProvider {
  const sessions = new Map<string, ProviderSession>();
  return {
    id: "steel" as BrowserProviderId,
    health: () => ({provider:"steel",configured:true,status:"configured"}),
    createSession: async () => {
      const session={provider:"steel" as const,id:"remote-1",status:"running" as const,cdpUrl:"wss://provider.example/cdp"};
      sessions.set(session.id,session);return session;
    },
    getSession: async (id) => {
      const session=sessions.get(id);if(!session)throw new BrowserProviderError("steel","missing",404);return session;
    },
    stopSession: async (id) => {sessions.delete(id);},
  };
}

test("session handles are owner-scoped and never expose provider CDP URLs", async () => {
  const store=new MemoryStore();
  const manager=new BrowserSessionManager(new ProviderRouter([makeProvider()]),store);
  const handle=await manager.create("owner-a");
  assert.equal(handle.provider,"steel");
  assert.equal("cdpUrl" in handle,false);
  await assert.rejects(()=>manager.resolve("owner-b",handle.sessionId),/not found/);
  const resolved=await manager.resolve("owner-a",handle.sessionId);
  assert.equal(resolved.cdpUrl,"wss://provider.example/cdp");
  await manager.close("owner-a",handle.sessionId);
  assert.equal(store.records.size,0);
});

test("session creation is denied at per-owner concurrency limit", async () => {
  const store=new MemoryStore();
  const manager=new BrowserSessionManager(new ProviderRouter([makeProvider()]),store,1);
  await manager.create("owner-a");
  await assert.rejects(()=>manager.create("owner-a"),(error:unknown)=>{
    assert.ok(error instanceof BrowserProviderError);
    assert.equal(error.statusCode,429);return true;
  });
  assert.equal(store.records.size,1);
});

test("ownership storage failure triggers provider session cleanup", async () => {
  let stopped=false;
  const provider:BrowserProvider={
    ...makeProvider(),
    stopSession:async()=>{stopped=true;},
  };
  const store:BrowserSessionStore={
    get:async()=>undefined,listByOwner:async()=>[],put:async()=>{throw new Error("storage down");},delete:async()=>{},
  };
  const manager=new BrowserSessionManager(new ProviderRouter([provider]),store);
  await assert.rejects(()=>manager.create("owner-a"),/persist session ownership/);
  assert.equal(stopped,true);
});

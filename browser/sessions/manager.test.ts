import test from "node:test";
import assert from "node:assert/strict";
import { BrowserProviderError, type BrowserProvider, type BrowserProviderId, type ProviderSession } from "../providers/contract.ts";
import { ProviderRouter } from "../routing/provider-router.ts";
import { BrowserSessionManager, type BrowserSessionRecord, type BrowserSessionStore } from "./manager.ts";

class MemoryStore implements BrowserSessionStore {
  records = new Map<string, BrowserSessionRecord>();
  reservations = new Map<string, number>();
  async get(handle: string) { return this.records.get(handle); }
  async listByOwner(ownerId: string) { return [...this.records.values()].filter((r) => r.ownerId === ownerId); }
  async put(record: BrowserSessionRecord) {
    this.records.set(record.handle, record);
    const next=(this.reservations.get(record.ownerId)??0)-1;
    if(next>0)this.reservations.set(record.ownerId,next);else this.reservations.delete(record.ownerId);
  }
  async delete(handle: string) { this.records.delete(handle); }
  async reserve(ownerId: string, maximum: number) {
    const pending=this.reservations.get(ownerId) ?? 0;
    const active=[...this.records.values()].filter(r=>r.ownerId===ownerId).length;
    if(active+pending>=maximum)return false;
    this.reservations.set(ownerId,pending+1);return true;
  }
  async releaseReservation(ownerId: string) {
    const next=(this.reservations.get(ownerId)??0)-1;
    if(next>0)this.reservations.set(ownerId,next);else this.reservations.delete(ownerId);
  }
}

function makeProvider(delayMs=0): BrowserProvider {
  const sessions = new Map<string, ProviderSession>();
  let sequence=0;
  return {
    id: "steel" as BrowserProviderId,
    health: () => ({provider:"steel",configured:true,status:"configured"}),
    createSession: async () => {
      if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
      const session={provider:"steel" as const,id:"remote-"+(++sequence),status:"running" as const,cdpUrl:"wss://provider.example/cdp"};
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

test("concurrent creates cannot race past the per-owner limit", async () => {
  const store=new MemoryStore();
  const manager=new BrowserSessionManager(new ProviderRouter([makeProvider(15)]),store,1);
  const results=await Promise.allSettled([manager.create("owner-a"),manager.create("owner-a")]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(results.filter(r=>r.status==="rejected").length,1);
  assert.equal(store.records.size,1);
  assert.equal(store.reservations.size,0);
});

test("ownership storage failure triggers provider session cleanup and releases reservation", async () => {
  let stopped=false,released=false;
  const provider:BrowserProvider={...makeProvider(),stopSession:async()=>{stopped=true;}};
  const store:BrowserSessionStore={
    get:async()=>undefined,listByOwner:async()=>[],put:async()=>{throw new Error("storage down");},delete:async()=>{},
    reserve:async()=>true,releaseReservation:async()=>{released=true;}
  };
  const manager=new BrowserSessionManager(new ProviderRouter([provider]),store);
  await assert.rejects(()=>manager.create("owner-a"),/persist session ownership/);
  assert.equal(stopped,true);
  assert.equal(released,true);
});

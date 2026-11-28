import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteBrowserSessionStore } from "./sqlite-store.ts";

test("SQLite store persists owner-scoped sessions across reopen",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"aetherica-browser-store-")),path=join(dir,"sessions.sqlite");
  const record={handle:"00000000-0000-4000-8000-000000000001",ownerId:"owner-a",provider:"steel" as const,providerSessionId:"provider-session",createdAt:"2026-11-28T00:00:00.000Z"};
  try {
    const first=new SqliteBrowserSessionStore(path);
    assert.equal(await first.reserve("owner-a",1),true);
    await first.put(record);
    await first.releaseReservation("owner-a");
    assert.equal(await first.reserve("owner-a",1),false);
    first.close();
    const second=new SqliteBrowserSessionStore(path);
    assert.deepEqual(await second.get(record.handle),record);
    assert.equal((await second.listByOwner("owner-a")).length,1);
    assert.equal((await second.listByOwner("owner-b")).length,0);
    await second.delete(record.handle);
    assert.equal(await second.get(record.handle),undefined);
    assert.equal(await second.reserve("owner-a",1),true);
    await second.releaseReservation("owner-a");
    second.close();
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test("SQLite store rejects concurrent owner reservations at the configured limit",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"aetherica-browser-reserve-")),path=join(dir,"sessions.sqlite");
  try {
    const store=new SqliteBrowserSessionStore(path);
    const results=await Promise.all([store.reserve("owner",1),store.reserve("owner",1),store.reserve("owner",1)]);
    assert.equal(results.filter(Boolean).length,1);
    await store.releaseReservation("owner");
    assert.equal(await store.reserve("owner",1),true);
    await store.releaseReservation("owner");
    store.close();
  } finally { await rm(dir,{recursive:true,force:true}); }
});

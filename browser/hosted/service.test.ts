import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHostedBrowserService } from "./service.ts";

test("hosted service composes registry and durable store without starting provider sessions",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"aetherica-hosted-browser-"));
  const service=await createHostedBrowserService({dataDir:dir,env:{}});
  try {
    assert.equal(service.registry.list().length,10);
    assert.deepEqual(service.providers.health().map(x=>x.status),["missing_credentials","missing_credentials","missing_credentials"]);
    assert.deepEqual(await service.store.listByOwner("owner-a"),[]);
  } finally {
    service.close();
    await rm(dir,{recursive:true,force:true});
  }
});

test("hosted service rejects invalid provider order and concurrency limits",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"aetherica-hosted-browser-config-"));
  try {
    await assert.rejects(()=>createHostedBrowserService({dataDir:dir,env:{AETHERICA_BROWSER_PROVIDER_ORDER:"steel,unknown"}}),/AETHERICA_BROWSER_PROVIDER_ORDER/);
    await assert.rejects(()=>createHostedBrowserService({dataDir:dir,env:{AETHERICA_BROWSER_MAX_SESSIONS_PER_OWNER:"0"}}),/AETHERICA_BROWSER_MAX_SESSIONS_PER_OWNER/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { BROWSER_TOOLS, BrowserToolRegistry } from "./tool-registry.ts";

test("hosted registry advertises the complete browser action surface with safety annotations",()=>{
  const names=BROWSER_TOOLS.map(t=>t.name);
  for(const name of [
    "aetherica_browser_create_session","aetherica_browser_navigate","aetherica_browser_read",
    "aetherica_browser_scrape","aetherica_browser_write","aetherica_browser_click",
    "aetherica_browser_submit","aetherica_browser_screenshot","aetherica_browser_fetch",
    "aetherica_browser_close_session"
  ]) assert.ok(names.includes(name),name);
  assert.equal(BROWSER_TOOLS.find(t=>t.name==="aetherica_browser_submit")?.annotations.destructiveHint,true);
  assert.equal(BROWSER_TOOLS.find(t=>t.name==="aetherica_browser_close_session")?.annotations.destructiveHint,true);
});

test("registry refuses calls without authenticated owner context",async()=>{
  const registry=new BrowserToolRegistry({} as any);
  await assert.rejects(()=>registry.call({ownerId:""},"aetherica_browser_create_session"),/Verified OAuth owner identity/);
});

import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("registry embeds screenshot and fetch artifacts without exposing local paths",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"aetherica-artifact-test-"));
  const screenshotPath=join(dir,"shot.png"),fetchPath=join(dir,"file.txt");
  await writeFile(screenshotPath,Buffer.from("png-data"));
  await writeFile(fetchPath,Buffer.from("hello"));
  const runtime={
    screenshot:async()=>({status:"OK",data:{path:screenshotPath}}),
    fetch:async()=>({status:"OK",data:{path:fetchPath,size:5,content_type:"text/plain"}})
  };
  const registry=new BrowserToolRegistry(runtime as any);
  try {
    const shot=await registry.call({ownerId:"owner"},"aetherica_browser_screenshot",{session_id:"00000000-0000-4000-8000-000000000000"}) as any;
    assert.equal(shot.content[0].type,"image");
    assert.equal(shot.content[0].mimeType,"image/png");
    assert.equal(shot.content[0].data,Buffer.from("png-data").toString("base64"));
    assert.equal(JSON.stringify(shot).includes(screenshotPath),false);
    const fetched=await registry.call({ownerId:"owner"},"aetherica_browser_fetch",{session_id:"00000000-0000-4000-8000-000000000000",url:"https://example.com/file.txt"}) as any;
    assert.equal(fetched.content[0].type,"resource");
    assert.equal(fetched.content[0].resource.blob,Buffer.from("hello").toString("base64"));
    assert.equal(JSON.stringify(fetched).includes(fetchPath),false);
    await assert.rejects(()=>readFile(screenshotPath));
    await assert.rejects(()=>readFile(fetchPath));
  } finally { await rm(dir,{recursive:true,force:true}); }
});

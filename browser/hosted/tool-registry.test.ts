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

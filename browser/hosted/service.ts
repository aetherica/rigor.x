import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BrowserbaseProvider } from "../providers/browserbase.ts";
import { HyperbrowserProvider } from "../providers/hyperbrowser.ts";
import { SteelProvider } from "../providers/steel.ts";
import { ProviderRouter } from "../routing/provider-router.ts";
import { BrowserSessionManager } from "../sessions/manager.ts";
import { SqliteBrowserSessionStore } from "../sessions/sqlite-store.ts";
import { BrowserRuntime } from "../providers/runtime.ts";
import { BrowserToolRegistry } from "./tool-registry.ts";

export interface HostedBrowserEnvironment {
  STEEL_API_KEY?: string;
  STEEL_PROJECT_ID?: string;
  HYPERBROWSER_API_KEY?: string;
  BROWSERBASE_API_KEY?: string;
  BROWSERBASE_PROJECT_ID?: string;
  AETHERICA_BROWSER_PROVIDER_ORDER?: string;
  AETHERICA_BROWSER_MAX_SESSIONS_PER_OWNER?: string;
}

export interface HostedBrowserService {
  registry: BrowserToolRegistry;
  runtime: BrowserRuntime;
  store: SqliteBrowserSessionStore;
  providers: ProviderRouter;
  close(): void;
}

const PROVIDERS = new Set(["steel", "hyperbrowser", "browserbase"]);

function providerOrder(raw?: string): Array<"steel"|"hyperbrowser"|"browserbase"> {
  if (!raw) return ["steel","hyperbrowser","browserbase"];
  const values=raw.split(",").map(x=>x.trim()).filter(Boolean);
  if (!values.length || values.some(x=>!PROVIDERS.has(x)) || new Set(values).size!==values.length) {
    throw new Error("AETHERICA_BROWSER_PROVIDER_ORDER must be a unique comma-separated list of steel,hyperbrowser,browserbase.");
  }
  return values as Array<"steel"|"hyperbrowser"|"browserbase">;
}

function ownerLimit(raw?:string):number {
  if(raw===undefined || raw==="")return 3;
  const n=Number(raw);
  if(!Number.isInteger(n)||n<1||n>10)throw new Error("AETHERICA_BROWSER_MAX_SESSIONS_PER_OWNER must be an integer from 1 to 10.");
  return n;
}

/**
 * Build the hosted browser capability without starting a provider session.
 * This factory is deliberately side-effect free with respect to provider billing: credentials are
 * only checked for presence by health(); no remote API is called until a user creates a session.
 */
export async function createHostedBrowserService(options:{
  dataDir:string;
  env:HostedBrowserEnvironment;
  engineFactory?:ConstructorParameters<typeof BrowserRuntime>[1];
}):Promise<HostedBrowserService>{
  const dataDir=resolve(options.dataDir);
  await mkdir(dataDir,{recursive:true,mode:0o700});
  const env=options.env;
  const providers=new ProviderRouter([
    new SteelProvider({apiKey:env.STEEL_API_KEY}),
    new HyperbrowserProvider({apiKey:env.HYPERBROWSER_API_KEY}),
    new BrowserbaseProvider({apiKey:env.BROWSERBASE_API_KEY,projectId:env.BROWSERBASE_PROJECT_ID}),
  ],{order:providerOrder(env.AETHERICA_BROWSER_PROVIDER_ORDER)});
  const store=new SqliteBrowserSessionStore(join(dataDir,"browser-sessions.sqlite"));
  const sessions=new BrowserSessionManager(providers,store,ownerLimit(env.AETHERICA_BROWSER_MAX_SESSIONS_PER_OWNER));
  const runtime=new BrowserRuntime(sessions,options.engineFactory);
  const registry=new BrowserToolRegistry(runtime);
  return {registry,runtime,store,providers,close:()=>store.close()};
}

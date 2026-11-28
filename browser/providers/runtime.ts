import type { BrowserEngine, BrowserResult, OpenOptions, ReadOptions, ClickOptions, TypeOptions, SubmitOptions, ScreenshotOptions, DownloadOptions } from "../core/types.ts";
import { BrowserSessionManager, type PublicSessionHandle } from "../sessions/manager.ts";
import { CdpBrowserEngine } from "./cdp-engine.ts";

export type BrowserEngineFactory = (cdpUrl: string) => BrowserEngine;

/**
 * Owner-scoped orchestration between provider sessions and the Browser Core contract.
 * Authentication is intentionally supplied by the future MCP gateway; callers must pass
 * a verified owner subject, never an email or client-provided identity.
 */
export class BrowserRuntime {
  private readonly sessions: BrowserSessionManager;
  private readonly engineFactory: BrowserEngineFactory;
  private readonly engines = new Map<string,BrowserEngine>();
  private readonly queues = new Map<string,Promise<unknown>>();

  constructor(sessions: BrowserSessionManager, engineFactory: BrowserEngineFactory = (url)=>new CdpBrowserEngine(url)) {
    this.sessions = sessions;
    this.engineFactory = engineFactory;
  }

  async create(ownerId: string): Promise<PublicSessionHandle> {
    const handle = await this.sessions.create(ownerId);
    try {
      const remote = await this.sessions.resolve(ownerId,handle.sessionId);
      this.engines.set(this.key(ownerId,handle.sessionId),this.engineFactory(remote.cdpUrl));
      return handle;
    } catch (error) {
      await this.sessions.close(ownerId,handle.sessionId).catch(()=>{});
      throw error;
    }
  }

  navigate(ownerId:string,sessionId:string,options:OpenOptions):Promise<BrowserResult> {
    return this.run(ownerId,sessionId,engine=>engine.open(options));
  }
  read(ownerId:string,sessionId:string,options:ReadOptions = {}):Promise<BrowserResult> {
    return this.run(ownerId,sessionId,engine=>engine.read(options));
  }
  scrape(ownerId:string,sessionId:string,options:ReadOptions = {}):Promise<BrowserResult> {
    return this.read(ownerId,sessionId,options);
  }
  click(ownerId:string,sessionId:string,options:ClickOptions):Promise<BrowserResult> {
    return this.run(ownerId,sessionId,engine=>engine.click(options));
  }
  write(ownerId:string,sessionId:string,options:TypeOptions):Promise<BrowserResult> {
    return this.run(ownerId,sessionId,engine=>engine.type(options));
  }
  type(ownerId:string,sessionId:string,options:TypeOptions):Promise<BrowserResult> {
    return this.write(ownerId,sessionId,options);
  }
  submit(ownerId:string,sessionId:string,options:SubmitOptions):Promise<BrowserResult> {
    return this.run(ownerId,sessionId,engine=>engine.submit(options));
  }
  screenshot(ownerId:string,sessionId:string,options:ScreenshotOptions = {}):Promise<BrowserResult> {
    return this.run(ownerId,sessionId,engine=>engine.screenshot(options));
  }
  fetch(ownerId:string,sessionId:string,options:DownloadOptions):Promise<BrowserResult> {
    return this.run(ownerId,sessionId,engine=>engine.download(options));
  }
  close(ownerId:string,sessionId:string):Promise<void> {
    return this.enqueue(ownerId,sessionId,async()=>{
      const key=this.key(ownerId,sessionId);
      const engine=this.engines.get(key);
      this.engines.delete(key);
      try { await engine?.close(); }
      finally { await this.sessions.close(ownerId,sessionId); }
    });
  }

  private async run<T extends BrowserResult>(ownerId:string,sessionId:string,action:(engine:BrowserEngine)=>Promise<T>):Promise<T> {
    return this.enqueue(ownerId,sessionId,async()=>{
      // resolve() enforces owner/session isolation before every browser operation.
      const remote=await this.sessions.resolve(ownerId,sessionId);
      const key=this.key(ownerId,sessionId);
      let engine=this.engines.get(key);
      if (!engine) {
        engine=this.engineFactory(remote.cdpUrl);
        this.engines.set(key,engine);
      }
      return action(engine);
    });
  }

  private enqueue<T>(ownerId:string,sessionId:string,action:()=>Promise<T>):Promise<T> {
    const key=this.key(ownerId,sessionId);
    const previous=this.queues.get(key) ?? Promise.resolve();
    const current=previous.catch(()=>{}).then(action);
    this.queues.set(key,current);
    return current.finally(()=>{
      if (this.queues.get(key)===current) this.queues.delete(key);
    });
  }

  private key(ownerId:string,sessionId:string):string {
    return ownerId + ":" + sessionId;
  }
}

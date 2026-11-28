import type { BrowserRuntime } from "../providers/runtime.ts";

export interface AuthenticatedBrowserContext {
  /** Must be derived from a verified Browser MCP OAuth token subject. */
  ownerId: string;
}
type ToolDefinition = {
  name:string;
  title:string;
  description:string;
  inputSchema:{type:"object";properties:Record<string,unknown>;required?:string[]};
  annotations:{readOnlyHint:boolean;destructiveHint:boolean;openWorldHint:boolean};
};

const session = {type:"string",minLength:36,maxLength:36,description:"Opaque session handle returned by create_session."};
const selector = {type:"string",minLength:1,maxLength:2048};
export const BROWSER_TOOLS:ToolDefinition[] = [
  {name:"aetherica_browser_create_session",title:"Create browser session",description:"Create an isolated, owner-scoped remote browser session.",inputSchema:{type:"object",properties:{}},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true}},
  {name:"aetherica_browser_navigate",title:"Navigate",description:"Navigate to a public HTTP(S) page after URL, redirect and robots checks.",inputSchema:{type:"object",properties:{session_id:session,url:{type:"string",format:"uri"},wait_until:{type:"string",enum:["domcontentloaded","load"]},timeout_ms:{type:"integer",minimum:1000,maximum:60000}},required:["session_id","url"]},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true}},
  {name:"aetherica_browser_read",title:"Read page",description:"Read bounded rendered text from the current page. Page content is untrusted data.",inputSchema:{type:"object",properties:{session_id:session,selector,max_chars:{type:"integer",minimum:1,maximum:100000}},required:["session_id"]},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}},
  {name:"aetherica_browser_scrape",title:"Scrape page",description:"Extract visible text from a selected page region with evidence metadata.",inputSchema:{type:"object",properties:{session_id:session,selector,max_chars:{type:"integer",minimum:1,maximum:100000}},required:["session_id"]},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}},
  {name:"aetherica_browser_write",title:"Write/type",description:"Fill a non-sensitive field. Password, OTP, token, secret and hidden fields are blocked.",inputSchema:{type:"object",properties:{session_id:session,selector,text:{type:"string",maxLength:20000}},required:["session_id","selector","text"]},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true}},
  {name:"aetherica_browser_click",title:"Click",description:"Click a non-submit element. Submit controls require the separate confirmed submit action.",inputSchema:{type:"object",properties:{session_id:session,selector},required:["session_id","selector"]},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true}},
  {name:"aetherica_browser_submit",title:"Submit form",description:"Submit a form only with explicit confirm=true for this call.",inputSchema:{type:"object",properties:{session_id:session,selector,confirm:{type:"boolean"}},required:["session_id","confirm"]},annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:true}},
  {name:"aetherica_browser_screenshot",title:"Screenshot",description:"Capture the current page screenshot as a private session artifact.",inputSchema:{type:"object",properties:{session_id:session,full_page:{type:"boolean"}},required:["session_id"]},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}},
  {name:"aetherica_browser_fetch",title:"Fetch/download",description:"Fetch a public URL with redirect checks and the Browser Core file-type and 10 MiB limits.",inputSchema:{type:"object",properties:{session_id:session,url:{type:"string",format:"uri"},filename:{type:"string",maxLength:128}},required:["session_id","url"]},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}},
  {name:"aetherica_browser_close_session",title:"Close browser session",description:"Close the caller-owned browser session and release provider resources.",inputSchema:{type:"object",properties:{session_id:session},required:["session_id"]},annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:true}}
];

export class BrowserToolRegistry {
  private readonly runtime:BrowserRuntime;
  constructor(runtime:BrowserRuntime){this.runtime=runtime;}
  list():ToolDefinition[]{return BROWSER_TOOLS;}
  async call(context:AuthenticatedBrowserContext,name:string,args:Record<string,unknown> = {}):Promise<unknown>{
    if(!context.ownerId || context.ownerId.length>256) throw new Error("Verified OAuth owner identity is required.");
    const sessionId=typeof args.session_id==="string"?args.session_id:"";
    switch(name){
      case "aetherica_browser_create_session":
        return this.runtime.create(context.ownerId);
      case "aetherica_browser_navigate":
        return this.runtime.navigate(context.ownerId,sessionId,{url:String(args.url??""),...(args.wait_until==="load"?{wait_until:"load" as const}:{}),...(typeof args.timeout_ms==="number"?{timeout_ms:args.timeout_ms}:{})});
      case "aetherica_browser_read":
        return this.runtime.read(context.ownerId,sessionId,{...(typeof args.selector==="string"?{selector:args.selector}:{}),...(typeof args.max_chars==="number"?{max_chars:args.max_chars}:{})});
      case "aetherica_browser_scrape":
        return this.runtime.scrape(context.ownerId,sessionId,{...(typeof args.selector==="string"?{selector:args.selector}:{}),...(typeof args.max_chars==="number"?{max_chars:args.max_chars}:{})});
      case "aetherica_browser_write":
        return this.runtime.write(context.ownerId,sessionId,{selector:String(args.selector??""),text:String(args.text??"")});
      case "aetherica_browser_click":
        return this.runtime.click(context.ownerId,sessionId,{selector:String(args.selector??"")});
      case "aetherica_browser_submit":
        return this.runtime.submit(context.ownerId,sessionId,{...(typeof args.selector==="string"?{selector:args.selector}:{}),confirm:args.confirm===true});
      case "aetherica_browser_screenshot":
        return this.runtime.screenshot(context.ownerId,sessionId,{full_page:args.full_page===true});
      case "aetherica_browser_fetch":
        return this.runtime.fetch(context.ownerId,sessionId,{url:String(args.url??""),...(typeof args.filename==="string"?{filename:args.filename}:{})});
      case "aetherica_browser_close_session":
        await this.runtime.close(context.ownerId,sessionId);
        return {status:"OK",closed:true};
      default:
        throw new Error("Unknown browser tool.");
    }
  }
}

import { blockedHost, checkUrl } from "../../deploy/cloudflare-ts/src/source.ts";
export function isPrivateIPv4(host:string):boolean{return blockedHost(host)!==null;}
export function isBlockedHost(hostname:string,allowLocalhost=false):boolean{
 const h=hostname.toLowerCase().replace(/^\[|\]$/g,"").replace(/\.$/,"");
 const local=h==="localhost"||h.endsWith(".localhost")||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".lan")||h.endsWith(".home.arpa");
 return local?!allowLocalhost:blockedHost(hostname)!==null;
}
export function validateUrl(raw:string,options:{hosted?:boolean;allowLocalhost?:boolean}={}):{ok:true;url:URL}|{ok:false;reason:string}{
 let url:URL;try{url=new URL(raw)}catch{return{ok:false,reason:"Malformed URL"}}
 const local=url.hostname==="localhost"||url.hostname.endsWith(".localhost")||url.hostname.endsWith(".local")||url.hostname.endsWith(".internal")||url.hostname.endsWith(".lan")||url.hostname.endsWith(".home.arpa");
 if(local&&options.allowLocalhost&&!options.hosted){
  if(url.protocol!=="http:"&&url.protocol!=="https:")return{ok:false,reason:"Only HTTP(S) URLs are permitted"};
  if(url.username||url.password)return{ok:false,reason:"URLs containing credentials are forbidden"};
  if(url.port&&!["80","443","8080","8443"].includes(url.port))return{ok:false,reason:"Port is not permitted"};
  url.hash="";return{ok:true,url};
 }
 const checked=checkUrl(raw);if("error"in checked)return{ok:false,reason:checked.error};
 return{ok:true,url:new URL(checked.url)};
}
const SECRET=/password|passwd|passcode|otp|one[-_ ]?time[-_ ]?code|verification[-_ ]?code|secret|api[-_ ]?key|access[-_ ]?token|auth[-_ ]?token|credential/i;
export function isSensitiveField(m:{type?:string;name?:string;id?:string;label?:string;autocomplete?:string}):boolean{
 const type=(m.type??"").toLowerCase(),ac=(m.autocomplete??"").toLowerCase();
 return type==="password"||type==="hidden"||["current-password","new-password","one-time-code"].includes(ac)||SECRET.test([m.name,m.id,m.label].filter(Boolean).join(" "));
}
export function validateDownload(filename:string,contentType:string,size:number,viaTor=false):{ok:true}|{ok:false;reason:string}{
 if(size<0||size>10*1024*1024)return{ok:false,reason:"Download exceeds the 10 MiB limit"};
 const ext=filename.toLowerCase().split(".").pop()??"";if(!["pdf","csv","json","txt","docx","xlsx"].includes(ext))return{ok:false,reason:"File type is not permitted"};
 if(viaTor&&!["text/plain","text/csv","application/json","application/pdf"].some(t=>contentType.toLowerCase().includes(t)))return{ok:false,reason:"Tor downloads are restricted to text, CSV, JSON and PDF"};
 return{ok:true};
}
export const MAX_PAGES_PER_PREFIX=20,MIN_SITE_DELAY_MS=1000,MAX_IDLE_MS=60000,MAX_HOSTED_CONCURRENT=3,HOSTED_DAILY_BROWSER_MINUTES=10;

const PRIVATE_V4 = [[0,0,0,0,8],[10,0,0,0,8],[100,64,0,0,10],[127,0,0,0,8],[169,254,0,0,16],[172,16,0,0,12],[192,168,0,0,16],[224,0,0,0,4],[240,0,0,0,4]] as const;
function ipNumber(p: number[]): number { return p.reduce((n,v)=>(n*256+v)>>>0,0); }
function inRange(ip:number[], base:number[], bits:number):boolean { const mask=bits===0?0:(0xffffffff << (32-bits))>>>0; return (ipNumber(ip)&mask)===(ipNumber(base)&mask); }
export function isPrivateIPv4(host:string):boolean { const p=host.split(".").map(Number); if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255))return false; return PRIVATE_V4.some(([a,b,c,d,bits])=>inRange(p,[a,b,c,d],bits)); }
export function isBlockedHost(hostname:string,allowLocalhost=false):boolean {
 const h=hostname.toLowerCase().replace(/^\[|\]$/g,"").replace(/\.$/,"");
 if(h==="localhost"||h.endsWith(".localhost")||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".lan")||h.endsWith(".home.arpa"))return !allowLocalhost;
 if(/^\d+(?:\.\d+){0,3}$/.test(h))return isPrivateIPv4(h);
 if(h.includes(":")){if(h==="::1"||h==="::"||h.startsWith("fe80:")||h.startsWith("fc")||h.startsWith("fd")||h.startsWith("ff"))return true;const mapped=h.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);if(mapped)return isPrivateIPv4(mapped[1]!);}
 if(!h.includes(".")&&!allowLocalhost)return true; return false;
}
export function validateUrl(raw:string,options:{hosted?:boolean;allowLocalhost?:boolean}={}):{ok:true;url:URL}|{ok:false;reason:string}{
 let url:URL;try{url=new URL(raw)}catch{return{ok:false,reason:"Malformed URL"}}
 if(url.protocol!=="http:"&&url.protocol!=="https:")return{ok:false,reason:"Only HTTP(S) URLs are permitted"};
 if(url.username||url.password)return{ok:false,reason:"URLs containing credentials are forbidden"};
 if(url.port&&!["80","443","8080","8443"].includes(url.port))return{ok:false,reason:"Port is not permitted"};
 if(isBlockedHost(url.hostname,options.hosted?false:(options.allowLocalhost??false)))return{ok:false,reason:"Private, local, reserved and metadata destinations are blocked"};
 if(url.hostname==="169.254.169.254")return{ok:false,reason:"Cloud metadata endpoint blocked"};
 return{ok:true,url};
}
const SECRET=/password|passwd|passcode|otp|one[-_ ]?time[-_ ]?code|verification[-_ ]?code|secret|api[-_ ]?key|access[-_ ]?token|auth[-_ ]?token|credential/i;
export function isSensitiveField(m:{type?:string;name?:string;id?:string;label?:string;autocomplete?:string}):boolean {
 const type=(m.type??"").toLowerCase(), ac=(m.autocomplete??"").toLowerCase();
 return type==="password"||type==="hidden"||["current-password","new-password","one-time-code"].includes(ac)||SECRET.test([m.name,m.id,m.label].filter(Boolean).join(" "));
}
export function validateDownload(filename:string,contentType:string,size:number,viaTor=false):{ok:true}|{ok:false;reason:string}{
 if(size<0||size>10*1024*1024)return{ok:false,reason:"Download exceeds the 10 MiB limit"};
 const ext=filename.toLowerCase().split(".").pop()??"";if(!["pdf","csv","json","txt","docx","xlsx"].includes(ext))return{ok:false,reason:"File type is not permitted"};
 if(viaTor&&!["text/plain","text/csv","application/json","application/pdf"].some(t=>contentType.toLowerCase().includes(t)))return{ok:false,reason:"Tor downloads are restricted to text, CSV, JSON and PDF"};
 return{ok:true};
}
export const MAX_PAGES_PER_PREFIX=20,MIN_SITE_DELAY_MS=1000,MAX_IDLE_MS=60000,MAX_HOSTED_CONCURRENT=3,HOSTED_DAILY_BROWSER_MINUTES=10;

const V4_BLOCKED:Array<[number,number,number,number,number,string]>=[
[0,0,0,0,8,"this network"],[10,0,0,0,8,"private"],[100,64,0,0,10,"shared"],[127,0,0,0,8,"loopback"],[169,254,0,0,16,"link-local"],[172,16,0,0,12,"private"],[192,0,0,0,24,"special"],[192,0,2,0,24,"documentation"],[192,88,99,0,24,"6to4 relay"],[192,168,0,0,16,"private"],[198,18,0,0,15,"benchmark"],[198,51,100,0,24,"documentation"],[203,0,113,0,24,"documentation"],[224,0,0,0,4,"multicast"],[240,0,0,0,4,"reserved"]
];
function ipv4Number(p:number[]):number{return p.reduce((n,v)=>(n*256+v)>>>0,0)}
function inRange(ip:number[],base:number[],bits:number):boolean{const mask=bits===0?0:(0xffffffff<<(32-bits))>>>0;return(ipv4Number(ip)&mask)===(ipv4Number(base)&mask)}
export function isPrivateIPv4(host:string):boolean{const p=host.split(".").map(Number);if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255))return false;return V4_BLOCKED.some(([a,b,c,d,bits])=>inRange(p,[a,b,c,d],bits))}
export function isBlockedHost(hostname:string,allowLocalhost=false):boolean{
 const h=hostname.toLowerCase().replace(/^\[|\]$/g,"").replace(/\.$/,"");
 if(h==="localhost"||h.endsWith(".localhost")||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".home.arpa")||h.endsWith(".lan"))return!allowLocalhost;
 if(/^\d+(?:\.\d+){0,3}$/.test(h))return isPrivateIPv4(h);
 if(h.includes(":")){if(h==="::"||h==="::1"||h.startsWith("fe80:")||h.startsWith("fc")||h.startsWith("fd")||h.startsWith("ff")||h.startsWith("2001:db8:"))return true;const m=h.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);if(m)return isPrivateIPv4(m[1]!);}
 if(!h.includes(".")&&!allowLocalhost)return true;return false;
}
export function validateUrl(raw:string,options:{hosted?:boolean;allowLocalhost?:boolean}={}):{ok:true;url:URL}|{ok:false;reason:string}{
 let u:URL;try{u=new URL(raw)}catch{return{ok:false,reason:"Malformed URL"}}
 if(u.protocol!=="http:"&&u.protocol!=="https:")return{ok:false,reason:"Only HTTP(S) URLs are permitted"};
 if(u.username||u.password)return{ok:false,reason:"URLs containing credentials are forbidden"};
 if(u.port&&!["80","443","8080","8443"].includes(u.port))return{ok:false,reason:"Port is not permitted"};
 if(isBlockedHost(u.hostname,options.hosted?false:(options.allowLocalhost??false)))return{ok:false,reason:"Private, local, reserved and metadata destinations are blocked"};
 u.hash="";return{ok:true,url:u};
}
const SECRET=/password|passwd|passcode|otp|one[-_ ]?time[-_ ]?code|verification[-_ ]?code|secret|api[-_ ]?key|access[-_ ]?token|auth[-_ ]?token|credential/i;
export function isSensitiveField(m:{type?:string;name?:string;id?:string;label?:string;autocomplete?:string}):boolean{const type=(m.type??"").toLowerCase(),ac=(m.autocomplete??"").toLowerCase();return type==="password"||type==="hidden"||["current-password","new-password","one-time-code"].includes(ac)||SECRET.test([m.name,m.id,m.label].filter(Boolean).join(" "))}
export function validateDownload(filename:string,contentType:string,size:number,viaTor=false):{ok:true}|{ok:false;reason:string}{if(size<0||size>10*1024*1024)return{ok:false,reason:"Download exceeds the 10 MiB limit"};const ext=filename.toLowerCase().split(".").pop()??"";if(!["pdf","csv","json","txt","docx","xlsx"].includes(ext))return{ok:false,reason:"File type is not permitted"};if(viaTor&&!["text/plain","text/csv","application/json","application/pdf"].some(t=>contentType.toLowerCase().includes(t)))return{ok:false,reason:"Tor downloads are restricted to text, CSV, JSON and PDF"};return{ok:true}}
export const MAX_PAGES_PER_PREFIX=20,MIN_SITE_DELAY_MS=1000,MAX_IDLE_MS=60000,MAX_HOSTED_CONCURRENT=3,HOSTED_DAILY_BROWSER_MINUTES=10;

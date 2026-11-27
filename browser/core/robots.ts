export interface RobotsRule{allow:boolean;path:string;specificity:number}
export interface RobotsDecision{allowed:boolean;matched:RobotsRule|null}
const specificity=(p:string)=>p.replace(/[\*$]/g,"").length;
export function parseRobots(text:string,userAgent="AethericaBrowser"):RobotsRule[]{
 const groups:{agents:string[];rules:RobotsRule[]}[]=[];let group:{agents:string[];rules:RobotsRule[]}|null=null;
 for(const raw of text.split(/\r?\n/)){const line=raw.split("#")[0]!.trim(),m=/^([^:]+):\s*(.*)$/.exec(line);if(!m)continue;const key=m[1]!.trim().toLowerCase(),value=m[2]!.trim();
 if(key==="user-agent"){if(!group||group.rules.length){group={agents:[],rules:[]};groups.push(group)}group.agents.push(value.toLowerCase())}
 else if((key==="allow"||key==="disallow")&&value&&group)group.rules.push({allow:key==="allow",path:value,specificity:specificity(value)});
 }
 // RFC 9309: the group whose user-agent equals our product token (case-insensitive); substrings do not match.
 const ua=userAgent.toLowerCase().split("/")[0]!.trim(),specific=groups.filter(g=>g.agents.some(a=>a!=="*"&&a.split("/")[0]!.trim()===ua));
 const selected=specific.length?specific:groups.filter(g=>g.agents.includes("*"));
 return selected.flatMap(g=>g.rules);
}
function ruleMatches(path:string,pattern:string):boolean {
 const anchored=pattern.endsWith("$"),body=anchored?pattern.slice(0,-1):pattern;let regex="";
 for(const ch of body){if(ch==="*")regex+=".*";else regex+=ch.replace(/[.+?^$()|{}\\[\]]/g,"\\$&")}
 try{return new RegExp("^"+regex+(anchored?"":".*")).test(path)}catch{return path.startsWith(body)}
}
export function decideRobots(path:string,rules:RobotsRule[]):RobotsDecision{
 const matched=rules.filter(r=>ruleMatches(path,r.path)).sort((a,b)=>b.specificity-a.specificity||Number(b.allow)-Number(a.allow))[0]??null;
 return{allowed:matched?matched.allow:true,matched};
}
export function robotsFetchStatusAllowed(status:number):boolean{if(status>=500)return false;if(status>=400&&status<500)return true;return status>=200&&status<300}

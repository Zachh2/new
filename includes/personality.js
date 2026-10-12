'use strict';
const lines=require('./personality-lines.json');
const state=require('./threadState');
const STYLES={formal:'Use a respectful, formal tone.',funny:'Use light, friendly humor when appropriate; never ridicule people.',chill:'Use a warm, relaxed tone.',gaming:'Use light gaming expressions while staying clear.',student:'Explain simply and help the reader learn.',minimal:'Be concise and direct.'};
function settings(threadID){
  try{const s=state.get(threadID);return {profile:s.smartGroups?.personality,language:s.language||'en'};}catch(_){return {};}
}
function instruction(threadID){return STYLES[settings(threadID).profile]||'';}
const footers=new Set(Object.values(lines).flatMap(lang=>Object.values(lang).flat()));
function transform(text,threadID,seed=''){
  if(typeof text!=='string')return text;
  const {profile,language}=settings(threadID),list=(lines[language]||lines.en)?.[profile];
  if(!list||profile==='minimal')return text;
  // Append only: retain original results, amounts, code, links and mention offsets.
  if(footers.has(text.trim().split('\n').at(-1)))return text;
  if(text.length>17000)return text;
  let hash=0;for(const c of String(seed||text))hash=(hash*31+c.charCodeAt(0))>>>0;
  let chosen=list[hash%list.length];
  // Avoid jokes on safety/emergency material; preserve the command's exact notice.
  if(profile==='funny'&&/\b(?:suicid\w*|self.harm|emergency|abuse|assault|magpakamatay|pagpapakamatay|nagdurugo)\b/i.test(text))return text;
  return text+(text?'\n\n':'')+chosen;
}
function decorate(message,threadID,seed){
  if(threadID==null)return message;
  if(typeof message==='string')return transform(message,threadID,seed);
  if(message&&typeof message==='object'&&(typeof message.body==='string'||message.attachment)){
    const body=transform(message.body||'',threadID,seed);
    return body===message.body?message:{...message,body};
  }
  return message;
}
module.exports={decorate,instruction,transform};

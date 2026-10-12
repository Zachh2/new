'use strict';
// Only complete command words count. A ship in "friendship" is not a command.
const REVIEW = new Set(['eval','shell','exec','npm','command','event','restart','update','shutdown','sendnoti','delete','setmoney','pay','kick','ban','adduser','pending','admin','tempban','language','personality','mentions','smart','assistant']);
const TEXT = new Set(['discord','music','lyrics','video','pinterest','brat','catsay','quote','carbon']);
const READ = new Set(['ship','balance','help','mood','catchup','streak','topmoney','topexp','ping']);
function masked(text,event){
  let s=text.replace(/https?:\/\/\S+|"[^"\n]*"|“[^”\n]*”|'[^'\n]*'/g,m=>' '.repeat(m.length));
  for(const name of Object.values(event?.mentions||{})){
    if(typeof name==='string'&&name)s=s.split(name).join(' '.repeat(name.length));
  }
  return s;
}
function payload(text) {
  let s=text.trim().replace(/^[\s:–—-]+/,'');
  const quote=s.match(/["“]([^"”]+)["”]/);
  if(quote)return quote[1];
  const marker=s.match(/\b(?:with text|with the text|saying|na may text|na nakasulat|nga may text|nga nagasiling|ang text(?: ay)?|text(?: ay)?|nakasulat(?: ay)?|nga naay text|ti teksto)\s*[:=-]?\s*(.+)$/i);
  if(marker)return marker[1].trim();
  for(let i=0;i<6;i++){
    const next=s.replace(/^(?:nga|naman|po|please|pls|lang|man|bi|bala|daw|ako|ko|moko|mo|akong|akon|para sa akin|for me|image|message|ng|og|sang|ti)\b[\s,:-]*/i,'');
    if(next===s)break;s=next;
  }
  return s.trim();
}
function resolve(text,commands,{event,addressed=false}={}) {
  const scan=masked(text,event), matches=[];
  for(const token of scan.matchAll(/[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)*/gu)){
    let name=token[0].toLowerCase(),offset=token.index;
    if(name.startsWith('paki-')){offset+=5;name=name.slice(5);}
    const cmd=commands?.get(name);
    if(!cmd)continue;
    matches.push({name,index:offset,end:offset+name.length,cmd});
  }
  if(!matches.length)return null;
  const first=matches[0];
  if(/\b(?:don't|dont|not|never|huwag|wag|ayaw|dili|indi|haan)\b/i.test(text.slice(0,first.end)))return {unknown:true,text};
  // After a text command, other command words may simply be the requested text.
  if(matches.length>1 && !TEXT.has(first.name))return {unknown:true,text};
  let args=READ.has(first.name)?'':text.slice(first.end).trim();
  if(first.name==='ai'){
    const action=args.match(/^(on|off|reset|status)\b/i)?.[1]?.toLowerCase();
    if(action&&commands?.has('assistant'))return {name:'assistant',args:action,cue:true};
    if(!addressed)return null;
  }
  if(TEXT.has(first.name))args=payload(args);
  if(first.name==='slot'){
    const amount=args.match(/(?:^|\s)(\d[\d,]*)(?=\s|$|[.!?])/);
    args=amount?amount[1].replace(/,/g,''):'';
  }
  const needs=!args?({discord:'text',music:'song',slot:'bet'}[first.name]):null;
  return {name:first.name,args,needs,confirm:first.name==='slot'||REVIEW.has(first.name)||Number(first.cmd.config?.hasPermssion||0)>0,cue:true};
}
function ship(route,event,ownID){
  if(route?.name!=='ship')return route;
  const mentioned=Object.keys(event.mentions||{}).filter(id=>String(id)!==String(ownID));
  const replied=event.type==='message_reply'&&event.messageReply?.senderID&&String(event.messageReply.senderID)!==String(ownID);
  return {...route,args:'',needs:mentioned.length||replied?null:'target',confirm:false};
}
module.exports={resolve,ship,payload};

'use strict';
const naturalEngine = require('./natural');
const cues = require('./cues');
const LEADS = [
  'please show me','please make me','can you make me','show me','show my','make me','create me',
  'gawan mo ako ng','gawan mo ko ng','gawan moko ng','gawan mo ako','gawan mo ko','gawan moko','pakita mo ang','ipakita ang','patingin ng','paki gawa ng','paki',
  'buhati ko og','buhati ko ug','buhati ko','ipakita akong','ipakita ang','palihog',
  'himui ako sang','himui ko sang','himui ko','ipakita akon','palihug',
  'aramidam man ti','aramidem ti','aramidem','ipakitam ti','pangngaasim'
].sort((a,b)=>b.length-a.length);
const BALANCE = /^(?:balance|balanse|kwarta|kuwarta|saldo|money|my balance|akong balanse|akon balanse|balanse ko|kwarta ko|kuwarta ko|saldok)$/i;
const TIME = /^(?:what(?:'s| is) the time|what time is it|time now|ano(?:ng| ang)? oras(?: na)?|anong oras na|unsa(?:ng| na)? oras(?: na)?|ano(?:ng)? oras subong|ania ti oras|mano ti oras)\??$/i;
function prefix(config) { return config?.PREFIX || '-'; }
function trackedReply(event, client) { return event.type==='message_reply' && client?.handleReply?.some(r=>String(r.messageID)===String(event.messageReply?.messageID)); }
function natural(body, config, commands, context={}) {
  const names=['chia','bot',String(config?.BOTNAME || '').trim()].filter(Boolean);
  const trimmed=body.trim();
  const name=names.find(n=>trimmed.toLowerCase().startsWith(n.toLowerCase()+' ') || trimmed.toLowerCase().startsWith(n.toLowerCase()+','));
  if (!name) return config?.smartGroups?.cueWithoutWake===false?null:cues.resolve(trimmed,commands,{...context,addressed:false});
  let text=trimmed.slice(name.length).replace(/^[\s,:]+/,'');
  const originalText=text;
  for (let i=0;i<3;i++) {
    const lead=LEADS.find(p=>text.toLowerCase().startsWith(p+' '));
    if (!lead) break; text=text.slice(lead.length).trim();
  }
  if (BALANCE.test(text)) return {name:'balance',args:''};
  if (TIME.test(text)) return {name:'assistant',args:'ask '+text};
  let [word,...rest]=text.split(/\s+/); word=(word || '').toLowerCase();
  if (word===prefix(config)) word='';
  if (word.startsWith(prefix(config))) word=word.slice(prefix(config).length);
  // Timed bans are routed only to the dedicated permission-checked command.
  if (['ban','ipagbawal','ibawal'].includes(word) && /\d+\s*(?:h|hr|hour|hours|oras|min|minutes|minuto|m|d|day|days|araw|aldaw|adlaw)\b/i.test(rest.join(' '))) return {name:'tempban',args:rest.join(' ')};
  const aliases={balanse:'balance',saldo:'balance',kwarta:'balance',kuwarta:'balance',buod:'catchup',dagup:'catchup',sumada:'catchup',personalidad:'personality'};
  word=aliases[word] || word;
  if (word==='ai' && ['on','off','status','reset'].includes((rest[0]||'').toLowerCase())) word='assistant';
  if (!commands?.has(word)) return cues.resolve(originalText,commands,{...context,addressed:true}) || naturalEngine.classify(originalText,commands) || naturalEngine.classify(text,commands) || {unknown:true,text:originalText};
  if(word==='discord' && /^(?:nga|naman|ako|mo|moko|with text|na may text|na nakasulat)\b/i.test(rest.join(' ')))return naturalEngine.enrich({name:word,args:cues.payload(rest.join(' '))});
  return naturalEngine.enrich({name:word,args:rest.join(' ')});
}
function rewrite(event, {config,client,settings,ownID,intent}) {
  if (!event || !['message','message_reply'].includes(event.type) || typeof event.body!=='string' || String(event.senderID)===String(ownID)) return event;
  const body=event.body.trim(), p=prefix(config);
  if(trackedReply(event,client)){
    const tracked=client.handleReply.find(r=>String(r.messageID)===String(event.messageReply?.messageID));
    const control=body.startsWith(p)?body.slice(p.length):body.startsWith('/')?body.slice(1):body;
    if(tracked?.name!=='ai'||!/^ai\s+(on|off|reset|status)$/i.test(control))return event;
  }
  const follow=intent?.consume(event);
  if(follow?.meta)return {...event,body:p+'smart __intent',_smartSynthetic:true,_smartIntent:follow.meta};
  if(follow?.route){
    if(!client?.commands?.has(follow.route.name))return {...event,body:p+'smart __intent',_smartSynthetic:true,_smartIntent:{action:'unknown',text:''}};
    const routePrefix=client.commands.get(follow.route.name)?.config?.usePrefix===false?'':p;
    // Use the original target/mentions, never the confirmation prompt as pay/reply target.
    return {...event,mentions:follow.source.mentions||{},messageReply:follow.source.messageReply,type:follow.source.type||'message',
      body:routePrefix+follow.route.name+(follow.route.args?' '+follow.route.args:''),_smartSynthetic:true};
  }
  const builtins=new Set(['mood','catchup','mentions','streak','personality','smart','assistant','tempban']);
  let route=null;
  if (body.startsWith(p) || body.startsWith('/')) {
    const lead=body.startsWith(p)?p:'/', parts=body.slice(lead.length).split(/\s+/), name=parts.shift().toLowerCase();
    if (name==='ai' && ['on','off','reset','status'].includes((parts[0]||'').toLowerCase())) route={name:'assistant',args:parts.join(' ')};
    else if (lead==='/' && builtins.has(name)) route={name,args:parts.join(' ')};
    else return event;
  } else if (client?.commands?.get(body.split(/\s+/)[0].toLowerCase())?.config?.usePrefix===false) return event;
  else if (/^start bot$/i.test(body)) return event;
  else route=natural(body,config,client?.commands,{event});
  route=cues.ship(route,event,ownID);
  if (route?.unknown) return {...event,body:p+'smart __intent',_smartSynthetic:true,_smartIntent:{action:'unknown',text:route.text}};
  if (route?.needs || route?.confirm || (route?.inferred && !naturalEngine.SAFE_AUTO.has(route.name))) {
    const source=route.name==='ship'?{mentions:Object.fromEntries(Object.entries(event.mentions||{}).filter(([id])=>String(id)!==String(ownID))),messageReply:event.messageReply,type:event.type}:undefined;
    return {...event,body:p+'smart __intent',_smartSynthetic:true,_smartIntent:{action:'suggest',route,source}};
  }
  if (route) {
    const cmd=client?.commands?.get(route.name);
    const requiredPrefix=cmd?.config?.usePrefix===false?'':p;
    const mentions=route.name==='ship'?Object.fromEntries(Object.entries(event.mentions||{}).filter(([id])=>String(id)!==String(ownID))):event.mentions;
    return {...event,mentions,body:requiredPrefix+route.name+(route.args?' '+route.args:''),_smartSynthetic:true};
  }
  if (settings?.ai && body) return {...event,body:p+'assistant ask '+body,_smartSynthetic:true,_smartAuto:true};
  return event;
}
module.exports={rewrite,natural,TIME,trackedReply};

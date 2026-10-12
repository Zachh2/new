'use strict';
const words = require('./natural-locales.json');
const SAFE_AUTO = new Set(['balance','help','mood','catchup','streak','ping','topexp','topmoney','work','daily']);
const NO_INFERENCE = /^(eval|shell|exec|npm|command|event|restart|update|shutdown|sendnoti|delete|setmoney|pay|kick|ban|adduser)$/i;
const normalize = s => String(s).normalize('NFKC').toLowerCase().replace(/[?!.,]+$/g,'').replace(/\s+/g,' ').trim();
const RULES = [
  ['balance', /^(?:how much (?:money|cash) do i have|what(?:'s| is) my balance|check my (?:balance|money)|magkano (?:na )?(?:ang )?(?:pera|balanse) ko|ilan (?:na )?(?:ang )?pera ko|patingin (?:ng )?pera ko|pila (?:na )?(?:akong|akon) (?:kwarta|balanse)|pila (?:ang )?kwarta ko|mano (?:ti )?(?:kuartak|kuwartak|saldok))$/],
  ['work', /^(?:i (?:want|need) to (?:earn|work)|earn (?:some )?money|find me work|gusto ko(?:ng)? (?:kumita|magtrabaho|yumaman)|kailangan ko (?:ng )?trabaho|gusto (?:ko )?mo(?:trabaho|kita)|gusto ko mag(?:trabaho|kita)|agtrabahoak|kayat ko (?:ti )?agtrabaho)$/],
  ['daily', /^(?:claim (?:my )?daily (?:reward|bonus)|collect (?:my )?daily|kunin (?:mo )?(?:ang )?(?:daily|araw araw na) (?:reward|bonus) ko|kunin ko daily reward|kuhaon (?:akong|akon) daily reward|alaen ti inaldaw a gunggona)$/],
  ['help', /^(?:what can you do|show (?:me )?(?:all )?(?:your )?commands|list (?:all )?commands|anong kaya mo|ano(?:ng)? (?:ang )?mga commands mo|ano pwede mong gawin|unsa imong mahimo|ano mahimo mo|ania ti mabalinmo nga aramiden)$/],
  ['catchup', /^(?:what did i miss|catch me up|summarize (?:the )?(?:chat|conversation)|ano(?:ng)? (?:ang )?namiss ko|ano nangyari (?:dito|sa gc)|ibuod (?:mo )?(?:ang )?usapan|unsa akong namiss|unsa nahitabo (?:diri|sa gc)|ano ang namiss ko|ano natabo (?:diri|sa gc)|ania ti napasamak)$/],
  ['mood', /^(?:how is (?:the )?(?:group|chat) (?:doing|feeling)|what(?:'s| is) (?:the )?group mood|kamusta (?:ang )?(?:mood|usapan|gc)|kumusta (?:ang )?(?:mood|usapan|gc)|unsa ang mood sa gc|ano ang mood sang gc|ania ti rikna ti grupo)$/],
  ['streak', /^(?:show my (?:activity )?streak|how long is my streak|ilang araw na streak ko|pila ka adlaw (?:akong|akon) streak|mano nga aldaw ti streak ko)$/],
  ['topmoney', /^(?:who (?:is|are) (?:the )?richest|sino (?:ang )?(?:pinakamayaman|mayaman)|kinsa ang pinakadato|sin o ang pinakamanggaranon|asino ti kababaknangan)$/],
  ['topexp', /^(?:show (?:the )?exp leaderboard|who has (?:the )?most exp|sino (?:ang )?pinakamataas (?:ang )?exp|kinsa pinakataas og exp|sin o ang pinakataas sang exp)$/]
];
function classify(text, commands) {
  const value = normalize(text);
  // Negative/compound requests are not guessed into a single action.
  if (/\b(?:not|don't|dont|never|huwag|wag|ayaw|indi|haan|then|tapos|pagkatapos)\b/.test(value)) return null;
  for (const [name, pattern] of RULES) if (commands?.has(name) && pattern.test(value)) return {name,args:'',inferred:true};
  let m=value.match(/^(?:i want to play slots?|play slots?|gusto ko(?:ng)? mag ?slot|mag ?slot ako|magsugal ako|gusto ko magduwa og slot|magduwa ko og slot|maghampang ko sang slot|agslotak)(?: (?:with|ng|og|sang|ti|gamit ang))?(?: ([\d,]+))?$/);
  if(m && commands?.has('slot'))return {name:'slot',args:m[1]?.replace(/,/g,'')||'',needs:m[1]?null:'bet',inferred:true,confirm:true};
  // Preserve payload spelling/case by capturing from the original text.
  m=text.match(/^(?:play(?: the song)?|patugtog(?: mo)?(?: ng)?|patugtugin(?: mo)?|paminawa|ipatukar|ipatugtog|ipatokar|patukara)(?:\s+(.+))?$/i);
  if(m && commands?.has('music'))return {name:'music',args:m[1]?.trim()||'',needs:m[1]?null:'song',inferred:true};
  m=text.match(/^(?:make (?:me )?(?:a )?discord (?:message|image)(?: (?:saying|with text))?|gawa(?:n)? (?:mo )?(?:ako|moko|ko)(?: ng)? discord(?: (?:na may|na nakasulat|na text))?|buhati ko(?: og)? discord|himui ko(?: sang)? discord|aramidem(?: ti)? discord)(?:\s+(.+))?$/i);
  if(m && commands?.has('discord'))return {name:'discord',args:m[1]?.trim()||'',needs:m[1]?null:'text',inferred:true};
  m=value.match(/^(?:change (?:the )?language to|palitan (?:mo )?(?:ang )?wika (?:sa|ng)|gawing|ilisan ang pinulongan sa|ilisan ang hambal sa|sukatan ti pagsasao iti) (english|tagalog|ilocano|iloko|cebuano|bisaya|hiligaynon|ilonggo|en|tl|ilo|ceb|hil)$/);
  if(m && commands?.has('language'))return {name:'language',args:({english:'en',tagalog:'tl',ilocano:'ilo',iloko:'ilo',cebuano:'ceb',bisaya:'ceb',hiligaynon:'hil',ilonggo:'hil'})[m[1]]||m[1],inferred:true,confirm:true};
  return null;
}
function enrich(route) {
  if(!route?.name || route.args?.trim())return route;
  const needs={discord:'text',music:'song',slot:'bet'}[route.name];
  return needs?{...route,needs}:route;
}
function create({now=Date.now,ask,configured=()=>false}) {
  const pending=new Map(), busy=new Set();
  let closed=false;
  const key=e=>String(e.threadID)+':'+String(e.senderID);
  function dict(lang){return words[lang]||words.en;}
  function prune(){for(const[k,p]of pending)if(p.until<=now())pending.delete(k);}
  function clear(){closed=true;pending.clear();}
  function consume(event) {
    prune(); const k=key(event), p=pending.get(k);
    if(!p || event.type!=='message_reply' || String(event.messageReply?.messageID)!==p.messageID)return null;
    const answer=String(event.body||'').trim();
    const freshMentions=event.mentions||{};
    const source={...p.source,mentions:{...(p.source.mentions||{}),...freshMentions}};
    let response=answer;
    for(const tag of Object.values(freshMentions))if(typeof tag==='string'&&tag)response=response.split(tag).join(' ');
    const value=normalize(response);
    if(/^(?:cancel|no|stop|hindi|wag|huwag|ayaw|dili|indi|haan|saan)$/i.test(value)) {
      pending.delete(k);return {meta:{action:'cancel'}};
    }
    if(p.stage==='fill') {
      if(p.route.needs==='target'){
        if(!Object.keys(freshMentions).length)return {meta:{action:'invalid'}};
        pending.delete(k);
        // A mention reply supplies a real target, not the bot's question sender.
        return {route:{...p.route,args:'',needs:null,confirm:false},source:{...source,type:'message',messageReply:undefined}};
      }
      if(!answer || answer.length>500 || /[\r\n\x00-\x1f]/.test(answer))return {meta:{action:'invalid'}};
      let args=answer;
      if(p.route.needs==='bet') {
        args=answer.replace(/,/g,'');
        if(!/^\d+$/.test(args)||!Number.isSafeInteger(Number(args))||Number(args)<=0)return {meta:{action:'invalid'}};
      }
      return {meta:{action:'suggest',route:{...p.route,args,needs:null,confirm:true},source}};
    }
    if(!/^(?:yes|confirm|go|ok|okay|oo|opo|sige|ituloy|wen|haan nga agduadua|oo gid|padayon)$/i.test(value))return {meta:{action:'invalid'}};
    pending.delete(k);
    return {route:p.route,source};
  }
  async function prompt(event, meta, {commands,config,language,send}) {
    if(closed)return;
    prune(); const d=dict(language), k=key(event), groupKey=String(event.threadID);
    if(meta.action==='cancel')return send(d.cancelled);
    if(meta.action==='invalid')return send(d.invalid);
    let route=meta.route, source=meta.source||{mentions:event.mentions||{},messageReply:event.messageReply,type:event.type};
    if(!route) {
      if(!configured() || config?.smartGroups?.naturalAI===false)return send(d.unknown);
      if(!String(meta.text||'').trim() || String(meta.text).length>400)return send(d.unknown);
      if(busy.has(groupKey))return send(d.busy);
      busy.add(groupKey);
      try {
        // Compact catalog covers registered names, never invented commands.
        const names=[...commands.keys()].filter(name=>!NO_INFERENCE.test(name)&&/^[a-z0-9_-]{1,40}$/i.test(name));
        const catalog=names.join(',');
        if(catalog.length>1000)return send(d.catalog);
        const instruction='Classify ONE bot request; do not execute it. Return ONLY JSON {"command":"registered-name","args":"exact arguments","clarify":false}. If unclear, negative, asks multiple actions, or missing required arguments, return {"clarify":true}. Do not invent target IDs, amounts or text. Available names: '+catalog+'. User request: '+JSON.stringify(String(meta.text||'').slice(0,400));
        const answer=await ask({question:instruction,history:[],language:'en',personality:'minimal'});
        if(closed)return;
        let parsed;
        try{parsed=JSON.parse(String(answer).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch(_){return send(d.unknown);}
        if(parsed.clarify!==false || typeof parsed.command!=='string' || !commands.has(parsed.command) || NO_INFERENCE.test(parsed.command) || typeof parsed.args!=='string' || parsed.args.length>500 || /[\r\n\x00-\x1f]/.test(parsed.args))return send(d.unknown);
        const ids=parsed.args.match(/\b\d{9,}\b/g)||[];
        if(ids.some(id=>!String(meta.text||'').includes(id)&&!Object.hasOwn(source.mentions||{},id)))return send(d.unknown);
        if(parsed.command==='ai' && /^(on|off|reset|status)$/i.test(parsed.args.trim()) && commands.has('assistant'))parsed.command='assistant';
        route=enrich({name:parsed.command,args:parsed.args.trim(),confirm:true,inferred:true});
      } catch (_) { return send(d.unavailable); }
      finally { busy.delete(groupKey); }
    }
    if(!commands.has(route.name))return send(d.missing);
    const stage=route.needs?'fill':'confirm';
    const prefix=commands.get(route.name)?.config?.usePrefix===false?'':(config?.PREFIX||'-');
    const preview=prefix+route.name+(route.args?' '+route.args:'');
    const body=stage==='fill'?d[route.needs]+'\n'+d.replyFill:d.confirm+'\n'+preview+'\n'+d.replyConfirm;
    const result=await send(body);
    if(result?.messageID){
      if(pending.size>=500)pending.delete(pending.keys().next().value);
      pending.set(k,{route,source,stage,messageID:String(result.messageID),until:now()+5*60000});
    }
  }
  return {consume,prompt,clear};
}
module.exports={classify,enrich,create,SAFE_AUTO};

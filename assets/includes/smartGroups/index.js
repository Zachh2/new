'use strict';
const path = require('path');
const { createStore } = require('./store');
const router = require('./router');
const ai = require('./ai');
const locales = require('./locales.json');
const streak = require('./streak');
const DAY=86400000, HOUR=3600000;
const DEFAULTS={ history:true, ai:false, personality:'chill', mentions:true, reminderMinutes:5 };
const positive=['thank','thanks','salamat','agyaman','nindot','maayo','mayo','congrats','happy','great','nice','love','masaya','galing','nasayaat','malipayon','maayong'];
const negative=['hate','stupid','idiot','shut up','bobo','tanga','away','galit','ulol','gago','lalis','buang','binais','gura','unget'];
const news=/announcement|reminder|deadline|meeting|schedule|important|paalala|anunsyo|mahalaga|palagip|pakaammo|pahinumdom|pahanumdom|importante|miting|due|tomorrow|bukas|inton bigat|ugma|bwas/i;
function dateKey(ms) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms)); }
function dayNumber(key) { return Date.parse(key+'T00:00:00Z')/DAY; }
function group(event) { return event.isGroup===true || (event.isGroup!==false && String(event.threadID)!==String(event.senderID)); }
function prune(data,now) {
  data.messages=data.messages.filter(m=>m.at>now-DAY).slice(-120);
  data.mentions=data.mentions.filter(m=>m.due>now-DAY).slice(-60);
  for(const [uid,c] of Object.entries(data.contexts)) if(c.at<now-HOUR) delete data.contexts[uid];
  for(const [uid,r] of Object.entries(data.streaks)) if(now-(r.at||0)>90*DAY) delete data.streaks[uid];
  for(const [uid,at] of Object.entries(data.seen)) if(at<now-30*DAY) delete data.seen[uid];
  for(const [uid,at] of Object.entries(data.catchup)) if(at<now-30*DAY) delete data.catchup[uid];
  for(const [uid,until] of Object.entries(data.bans)) if(until<=now) delete data.bans[uid];
}
function mood(messages,now) {
  const recent=messages.filter(m=>m.at>now-15*60000);
  if(!recent.length)return {state:'quiet',tone:'neutral',count:0};
  let good=0,bad=0;
  for(const m of recent){const words=String(m.body).toLowerCase().match(/[\p{L}']+/gu)||[];if(words.some(w=>positive.includes(w)))good++;if(words.some(w=>negative.includes(w)))bad++;}
  return {state:bad>=3&&bad/recent.length>=0.3?'argumentative':recent.length>=10?'active':'calm',tone:bad>good?'tense':good>bad?'positive':'neutral',count:recent.length};
}
function createRuntime({api,Users,Threads,state,i18n,store=createStore(),now=Date.now,ask=ai.ask,startTimer=true,streakEditDelay=1000}) {
  const busy=new Set(), lastAI=new Map(), notices=new Map(), pendingThreads=new Set();
  let timer=null,ticking=false,lastMaintenance=0,closed=false;
  const streakNotices=new Map();
  const streakData=require('./streakData').create({Users,legacy:store});
  const intent=require('./natural').create({now,ask,configured:()=>ai.available(global.config||{})});
  function settings(id){return {...DEFAULTS,...state.get(id).smartGroups};}
  function lang(id){const l=i18n.language(id);return locales[l]?l:'en';}
  function t(id,key){return locales[lang(id)][key] || locales.en[key] || key;}
  function styled(id,title,body){
    const style=settings(id).personality;
    if(style==='minimal')return `${title}\n${body}`;
    const icon={formal:'📋',funny:'😄',chill:'☕',gaming:'🎮',student:'📚'}[style]||'✨';
    return `╭┈ ❒ [ ${title} ${icon} ]\n${String(body).split('\n').map(x=>'├ '+x).join('\n')}\n╰┈━━━━━━━━━━━━`;
  }
  function send(event,title,body){
    return new Promise((resolve,reject)=>{
      let finished=false;
      const done=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(result);};
      const timer=setTimeout(()=>done(new Error('Message timeout')),12000);
      try{const out=api.sendMessage(styled(event.threadID,title,body),String(event.threadID),done,event.messageID);if(out?.then)out.then(r=>{if(r?.messageID)done(null,r);},done);}catch(e){done(e);}
    });
  }
  async function admin(event){
    const id=String(event.senderID);
    if((global.config?.ADMINBOT||[]).map(String).includes(id))return true;
    try{const info=await api.getThreadInfo(String(event.threadID));return !!info?.adminIDs?.some(a=>String(a.id)===id);}catch(_){return false;}
  }
  function change(id,patch){state.update(id,{smartGroups:{...settings(id),...patch}});}
  function prepare(event){
    if(!group(event))return event;
    return router.rewrite(event,{config:global.config,client:global.client,settings:settings(event.threadID),ownID:api.getCurrentUserID(),intent});
  }
  function isCommand(event){const p=global.config?.PREFIX||'-';const word=String(event.body||'').trim().split(/\s+/)[0].toLowerCase();return word.startsWith(p)||global.client?.commands?.get(word)?.config?.usePrefix===false;}
  async function blocked(event){
    if(!group(event)||!['message','message_reply'].includes(event.type)||!isCommand(event)||router.trackedReply(event,global.client))return false;
    const data=await store.snapshot(event.threadID), until=data.bans[String(event.senderID)];
    if(!(until>now()))return false;
    const key=event.threadID+':'+event.senderID;
    if(now()-(notices.get(key)||0)>=5000){notices.set(key,now());if(notices.size>1000)notices.delete(notices.keys().next().value);await send(event,t(event.threadID,'ban'),t(event.threadID,'banBlocked')+': '+require('../commandSpam').duration(until-now(),lang(event.threadID)));}
    return true;
  }
  async function observe(event,{command=false}={}){
    if(!group(event)||String(event.senderID)===String(api.getCurrentUserID()))return null;
    const tid=String(event.threadID),id=String(event.senderID),stamp=now(),cfg=settings(tid);
    if(event.type==='message_unsend'){
      await store.transaction(tid,d=>{d.messages=d.messages.filter(m=>m.id!==event.messageID);d.mentions=d.mentions.filter(m=>m.messageID!==event.messageID);});return null;
    }
    if(!['message','message_reply'].includes(event.type)||!/^\d+$/.test(id))return null;
    const observed=await store.transaction(tid,d=>{
      prune(d,stamp);
      if(event.messageID&&d.messages.some(m=>m.id===event.messageID))return {prior:d.seen[id]||0,transition:null};
      const prior=d.seen[id]||0;d.seen[id]=stamp;
      d.mentions=d.mentions.filter(m=>m.target!==id);
      const transition=null; // Daily streaks are credited by the accepted-command hook.
      const body=typeof event.body==='string'?event.body.trim():'';
      if(cfg.history&&body&&!command)d.messages.push({id:event.messageID,uid:id,at:stamp,body:body.slice(0,1500),mentions:Object.keys(event.mentions||{}).filter(x=>/^\d+$/.test(x)).slice(0,20)});
      d.messages=d.messages.slice(-120);
      if(cfg.mentions&&body&&!command){
        for(const [target,name] of Object.entries(event.mentions||{}).slice(0,10)){
          if(!/^\d+$/.test(target)||target===id||target===String(api.getCurrentUserID())||d.mentions.some(m=>m.target===target))continue;
          if(stamp-(d.reminded?.[target]||0)<HOUR)continue;
          d.mentions.push({target,name:String(name).slice(0,60),from:id,messageID:event.messageID,due:stamp+cfg.reminderMinutes*60000});pendingThreads.add(tid);
        }
      }
      return {prior,transition};
    });
    return observed.prior;
  }
  function queueStreak(event,transition){
    if(!transition||closed)return;
    const key=String(event.threadID)+':'+String(event.senderID);
    const pending=streakNotices.get(key)||Promise.resolve();
    const task=pending.then(()=>closed?undefined:notifyStreak(event,transition)).catch(error=>{
      console.warn('[streak] Notification unavailable; count is saved:',error?.code||'SEND_OR_EDIT_FAILED');
    }).finally(()=>{if(streakNotices.get(key)===task)streakNotices.delete(key);});
    streakNotices.set(key,task);
  }
  async function recordCommand(event,name){
    if(closed||!group(event)||String(event.senderID)===String(api.getCurrentUserID())||!/^\d+$/.test(String(event.senderID)))return;
    if(!['message','message_reply'].includes(event.type)||name==='streak'||event._smartAuto||event._smartIntent||(name==='smart'&&String(event.body).includes('__unknown')))return;
    const stamp=now();
    const transition=await streakData.transaction(String(event.threadID),String(event.senderID),d=>streak.advance(d,event,stamp,{command:true}));
    queueStreak(event,transition);
  }
  function streakBody(tid,record){
    const days=n=>lang(tid)==='en'&&n===1?'day':t(tid,'days');
    return `🔥 ${t(tid,'current')}: ${record.current} ${days(record.current)}\n🏆 ${t(tid,'best')}: ${record.best} ${days(record.best)}`;
  }
  async function notifyStreak(event,transition){
    const tid=String(event.threadID);
    const name=String(global.data?.userName?.get(String(event.senderID))||event.senderID).replace(/[\r\n]/g,' ').slice(0,80);
    const body=current=>name+'\n'+streakBody(tid,{current,best:transition.best})+(transition.recovered?'\n'+t(tid,'recoveryDone'):'');
    const info=await send(event,t(tid,'streak'),body(transition.previous));
    if(closed||!info?.messageID||typeof api.editMessage!=='function')return;
    await new Promise(resolve=>setTimeout(resolve,streakEditDelay));
    if(closed)return;
    // Capture the GC context even when this background notification outlives
    // the original incoming-message handler.
    const edit=()=>new Promise((resolve,reject)=>{
      let settled=false;
      const done=(err,result)=>{if(settled)return;settled=true;clearTimeout(timeout);err?reject(err):resolve(result);};
      const timeout=setTimeout(()=>done(Object.assign(new Error('Streak edit timed out'),{code:'EDIT_TIMEOUT'})),12000);
      try{const out=api.editMessage(styled(tid,t(tid,'streak'),body(transition.current)),info.messageID,done);if(out?.then)out.then(result=>{if(result!==undefined)done(null,result);},done);}catch(e){done(e);}
    });
    if(typeof i18n.run==='function')await i18n.run(tid,edit);else await edit();
  }
  async function tick(){
    if(ticking)return;ticking=true;
    try{
      if(now()-lastMaintenance>=HOUR){
        lastMaintenance=now();
        for(const id of await store.ids())await store.transaction(id,d=>prune(d,now()));
      }
      let remaining=5; // Global reminder budget per tick, across all groups.
      for(const tid of [...pendingThreads]){
        if(remaining<=0)break;
        if(!state.get(tid).started||!settings(tid).mentions){pendingThreads.delete(tid);await store.transaction(tid,d=>{d.mentions=[];});continue;}
        const snapshot=await store.snapshot(tid);
        if(!snapshot.mentions.length){pendingThreads.delete(tid);continue;}
        if(!snapshot.mentions.some(m=>m.due<=now()))continue;
        let info;try{info=await api.getThreadInfo(tid);}catch(_){continue;}
        const members=new Set((info?.participantIDs||[]).map(String));
        const due=await store.transaction(tid,d=>{
          const matches=d.mentions.filter(m=>m.due<=now()&&m.due>now()-DAY&&members.has(m.target));
          const chosen=matches.slice(0,remaining), targets=new Set(chosen.map(m=>m.target));
          d.mentions=d.mentions.filter(m=>m.due>now() || (members.has(m.target)&&!targets.has(m.target)&&m.due>now()-DAY));d.reminded ||= {};
          for(const m of chosen)d.reminded[m.target]=now();
          return chosen;
        });
        remaining-=due.length;
        for(const m of due){
          // Records were removed and persisted BEFORE sending: at most one attempt.
          const name=m.name.startsWith('@')?m.name:'@'+m.name;
          const body=styled(tid,t(tid,'mentions'),name+', '+t(tid,'reminder'));
          try{await new Promise((resolve,reject)=>{let done=false;const timer=setTimeout(()=>finish(new Error('Reminder timeout')),10000);function finish(err){if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve();}const out=api.sendMessage({body,mentions:[{id:m.target,tag:name}]},tid,finish,m.messageID);if(out?.then)out.then(()=>finish(),finish);});}catch(_){/* one attempt only; no retry flood */}
        }
      }
    }finally{ticking=false;}
  }
  async function init(){for(const id of await store.ids()){const d=await store.snapshot(id);if(d.mentions.length)pendingThreads.add(id);}}
  if(startTimer){init().catch(e=>console.error('[smart-groups] restore:',e.message));timer=setInterval(()=>tick().catch(e=>console.error('[smart-groups] reminders:',e.message)),15000);timer.unref?.();}
  async function resolveTarget(event,args){
    const tagged=Object.keys(event.mentions||{});
    if(tagged.length===1)return tagged[0];
    if(tagged.length>1)return null;
    const numeric=args.find(x=>/^\d{6,}$/.test(x));if(numeric)return numeric;
    const words=args.join(' ').replace(/\b(?:for|para|sa|iti|sulod|sang)\b/gi,'').replace(/\d+\s*(?:hours?|hrs?|h|oras|minutes?|mins?|m|minuto|days?|d|araw|aldaw|adlaw)\b/gi,'').trim().toLowerCase();
    const info=await api.getThreadInfo(String(event.threadID));
    const people=(info.userInfo||[]).filter(u=>String(u.name||'').toLowerCase()===words);
    return people.length===1?String(people[0].id):null;
  }
  function durationArg(args){const match=args.join(' ').match(/\b(\d+)\s*(hours?|hrs?|h|oras|minutes?|mins?|m|minuto|days?|d|araw|aldaw|adlaw)\b/i);if(!match)return 0;const ms=+match[1]*(/^(h|oras)/i.test(match[2])?HOUR:/^(d|araw|aldaw|adlaw)/i.test(match[2])?DAY:60000);return ms>=60000&&ms<=7*DAY?ms:0;}
  async function assistant(event,args){
    const tid=String(event.threadID),id=String(event.senderID),action=(args[0]||'').toLowerCase();
    if(['on','off'].includes(action)){
      if(!await admin(event))return send(event,t(tid,'assistant'),t(tid,'denied'));
      change(tid,{ai:action==='on'});if(action==='off')await store.transaction(tid,d=>{d.contextEpoch=(d.contextEpoch||0)+1;});return send(event,t(tid,'assistant'),t(tid,action==='on'?'aiOn':'aiOff'));
    }
    if(action==='status')return send(event,t(tid,'assistant'),t(tid,settings(tid).ai?'on':'off'));
    if(action==='reset'){await store.transaction(tid,d=>{delete d.contexts[id];d.contextRev ||= {};d.contextRev[id]=(d.contextRev[id]||0)+1;});return send(event,t(tid,'assistant'),t(tid,'cleared'));}
    const question=(action==='ask'?args.slice(1):args).join(' ').trim();
    if(!question)return send(event,t(tid,'assistant'),t(tid,'question'));
    if(router.TIME.test(question))return send(event,t(tid,'assistant'),t(tid,'clock')+': '+new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(now())));
    if(/^(?:gumawa ka nga ng caption|gawan mo ako ng caption|make (?:me )?a caption|buhati ko (?:og|ug) caption|himui ko sang caption|aramidem ti caption)[.!?]?$/i.test(question)){
      const answer=t(tid,'caption');
      await store.transaction(tid,d=>{const history=d.contexts[id]?.at>now()-HOUR?d.contexts[id].messages:[];d.contexts[id]={at:now(),messages:[...history,{role:'user',content:question},{role:'assistant',content:answer}].slice(-8)};});
      return send(event,t(tid,'assistant'),answer);
    }
    if(busy.has(tid)||now()-(lastAI.get(tid)||0)<2000){if(!event._smartAuto)return send(event,t(tid,'assistant'),t(tid,'busy'));return;}
    busy.add(tid);lastAI.set(tid,now());if(lastAI.size>1000)lastAI.delete(lastAI.keys().next().value);
    try{
      const d=await store.snapshot(tid),history=d.contexts[id]?.at>now()-HOUR?d.contexts[id].messages:[];
      const epoch=d.contextEpoch||0, rev=d.contextRev?.[id]||0;
      const answer=await ask({question,history,language:lang(tid),personality:settings(tid).personality});
      // Off/reset/clear while a request was running must not restore deleted memory or send a stale reply.
      if(event._smartAuto&&!settings(tid).ai)return;
      const kept=await store.transaction(tid,data=>{if((data.contextEpoch||0)!==epoch||(data.contextRev?.[id]||0)!==rev)return false;data.contexts[id]={at:now(),messages:[...history,{role:'user',content:question.slice(0,1500)},{role:'assistant',content:answer.slice(0,1500)}].slice(-8)};return true;});
      if(!kept)return;
      return send(event,t(tid,'assistant'),answer);
    }catch(error){return send(event,t(tid,'assistant'),t(tid,error.code==='AI_CONFIG'?'aiConfig':'aiFailure'));}
    finally{busy.delete(tid);}
  }
  async function command(name,{event,args=[]}){
    const tid=String(event.threadID),id=String(event.senderID);
    if(!group(event))return send(event,t(tid,'smart'),t(tid,'groupOnly'));
    if(name==='assistant')return assistant(event,args);
    if(name==='mood'){
      const d=await store.snapshot(tid),m=mood(d.messages,now());
      return send(event,t(tid,'mood'),`${t(tid,m.state)} • ${t(tid,m.tone)}\n${t(tid,'sample')}: ${m.count}\n${t(tid,'estimate')}`);
    }
    if(name==='catchup'){
      const d=await store.snapshot(tid),stamp=now();
      const hours=Number(args[0]);
      const since=Number.isFinite(hours)&&hours>0?stamp-Math.min(24,hours)*HOUR:Math.max(stamp-DAY,d.catchup[id]||0,event._smartPriorSeen||0);
      const list=d.messages.filter(m=>m.at>since&&m.at<stamp&&m.uid!==id),mentioned=list.filter(m=>m.mentions.includes(id));
      if(!list.length)return send(event,t(tid,'catchup'),t(tid,'noHistory')+'\n'+t(tid,'retained'));
      const scored=list.map(m=>({m,score:(news.test(m.body)?5:0)+(m.mentions.includes(id)?8:0)+(m.body.includes('?')?1:0)})).sort((a,b)=>b.score-a.score||b.m.at-a.m.at).slice(0,7).map(x=>x.m).sort((a,b)=>a.at-b.at);
      const line=m=>'• '+new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit'}).format(new Date(m.at))+' '+(global.data?.userName?.get(m.uid)||m.uid)+': '+m.body.replace(/\s+/g,' ').slice(0,180);
      let text=t(tid,'highlights')+'\n'+scored.map(line).join('\n');
      if(mentioned.length)text+='\n'+t(tid,'mentioned')+': '+mentioned.length+'\n'+mentioned.slice(-3).map(line).join('\n');
      await send(event,t(tid,'catchup'),text+'\n'+t(tid,'retained'));
      await store.transaction(tid,data=>{data.catchup[id]=stamp;});return;
    }
    if(name==='streak'){
      const action=String(args[0]||'').toLowerCase();
      if(action==='recover'){
        const result=await streakData.transaction(tid,id,d=>streak.recover(d,event,now()));
        if(result.error)return send(event,t(tid,'streak'),t(tid,result.error));
        queueStreak(event,result.transition);return;
      }
      const record=await streakData.read(tid,id),r=streak.view(record,now());
      const prefix=global.config?.PREFIX||'-';
      let text=streakBody(tid,r)+'\n'+t(tid,'recoveryRemaining')+': '+r.recoveryRemaining+'/2\n'+t(tid,'streakRule');
      if(r.canRecover)text+='\n'+t(tid,'recoveryAvailable')+' '+prefix+'streak recover';
      if(action)text+='\n'+prefix+'streak | '+prefix+'streak recover';
      return send(event,t(tid,'streak'),text);
    }
    if(name==='tempban'){
      if(!await admin(event))return send(event,t(tid,'ban'),t(tid,'denied'));
      const target=await resolveTarget(event,args),ms=durationArg(args);
      if(!target||!ms)return send(event,t(tid,'ban'),t(tid,'banUsage'));
      if([id,String(api.getCurrentUserID()),...(global.config?.ADMINBOT||[]).map(String)].includes(target))return send(event,t(tid,'ban'),t(tid,'banProtected'));
      const info=await api.getThreadInfo(tid);if(!info.participantIDs?.map(String).includes(target))return send(event,t(tid,'ban'),t(tid,'banUsage'));
      await store.transaction(tid,d=>{d.bans[target]=now()+ms;});return send(event,t(tid,'ban'),t(tid,'banSaved')+'\n'+target+' • '+require('../commandSpam').duration(ms,lang(tid)));
    }
    if(name==='personality'){
      const styles=Object.keys(ai.STYLES),wanted=(args[0]||'').toLowerCase();
      if(!wanted)return send(event,t(tid,'personality'),t(tid,'profiles')+'\n'+styles.join(' | ')+'\n'+t(tid,'profileScope'));
      if(!await admin(event))return send(event,t(tid,'personality'),t(tid,'denied'));
      if(!styles.includes(wanted))return send(event,t(tid,'personality'),t(tid,'badOption')+'\n'+styles.join(' | '));
      change(tid,{personality:wanted});return send(event,t(tid,'personality'),t(tid,'saved')+' • '+wanted);
    }
    if(name==='mentions'){
      if(!args.length)return send(event,t(tid,'mentions'),t(tid,settings(tid).mentions?'on':'off')+'\n'+t(tid,'delay')+': '+settings(tid).reminderMinutes);
      if(!await admin(event))return send(event,t(tid,'mentions'),t(tid,'denied'));
      const action=args[0].toLowerCase(),minutes=args[1]===undefined?settings(tid).reminderMinutes:Number(args[1]);
      if(!['on','off'].includes(action)||!Number.isInteger(minutes)||minutes<1||minutes>60)return send(event,t(tid,'mentions'),t(tid,'badOption')+'\nmentions on 5 | mentions off');
      change(tid,{mentions:action==='on',reminderMinutes:minutes});
      if(action==='off'){await store.transaction(tid,d=>{d.mentions=[];});pendingThreads.delete(tid);}
      return send(event,t(tid,'mentions'),t(tid,'saved'));
    }
    if(name==='smart'){
      if(args[0]==='__intent' && event._smartIntent)return intent.prompt(event,event._smartIntent,{
        commands:global.client.commands,config:global.config,language:lang(tid),send:body=>send(event,t(tid,'smart'),body)
      });
      if(args[0]==='__unknown')return send(event,t(tid,'smart'),t(tid,'unknownNatural'));
      if(args[0]==='history'&&['on','off','clear'].includes(args[1])){
        if(!await admin(event))return send(event,t(tid,'smart'),t(tid,'denied'));
        if(args[1]==='clear'||args[1]==='off')await store.transaction(tid,d=>{d.messages=[];d.contexts={};d.catchup={};d.contextEpoch=(d.contextEpoch||0)+1;});
        if(args[1]!=='clear')change(tid,{history:args[1]==='on'});
        return send(event,t(tid,'smart'),t(tid,args[1]==='clear'?'memoryClear':'saved'));
      }
      const p=global.config?.PREFIX||'-';
      return send(event,t(tid,'smart'),t(tid,'help')+':\n'+['mood','catchup [hours]','mentions on 5 | off','streak','personality formal|funny|chill|gaming|student|minimal','ai on | off | reset | status','assistant ask <message>','tempban @member 1h','smart history on | off | clear'].map(x=>p+x).join('\n')+'\n'+t(tid,'memory')+': '+t(tid,settings(tid).history?'on':'off'));
    }
  }
  return {prepare,observe,recordCommand,blocked,command,settings,tick,init,flushStreaks:()=>Promise.all([...streakNotices.values()]),close(){closed=true;if(timer)clearInterval(timer);intent.clear();},store};
}
let runtime;
function attach(deps){runtime?.close();runtime=createRuntime({...deps,state:require('../threadState'),i18n:require('../i18n')});return runtime;}
module.exports={attach,createRuntime,mood,dateKey,observeActivity:async event=>{if(!runtime)return null;return runtime.observe(event,{command:true});},run:async(name,ctx)=>{if(!runtime)throw new Error('Smart group listener is not initialized');return runtime.command(name,ctx);}};

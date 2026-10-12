'use strict';
const DAY=86400000, LIMIT=2;
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'});
const count=n=>Number.isSafeInteger(n)&&n>=0?n:0;
function dateKey(ms){const p=Object.fromEntries(formatter.formatToParts(new Date(ms)).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}`;}
function dayNumber(key){return /^\d{4}-\d{2}-\d{2}$/.test(String(key))?Date.parse(key+'T00:00:00Z')/DAY:NaN;}
function weekKey(stamp){const day=dayNumber(dateKey(stamp)),dow=new Date(day*DAY).getUTCDay();return new Date((day-(dow+6)%7)*DAY).toISOString().slice(0,10);}
function quota(r,stamp){const week=weekKey(stamp),saved=r.recovery||{};return {week,used:saved.week>=week?Math.min(LIMIT,count(saved.used)):0};}
function view(record={},stamp=Date.now()){
 const gap=dayNumber(dateKey(stamp))-dayNumber(record.day),expired=gap>1;
 const lost=expired?count(record.current):count(record.recoverable?.base),q=quota(record,stamp);
 return {current:expired?0:count(record.current),best:count(record.best),recoveryRemaining:LIMIT-q.used,canRecover:gap>=0&&lost>0,lost};
}
function eligible(event,stamp){
 if(!String(event.body||'').trim())return false;
 const timestamp=Number(event.timestamp);return !(Number.isFinite(timestamp)&&timestamp>0&&dateKey(timestamp)!==dateKey(stamp));
}
function transition(r,previous,event,stamp,recovered=false){const v=view(r,stamp);return {...v,previous,current:r.current,day:r.day,uid:String(event.senderID),tid:String(event.threadID),recovered};}
function advance(data,event,stamp,{command=false}={}){
 if(!command||!eligible(event,stamp))return null;
 const id=String(event.senderID),today=dateKey(stamp),r=data.streaks[id]||{current:0,best:0};
 const gap=dayNumber(today)-dayNumber(r.day);
 if(r.day===today||gap<0)return null;
 const previous=gap===1?count(r.current):0;
 if(gap>1&&count(r.current)>0)r.recoverable={base:count(r.current),lastDay:r.day};
 r.current=previous+1;r.best=Math.max(count(r.best),r.current);r.day=today;r.at=stamp;r.notifiedDay=today;
 data.streaks[id]=r;
 return transition(r,previous,event,stamp);
}
function recover(data,event,stamp){
 if(!eligible(event,stamp))return {error:'recoveryNothing'};
 const id=String(event.senderID),r=data.streaks[id];
 if(!r)return {error:'recoveryNothing'};
 const v=view(r,stamp),q=quota(r,stamp);
 if(!v.canRecover)return {error:'recoveryNothing'};
 if(q.used>=LIMIT)return {error:'recoveryLimit'};
 // Restore the last broken chain plus real participation since restarting it.
 // Skipped calendar days are NOT added to the count.
 r.current=v.lost+v.current+(r.day===dateKey(stamp)?0:1);
 r.best=Math.max(count(r.best),r.current);r.day=dateKey(stamp);r.at=stamp;r.notifiedDay=r.day;
 r.recovery={week:q.week,used:q.used+1};delete r.recoverable;data.streaks[id]=r;
 return {transition:transition(r,v.current,event,stamp,true)};
}
module.exports={dateKey,dayNumber,weekKey,view,advance,recover};

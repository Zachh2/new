'use strict';
const catalogue=require('./local-replies.json');
const labels={
  en:{hello:'Hello! What can I help you with?',thanks:'You are welcome!',unknown:"Local reply mode is on. I can help with greetings, jokes, encouragement, study tips, captions, simple math and Philippine time. I cannot answer every question or fetch live information. Try: chia help.",caption:'Here are a few simple captions for',lines:['A little moment worth keeping.','Making memories, one day at a time.','Keeping this one close.']},
  tl:{hello:'Kumusta! Ano ang maitutulong ko?',thanks:'Walang anuman!',unknown:"Local reply mode ito. Kaya kong bumati, magbiro, manghikayat, magbigay ng study tips at captions, magkuwenta at magsabi ng oras sa Pilipinas. Limitado ang sagot ko at wala akong live information. Subukan: chia help.",caption:'Narito ang ilang simpleng caption para sa',lines:['Munting sandali, magandang alaala.','Sulitin ang bawat araw.','Isa na namang alaalang iingatan.']},
  ilo:{hello:'Kumusta! Ania ti maitulongko?',thanks:'Awan aniaman!',unknown:"Lokal a sungbat daytoy. Mabalinak ti agkablaaw, agangaw, mangpabileg, mangted ti tips iti panagadal ken caption, agkuenta ken mangibaga ti oras iti Pilipinas. Limitado dagiti sungbatko; awan ti live information. Padasem: chia help.",caption:'Dagitoy dagiti simple a caption para iti',lines:['Bassit a kanito, napintas a lagip.','Tagipategen ti tunggal aldaw.','Maysa manen a lagip nga aywanan.']},
  ceb:{hello:'Kumusta! Unsay akong ikatabang?',thanks:'Walay sapayan!',unknown:"Lokal nga tubag ni. Makapangumusta ko, magkomedya, magdasig, mohatag og study tips ug captions, magkuwenta ug mosulti sa oras sa Pilipinas. Limitado akong tubag ug wala koy live information. Sulayi: chia help.",caption:'Aniay pipila ka simpleng caption para sa',lines:['Gamay nga higayon, nindot nga handumanan.','Pahimusli ang matag adlaw.','Usa na usab ka handumanang tipigan.']},
  hil:{hello:'Kumusta! Ano ang mabulig ko?',thanks:'Wala sing anuman!',unknown:"Lokal nga sabat ini. Makapangumusta ako, magkomedya, magdasig, maghatag sang study tips kag captions, magkuwenta kag magsugid sang oras sa Pilipinas. Limitado ang akon sabat kag wala ako live information. Tilawi: chia help.",caption:'Ari ang pila ka simple nga caption para sa',lines:['Gamay nga tion, matahom nga handumanan.','Pahimusli ang kada adlaw.','Isa naman ka handumanan nga tipigan.']}
};
function calculate(input){
  const m=String(input).trim().match(/^(?:what is |calculate |compute |magkano ang |pila ang )?(-?\d+(?:\.\d+)?)\s*([+*/x×÷-])\s*(-?\d+(?:\.\d+)?)[?]?$/i);
  if(!m)return null;
  const a=Number(m[1]),b=Number(m[3]),op=m[2];
  const result=op==='+'?a+b:op==='-'?a-b:/[x×*]/.test(op)?a*b:a/b;
  return Number.isFinite(result)?`${m[1]} ${op} ${m[3]} = ${Number(result.toPrecision(12))}`:null;
}
function answer(question,history=[],language='en'){
  const d=labels[language]||labels.en,q=String(question).trim();
  if(q.length>2000)return null;

  if(/^(?:hi|hello|hey|kumusta|kamusta|maayong adlaw|naimbag nga aldaw)[!.?]*$/i.test(q))return d.hello;
  const math=calculate(q);if(math)return math;
  let topic=q.match(/^(?:caption (?:for|about)|caption (?:para sa|tungkol sa)|caption (?:alang sa|para iti))\s+(.{1,120})$/i)?.[1];
  if(!topic && history.slice(-2).some(m=>m.role==='user'&&/^(?:gumawa ka nga ng caption|gawan mo ako ng caption|make (?:me )?a caption|buhati ko (?:og|ug) caption|himui ko sang caption|aramidem ti caption)[.!?]?$/i.test(m.content)) && q.length<=120)topic=q;
  const request=q.match(/^(?:(?:chia|bot)\s+)?(?:(?:gawan (?:mo ?(?:ako|ko)|moko)(?: nga)?(?: ng)?|gumawa ka(?: nga)?(?: ng)?|make(?: me)?(?: a)?|buhati ko (?:og|ug)|himui ko sang|aramidem ti)\s+)?caption(?:\s+(?:(?:for|about|para sa|tungkol sa|alang sa|para iti|about sa)\s+)?(.{1,120}))?[.!?]?$/i);
  if(!topic && request)topic=request[1]?.replace(/[.!?]+$/,'').trim();
  const previous=history.slice(-2).find(m=>m.role==='user');
  if(!topic && previous && /caption/i.test(previous.content) && /(?:topic|paksa|topiko)/i.test(history.at(-1)?.content||'') && q.length<=120)topic=q;
  if(topic){
    const category=require('./local-captions.json').find(c=>c.keywords.some(word=>(' '+normalize(topic)+' ').includes(' '+normalize(word)+' ')));
    const lines=category?(category.replies[language]||category.replies.en):d.lines;
    return `${d.caption} “${topic}”:\n${lines.map((line,i)=>`${i+1}. ${line}`).join('\n')}`;
  }
  if(request)return ({en:'What topic should the caption be about?',tl:'Anong paksa ng caption?',ilo:'Ania ti topiko ti caption?',ceb:'Unsay topic sa caption?',hil:'Ano ang topiko sang caption?'})[language]||'What topic should the caption be about?';
  const prepared=preparedReply(q,history,language);if(prepared)return prepared;
  return null;
}
function normalize(s){return String(s).normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
const compiled=catalogue.flatMap(item=>item.phrases.map(phrase=>({item,phrase:normalize(phrase)}))).sort((a,b)=>b.phrase.length-a.phrase.length);
function preparedReply(question,history,language){
  const normalized=normalize(question), padded=' '+normalized+' ';
  // Do not offer a canned response to a negated phrase or quote.
  if(/^(?:classify one bot request)/.test(normalized)||/["“”]/.test(question)||/\b(?:not|dont|dont|hindi|dili|indi|saan)\b/.test(normalized))return null;
  if(/^(?:what time is it|what is the time|anong oras na|ano oras na|unsa nay oras|unsa na orasa|ano na oras|ania ti oras)[ ?!.]*$/i.test(question)){
    return new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date())+' (Asia/Manila)';
  }
  if(/^(?:what date is it|what is the date|anong petsa ngayon|ano petsa subong|unsay petsa karon|ania ti petsa ita)[ ?!.]*$/i.test(question)){
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())+' (Asia/Manila)';
  }
  const percent=question.match(/^(?:calculate |compute |magkano ang |pila ang )?(-?\d+(?:\.\d+)?)\s*%\s*(?:of|sa|ti)\s*(-?\d+(?:\.\d+)?)[?]?$/i);
  if(percent){const value=Number(percent[1])*Number(percent[2])/100;if(Number.isFinite(value))return `${percent[1]}% × ${percent[2]} = ${Number(value.toPrecision(12))}`;}
  for(const {item,phrase} of compiled){
    if(!padded.includes(' '+phrase+' '))continue;
    if(item.id==='repeat'&&!history.slice(-4).some(m=>m.role==='assistant'&&/Wi-Fi|alarm/i.test(m.content)))continue;
    const options=item.replies[language]||item.replies.en;
    return options[0];
  }
  return null;
}
module.exports={answer,calculate,preparedReply,unavailable:lang=>(labels[lang]||labels.en).unknown};

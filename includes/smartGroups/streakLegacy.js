'use strict';
const fs=require('fs');
function createMigration(file){
  let loaded;
  async function records(){
    if(!loaded)loaded=(async()=>{
      if(!file)return {};
      try{
        const stat=await fs.promises.stat(file);
        if(stat.size>16*1024*1024)throw new Error('Legacy streak file exceeds 16 MiB');
        const raw=JSON.parse(await fs.promises.readFile(file,'utf8'));
        if(!raw||Array.isArray(raw)||typeof raw!=='object')throw new Error('Invalid legacy streak file');
        return raw;
      }catch(e){
        if(e.code==='ENOENT')return {};
        console.warn('[streak] Legacy usersData.json could not be imported; original preserved. Repair it and restart to retry.');
        return null; // A broken optional migration must not disable all commands.
      }
    })();
    return loaded;
  }
  return async function migrate(id,data){
    if(data.legacyStreakImported)return data;
    const old=await records(),prefix=String(id)+'_';
    if(old===null)return data;
    for(const [key,value] of Object.entries(old)){
      if(!key.startsWith(prefix)||!/^\d+$/.test(key.slice(prefix.length))||!value)continue;
      const {streak,lastActive,previousStreak}=value;
      if(!Number.isSafeInteger(streak)||streak<0||!/^\d{4}-\d{2}-\d{2}$/.test(String(lastActive)))continue;
      const at=Date.parse(lastActive+'T00:00:00+08:00');if(!Number.isFinite(at))continue;
      const uid=key.slice(prefix.length),current=data.streaks[uid];
      if(current?.day>lastActive||(current?.day===lastActive&&current.current>=streak))continue;
      data.streaks[uid]={current:streak,best:Math.max(streak,Number.isSafeInteger(previousStreak)?previousStreak:0,current?.best||0),day:lastActive,at,notifiedDay:lastActive};
    }
    data.legacyStreakImported=true;
    return data;
  };
}
module.exports={createMigration};

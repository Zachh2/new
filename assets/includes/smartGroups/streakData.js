'use strict';
// Canonical location: usersData.json -> userID -> streaks -> threadID.
// The existing Users writer preserves balances, EXP, bans and all other fields.
function create({Users,legacy}) {
  function requireUsers(){
    if(typeof Users?.getStreak!=='function'||typeof Users?.transactStreak!=='function')
      throw new Error('Streak storage requires the updated includes/database/users.js');
  }
  async function previous(tid,uid){
    requireUsers();
    if(Users.getStreak(uid,tid)!==undefined)return undefined;
    const saved=await legacy.snapshot(tid);
    const record=saved.streaks?.[uid];
    return record&&typeof record==='object'?JSON.parse(JSON.stringify(record)):undefined;
  }
  async function transaction(tid,uid,update){
    const imported=await previous(tid,uid);
    return Users.transactStreak(uid,tid,draft=>{
      // Re-check inside the synchronous commit: another command may have
      // migrated/updated this record while the old file was being read.
      const data={streaks:{}};
      if(draft.record!==undefined)data.streaks[uid]=draft.record;
      else if(imported!==undefined)data.streaks[uid]=imported;
      const result=update(data);
      draft.record=data.streaks[uid];
      return result;
    });
  }
  async function read(tid,uid){
    await transaction(tid,uid,()=>{});
    return Users.getStreak(uid,tid);
  }
  return {read,transaction};
}
module.exports={create};

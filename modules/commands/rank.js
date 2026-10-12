const fs = require("fs-extra");
const path = require("path");
const rankCard = require("./system/rankcard");

module.exports.config = {
 name: "rank",
 version: "1.0.0",
 hasPermssion: 0,
 credits: "CHIA BOT",
 description: "Show XP rank card",
 commandCategory: "economy",
 cooldowns: 5
};

module.exports.run = async function({api,event}) {
 const dataPath = path.join(__dirname,"..","..","includes/database/data/usersData.json");

 let data = {};
 try { data = JSON.parse(fs.readFileSync(dataPath)); } catch {}

 const user = data[event.senderID] || {level:1, exp:0};

 let name = "User";
 try {
   const info = await api.getUserInfo(event.senderID);
   name = info[event.senderID]?.name || "User";
 } catch {}

 let rank = "Novice";
 if(user.level >= 71) rank="Legend";
 else if(user.level >= 41) rank="Grandmaster";
 else if(user.level >= 21) rank="Master";
 else if(user.level >= 11) rank="Elite";
 else if(user.level >= 6) rank="Apprentice";

 const image = await rankCard.create({
   name,
   level:user.level,
   rank,
   exp:user.exp
 });

 api.sendMessage({
   attachment: await global.utils.getStreamFromURL(image)
 }, event.threadID);
};

const __l = require("../../includes/i18n");
const axios = require('axios');

module.exports.config = {
  name: "leave",
  eventType: ["log:unsubscribe"],
  version: "1.0.0",
  credits: "Mirai Team & Mod by Yan Maglinte",
  description: "Notifies bots or people leaving the group"
};

let backgrounds = [
  "https://files.catbox.moe/eeo4h4.jpg",
  "https://files.catbox.moe/1lqzh6.jpg",
  "https://files.catbox.moe/imvrl6.jpg",
  "https://files.catbox.moe/kis6q8.jpeg",
  "https://files.catbox.moe/zgudyk.jpeg"
];

module.exports.run = async function({ api, event, Users, Threads }) {
  const leftParticipantFbId = event.logMessageData.leftParticipantFbId;
  const name = global.data.userName.get(leftParticipantFbId) || await Users.getNameUser(leftParticipantFbId);
  const isKicked = event.author !== leftParticipantFbId;
  
  const action = isKicked ? __l.t("m1145") : __l.t("m1146");
  const status = isKicked ? __l.t("m1147") : __l.t("m1148");

  let threadInfo = await api.getThreadInfo(event.threadID);
  let members = threadInfo.participantIDs.length;
  let threadName = threadInfo.threadName || __l.t("m133");
  
  let randomBackground = backgrounds[Math.floor(Math.random() * backgrounds.length)];
  let avatarUrl = `https://graph.facebook.com/${leftParticipantFbId}/picture?height=720&width=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
  
  let apiUrl = `https://api.siputzx.my.id/api/canvas/goodbyev2?username=${encodeURIComponent(name)}&guildName=${encodeURIComponent(threadName)}&memberCount=${encodeURIComponent(members)}&avatar=${encodeURIComponent(avatarUrl)}&background=${encodeURIComponent(randomBackground)}`;

  let imgResponse = await axios({
    method: 'get',
    url: apiUrl,
    responseType: 'stream'
  });

  const formPush = {
    body: __l.t("m1149", [name, status, members]),
    attachment: imgResponse.data
  };

  return api.sendMessage(formPush, event.threadID);
};
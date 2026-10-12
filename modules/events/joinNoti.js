const __l = require("../../includes/i18n");
const axios = require("axios");

module.exports.config = {
  name: "join",
  eventType: ["log:subscribe"],
  version: "1.1.0",
  credits: "Mirai-Team (Modified by Jonell Hutchin Magallanes)",
  description: "GROUP UPDATE NOTIFICATION"
};

const ADMIN = global.config.OWNERNAME;
const FB_LINK = "";
let PRFX = `${global.config.PREFIX}`;
let suffix;

module.exports.run = async function ({ api, event, Users }) {
  const moment = require("moment-timezone");
  var thu = moment.tz("Asia/Manila").format("dddd");
  const time = moment.tz("Asia/Manila").format("HH:mm:ss - DD/MM/YYYY");
  var getHours = await global.client.getTime("hours");
  var session = `${getHours < 3 ? __l.t("m1133") : getHours < 8 ? __l.t("m1134") : getHours < 12 ? __l.t("m1135") : getHours < 17 ? __l.t("m1136") : getHours < 23 ? __l.t("m1137") : __l.t("m1133")}`;
  const { commands } = global.client;
  const { threadID } = event;
  let threadInfo = await api.getThreadInfo(event.threadID);
  let threadName = threadInfo.threadName;

  if (!event.logMessageData.addedParticipants || !Array.isArray(event.logMessageData.addedParticipants)) return;

  if (event.logMessageData.addedParticipants.some(i => i.userFbId == api.getCurrentUserID())) {
    let gifUrl = "https://files.catbox.moe/x1fl8w.gif";
    let gifResponse = await axios({
      method: 'get',
      url: gifUrl,
      responseType: 'stream'
    });
    
    await api.sendMessage(__l.t("m1138"), event.threadID);
    await api.sendMessage({
      body: __l.t("m1139", [threadName, session, commands.size, global.config.PREFIX, global.config.version, ADMIN, FB_LINK, PRFX, time, thu]),
      attachment: gifResponse.data
    }, threadID);
    
  } else {
    try {
      let { threadName, participantIDs } = await api.getThreadInfo(threadID);
      const threadData = global.data.threadData.get(parseInt(threadID)) || {};
      var mentions = [], nameArray = [], memLength = [], iduser = [], i = 0;
      var abx = [];

      for (id in event.logMessageData.addedParticipants) {
        const userName = event.logMessageData.addedParticipants[id].fullName;
        iduser.push(event.logMessageData.addedParticipants[id].userFbId.toString());
        nameArray.push(userName);
        mentions.push({ tag: userName, id: event.senderID });
        memLength.push(participantIDs.length - i++);
      }

      for (let o = 0; o < event.logMessageData.addedParticipants.length; o++) {
        const user = event.logMessageData.addedParticipants[o];
        const userName = user.fullName;
        const userID = user.userFbId;
        const number = participantIDs.length - o;
        
        if (number === 11 || number === 12 || number === 13) {
          suffix = "th";
        } else {
          const lastDigit = number % 10;
          switch (lastDigit) {
            case 1: suffix = "st"; break;
            case 2: suffix = "nd"; break;
            case 3: suffix = "rd"; break;
            default: suffix = "th"; break;
          }
        }

        var ok = [
          "https://files.catbox.moe/imvrl6.jpg",
          "https://files.catbox.moe/kis6q8.jpeg",
          "https://files.catbox.moe/1lqzh6.jpg",
          "https://files.catbox.moe/zgudyk.jpeg",
          "https://files.catbox.moe/eeo4h4.jpg"
        ];
        let background = ok[Math.floor(Math.random() * ok.length)];
        let avatar = `https://graph.facebook.com/${userID}/picture?height=720&width=720&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
        let apiUrl = `https://api.popcat.xyz/v2/welcomecard?background=${encodeURIComponent(background)}&text1=${encodeURIComponent(userName)}&text2=${encodeURIComponent(__l.t("m1140", [threadName]))}&text3=${encodeURIComponent(__l.t("m1141", [number, suffix]))}&avatar=${encodeURIComponent(avatar)}`;

        let imgResponse = await axios({
          method: 'get',
          url: apiUrl,
          responseType: 'stream'
        });
        abx.push(imgResponse.data);
      }

      memLength.sort((a, b) => a - b);
      var msg = (typeof threadData.customJoin == "undefined") ?
        __l.t("m1142", [suffix])
        : threadData.customJoin;

      var nameAuthor = await Users.getNameUser(event.author);
      msg = msg.replace(/\{iduser}/g, iduser.join(", "))
        .replace(/\{name}/g, nameArray.join(", "))
        .replace(/\{type}/g, (memLength.length > 1) ? "You" : "You")
        .replace(/\{soThanhVien}/g, memLength.join(", "))
        .replace(/\{threadName}/g, threadName)
        .replace(/\{author}/g, nameAuthor)
        .replace(/\{uidAuthor}/g, event.author)
        .replace(/\{buoi}/g, session)
        .replace(/\{time}/g, time)
        .replace(/\{thu}/g, thu);

      var formPush = { body: msg, attachment: abx, mentions };
      api.sendMessage(formPush, threadID);
    } catch (e) {
      return console.log(e);
    }
  }
};
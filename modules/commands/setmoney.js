const __l = require("../../includes/i18n");
module.exports.config = {
  name: "setmoney",
  version: "1.0.0",
  credits: "Zycke",
  hasPermssion: 2,
  description: "Set money or exp for user",
  usePrefix: true,
  commandCategory: "admin",
  cooldowns: 5,
  dependencies: { "fs-extra": "" }
};

module.exports.run = async function({ api, event, args }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ SETMONEY " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m814"));

  const fs = global.nodemodule["fs-extra"];
  const path = require("path");

  const { threadID, senderID } = event;
  const usersDataPath = path.join(__dirname, "..", "..", "includes", "database", "data", "usersData.json");

  if (!fs.existsSync(usersDataPath)) {
    return __edit(__l.t("m383"), __info);
  }

  let usersData = JSON.parse(fs.readFileSync(usersDataPath, 'utf8'));

  if (!args[0]) {
    return __edit(__l.t("m815"), __info);
  }

  let type = args[0].toLowerCase();
  let amount = parseInt(args[1]);
  let uid = null;

  if (type !== "money" && type !== "exp") {
    return __edit(__l.t("m816"), __info);
  }

  if (!amount || isNaN(amount) || amount < 0) {
    return __edit(__l.t("m817"), __info);
  }

  if (Object.keys(event.mentions).length > 0) {
    uid = Object.keys(event.mentions)[0];
  } else if (event.type == "message_reply") {
    uid = event.messageReply.senderID;
  } else if (args[2]) {
    uid = args[2];
  }

  if (!uid) {
    return __edit(__l.t("m818"), __info);
  }

  if (!usersData[uid]) {
    usersData[uid] = {
      userID: uid,
      money: 0,
      exp: 0,
      createTime: { timestamp: Date.now() },
      data: { timestamp: Date.now() },
      lastUpdate: Date.now()
    };
  }

  let oldValue = usersData[uid][type];
  usersData[uid][type] = amount;
  usersData[uid].lastUpdate = Date.now();

  fs.writeFileSync(usersDataPath, JSON.stringify(usersData, null, 4));

  let name = uid;
  let adminName = "Admin";
  
  try {
    let userInfo = await api.getUserInfo(uid);
    name = userInfo[uid].name;
  } catch (err) {
    name = uid;
  }

  try {
    let adminInfo = await api.getUserInfo(senderID);
    adminName = adminInfo[senderID].name;
  } catch (err) {
    adminName = "Admin";
  }

  return __edit(__l.t("m819", [type.toUpperCase(), name, type.toUpperCase(), oldValue, amount, adminName]), __info);
};
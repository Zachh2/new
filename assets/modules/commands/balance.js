const __l = require("../../includes/i18n");
module.exports.config = {
  name: "balance",
  version: "6.0.0",
  credits: "Zycke + ChatGPT",
  hasPermssion: 0,
  description: "Check balance",
  usePrefix: true,
  commandCategory: "economy",
  cooldowns: 2,
  dependencies: { "fs-extra": "" }
};

module.exports.run = async function ({ api, event }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ BALANCE " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m157"));

  const fs = global.nodemodule["fs-extra"];
  const path = require("path");

  const { threadID, senderID } = event;

  const dataPath = path.join(
    __dirname,
    "..",
    "..",
    "includes",
    "database",
    "data",
    "usersData.json"
  );

  // ✅ SAFE LOAD
  let data = {};
  try {
    if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
    data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch (e) {
    fs.writeFileSync(dataPath, "{}");
    data = {};
  }

  let uid = senderID;
  let isSelf = true;

  if (Object.keys(event.mentions).length > 0) {
    uid = Object.keys(event.mentions)[0];
    isSelf = false;
  } else if (event.type == "message_reply") {
    uid = event.messageReply.senderID;
    isSelf = false;
  }

  // ✅ FULL SAFE INIT (FIX BUG)
  if (!data[uid] || typeof data[uid] !== "object") {
    data[uid] = { money: 0, exp: 0, level: 1 };
  }

  if (typeof data[uid].money !== "number") data[uid].money = 0;

  // save fix if needed
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

  const money = data[uid].money;

  // format money
  const format = money.toLocaleString();

  // SELF
  if (isSelf) {
    return __edit(__l.t("m158", [format]), __info);
  }

  // OTHER USER
  let name = "User";
  try {
    const userInfo = await api.getUserInfo(uid);
    name = userInfo[uid]?.name || "User";
  } catch {}

  return __edit(__l.t("m159", [name, format]), __info);
};
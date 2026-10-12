const __l = require("../../includes/i18n");
module.exports.config = {
  name: "flip",
  version: "5.0.0",
  credits: "Zycke (10% Win + EXP)",
  hasPermssion: 0,
  description: "Flip coin (10% win + EXP)",
  usePrefix: true,
  commandCategory: "game",
  cooldowns: 20,
  dependencies: { "fs-extra": "" }
};

module.exports.run = async function({ api, event, args }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ FLIP " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m450"));

  const fs = global.nodemodule["fs-extra"];
  const path = require("path");

  const { threadID, senderID } = event;
  const file = path.join(__dirname, "..", "..", "includes", "database", "data", "usersData.json");

  if (!fs.existsSync(file)) 
    return __edit(__l.t("m451"), __info);

  let data = JSON.parse(fs.readFileSync(file, "utf8"));

  if (!data[senderID]) data[senderID] = { money: 0, exp: 0 };
  if (!data[senderID].exp) data[senderID].exp = 0;

  let choice = args[0]?.toLowerCase();
  let bet = parseInt(args[1]);

  if (!choice || !bet)
    return __edit(__l.t("m452"), __info);

  if (choice !== "heads" && choice !== "tails")
    return __edit(__l.t("m453"), __info);

  if (bet <= 0)
    return __edit(__l.t("m454"), __info);

  if ((data[senderID].money || 0) < bet)
    return __edit(__l.t("m455"), __info);

  // 💸 Deduct
  data[senderID].money -= bet;

  // 🎯 10% WIN SYSTEM
  let isWin = Math.random() < 0.1;

  let result;
  if (isWin) {
    result = choice;
  } else {
    result = choice === "heads" ? "tails" : "heads";
  }

  // 💰 Reward
  let reward = isWin ? bet * 3 : 0;
  data[senderID].money += reward;

  // ⭐ EXP
  let expGain = 0;
  if (isWin) {
    expGain = Math.floor(Math.random() * 100) + 1;
    data[senderID].exp += expGain;
  }

  fs.writeFileSync(file, JSON.stringify(data, null, 2));

  const format = n => n.toLocaleString();

  let display = isWin
    ? `+${format(reward - bet)}`
    : `-${format(bet)}`;

  let expText = isWin ? __l.t("m456", [expGain]) : "";

  return __edit(__l.t("m457", [choice, result, isWin ? "🎉 Win" : "❌ Lose", display, expText, format(data[senderID].money)]), __info);
};
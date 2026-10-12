const __l = require("../../includes/i18n");
module.exports.config = { 
  name: "rps",
  version: "7.0.0",
  credits: "Zycke (10% Win + EXP)",
  hasPermssion: 0,
  description: "Rock Paper Scissors (10% win + EXP)",
  usePrefix: true,
  commandCategory: "game",
  cooldowns: 20,
  dependencies: { "fs-extra": "" }
};

module.exports.run = async function({ api, event, args }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ RPS " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m797"));

  const fs = global.nodemodule["fs-extra"];
  const path = require("path");

  const { threadID, senderID } = event;
  const file = path.join(__dirname, "..", "..", "includes", "database", "data", "usersData.json");

  if (!fs.existsSync(file)) 
    return __edit(__l.t("m451"), __info);

  let data = JSON.parse(fs.readFileSync(file, "utf8"));

  if (!data[senderID]) data[senderID] = { money: 0, exp: 0 };
  if (!data[senderID].exp) data[senderID].exp = 0;

  let input = args.join(" ").trim();
  if (!input) 
    return __edit(__l.t("m798"), __info);

  let choice, bet;

  let match = input.match(/(✊|✌️|🖐️)\s*(\d+)/);
  if (match) {
    choice = match[1];
    bet = parseInt(match[2]);
  } else {
    choice = args[0];
    bet = parseInt(args[1]);
  }

  if (!bet || bet <= 0) 
    return __edit(__l.t("m454"), __info);

  if ((data[senderID].money || 0) < bet) 
    return __edit(__l.t("m455"), __info);

  const map = {
    "✊": "rock",
    "✌️": "scissors",
    "🖐️": "paper",
    "rock": "rock",
    "paper": "paper",
    "scissors": "scissors"
  };

  let user = map[choice?.toLowerCase()];
  if (!user) 
    return __edit(__l.t("m799"), __info);

  // 💸 Deduct bet
  data[senderID].money -= bet;

  // 🎯 10% WIN SYSTEM
  let isWin = Math.random() < 0.0;
  let isTie = false;
  let bot;

  if (isWin) {
    if (user === "rock") bot = "scissors";
    else if (user === "paper") bot = "rock";
    else bot = "paper";
  } else {
    if (Math.random() < 0.05) {
      bot = user;
      isTie = true;
    } else {
      if (user === "rock") bot = "paper";
      else if (user === "paper") bot = "scissors";
      else bot = "rock";
    }
  }

  // 💰 Reward
  let reward = isWin ? bet * 3 : isTie ? bet : 0;
  data[senderID].money += reward;

  // ⭐ EXP (1–100 random on win)
  let expGain = 0;
  if (isWin) {
    expGain = Math.floor(Math.random() * 100) + 1;
    data[senderID].exp += expGain;
  }

  fs.writeFileSync(file, JSON.stringify(data, null, 2));

  const format = n => n.toLocaleString();

  let display = isTie
    ? "±0"
    : isWin
    ? `+${format(reward - bet)}`
    : `-${format(bet)}`;

  const emoji = { rock:"✊", paper:"🖐️", scissors:"✌️" };

  let expText = isWin ? __l.t("m456", [expGain]) : "";

  return __edit(__l.t("m800", [emoji[user], emoji[bot], isTie ? "🤝 Tie" : isWin ? "🎉 Win" : "❌ Lose", display, expText, format(data[senderID].money)]), __info);
};
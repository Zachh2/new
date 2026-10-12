const __l = require("../../includes/i18n");
module.exports.config = { 
  name: "slot",
  version: "16.0.0",
  hasPermssion: 0,
  credits: "Zycke (Final System Fix)",
  description: "Slot (win = no deduct, lose = deduct)",
  usePrefix: true,
  commandCategory: "economy",
  usages: "[bet]",
  cooldowns: 20
};

module.exports.run = async function ({ api, event, args }) {
  const fs = require("fs-extra");
  const path = require("path");

  const { threadID, messageID, senderID } = event;
  const file = path.join(__dirname, "..", "..", "includes", "database", "data", "usersData.json");

  if (!global.slotLock) global.slotLock = {};
  if (global.slotLock[senderID]) {
    return api.sendMessage(__l.t("m869"), threadID);
  }
  global.slotLock[senderID] = true;

  try {
    if (!fs.existsSync(file)) {
      global.slotLock[senderID] = false;
      return api.sendMessage(__l.t("m451"), threadID);
    }

    let data = JSON.parse(fs.readFileSync(file, "utf8"));

    if (!data[senderID]) {
      data[senderID] = { money: 0, exp: 0, streak: 0 };
    }

    let user = data[senderID];
    let bet = parseInt(args[0]);

    if (!bet || bet <= 0) {
      global.slotLock[senderID] = false;
      return api.sendMessage(__l.t("m454"), threadID);
    }

    if ((user.money || 0) < bet) {
      global.slotLock[senderID] = false;
      return api.sendMessage(__l.t("m870", [user.money]), threadID);
    }

    const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, threadID, (e, i) => r(e ? null : i)));
    const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };
    const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ SLOT " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
    const edit = (t, i) => { const b = /[Ff]ail|[Ee]rror|[Uu]nable/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, threadID); else api.sendMessage(o, threadID, messageID); react(b ? "❌" : "✅"); };
    react("⏳");
    const info = await sendWait(__l.t("m872"));

    const symbols = ["🍒","🍋","🍉","💎","🍇"];

    let s1, s2, s3;
    let isWin = false;

    // 🎯 Win chance
    if (Math.random() < 0.0) {
      isWin = true;
      let sym = symbols[Math.floor(Math.random() * symbols.length)];
      s1 = s2 = s3 = sym;
    } else {
      do {
        s1 = symbols[Math.floor(Math.random() * symbols.length)];
        s2 = symbols[Math.floor(Math.random() * symbols.length)];
        s3 = symbols[Math.floor(Math.random() * symbols.length)];
      } while (s1 === s2 && s2 === s3);
    }

    // ✅ APPLY RESULT (YOUR SYSTEM)
    if (isWin) {
      user.money += bet * 2;   // 💰 +profit only
    } else {
      user.money -= bet;       // 💸 deduct only on lose
    }

    // prevent negative
    if (user.money < 0) user.money = 0;

    // save
    fs.writeFileSync(file, JSON.stringify(data, null, 2));

    const format = n => n.toLocaleString();

    let display = isWin
      ? `+${format(bet * 2)}`
      : `-${format(bet)}`;

    return edit(
__l.t("m873", [isWin ? "🎉" : "❌", s1, s2, s3, isWin ? "You Win" : "You Lose", display, format(user.money)]),
      info
    );

  } catch (e) {
    console.log(e);
    global.slotLock[senderID] = false;
    return api.sendMessage(__l.t("m876"), threadID);
  } finally {
    global.slotLock[senderID] = false;
  }
};
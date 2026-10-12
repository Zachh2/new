const __l = require("../../includes/i18n");
module.exports.config = {
  name: "discord",
  version: "1.4.0",
  hasPermssion: 0,
  credits: "Zycke",
  description: "Discord message generator",
  usePrefix: true,
  commandCategory: "edit-img",
  cooldowns: 5
};

module.exports.run = async function ({ api, event }) {
  const { threadID, messageID, senderID } = event;

  const fs = require("fs-extra");
  const path = require("path");
  const axios = require("axios");
  if (axios && axios.defaults) axios.defaults.timeout = axios.defaults.timeout || 30000; // no request may hang forever

  let uid = null;
  let mentionName = "";

  // ✅ MENTION LOOP
  for (const id in event.mentions) {
    uid = id;
    mentionName = event.mentions[id];
    break;
  }

  if (!uid) uid = senderID;

  // 🔥 REMOVE COMMAND NAME FROM TEXT
  let text = event.body.split(" ").slice(1).join(" ");

  // REMOVE MENTION NAME FROM TEXT
  if (mentionName) {
    text = text.replace(mentionName, "").trim();
  }

  // ❌ NO TEXT
  if (!text) {
    return api.sendMessage(
      __l.t("m394"),
      threadID,
      messageID
    );
  }

  const file = path.join(__dirname, "cache", `discord_${Date.now()}.png`);

  const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, threadID, (e, i) => r(e ? null : i), messageID));
  const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ DISCORD " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, threadID); else api.sendMessage(o, threadID, messageID); react(b ? "❌" : "✅"); };
  react("⏳");
  const info = await sendWait(__l.t("m396"));

  try {
    const userInfo = await api.getUserInfo(uid);
    const name = userInfo[uid].name;

    let avatarURL = userInfo[uid].thumbSrc;

    if (!avatarURL || avatarURL.includes("safe_image.php")) {
      avatarURL = `https://graph.facebook.com/${uid}/picture?width=512&height=512`;
    }

    const res = await axios.get(
      `https://api.popcat.xyz/v2/discord-message?username=${encodeURIComponent(name)}&content=${encodeURIComponent(text)}&avatar=${encodeURIComponent(avatarURL)}&color=%23ffcc99&timestamp=${encodeURIComponent(new Date().toISOString())}`,
      { responseType: "arraybuffer" }
    );

    fs.writeFileSync(file, res.data);

    edit(__l.t("m397"), info);

    return api.sendMessage(
      {
        attachment: fs.createReadStream(file)
      },
      threadID,
      () => fs.unlinkSync(file),
      messageID
    );

  } catch (err) {
    console.error("DISCORD ERROR:", err.message);

    if (fs.existsSync(file)) fs.unlinkSync(file);

    return edit(__l.t("m399"), info);
  }
};
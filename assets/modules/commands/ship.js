const __l = require("../../includes/i18n");
module.exports.config = {
  name: "ship",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Zycke",
  description: "Ship two users 💖",
  usePrefix: true,
  commandCategory: "fun",
  cooldowns: 5
};

module.exports.run = async function ({ api, event }) {
  const { threadID, messageID, senderID } = event;

  const fs = require("fs-extra");
  const path = require("path");
  const axios = require("axios");
  if (axios && axios.defaults) axios.defaults.timeout = axios.defaults.timeout || 30000; // no request may hang forever

  let uids = [];

  // ✅ GET ALL MENTIONS
  for (const id in event.mentions) {
    uids.push(id);
  }

  let user1, user2;

  // 🎯 LOGIC
  if (uids.length >= 2) {
    user1 = uids[0];
    user2 = uids[1];
  } else if (uids.length === 1) {
    user1 = senderID;
    user2 = uids[0];
  } else if (event.type === "message_reply") {
    user1 = senderID;
    user2 = event.messageReply.senderID;
  } else {
    return api.sendMessage(
      __l.t("m832"),
      threadID,
      messageID
    );
  }

  const file = path.join(__dirname, "cache", `ship_${Date.now()}.png`);

  const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, threadID, (e, i) => r(e ? null : i), messageID));
  const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ SHIP " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, threadID); else api.sendMessage(o, threadID, messageID); react(b ? "❌" : "✅"); };
  react("⏳");
  const info = await sendWait(__l.t("m834"));

  try {
    // 👤 GET USER INFO
    const userInfo = await api.getUserInfo([user1, user2]);

    let avatar1 = userInfo[user1].thumbSrc;
    let avatar2 = userInfo[user2].thumbSrc;

    // ⚠️ FIX FB BLOCK
    if (!avatar1 || avatar1.includes("safe_image.php")) {
      avatar1 = `https://graph.facebook.com/${user1}/picture?width=512&height=512`;
    }

    if (!avatar2 || avatar2.includes("safe_image.php")) {
      avatar2 = `https://graph.facebook.com/${user2}/picture?width=512&height=512`;
    }

    // 💖 POPCAT SHIP API
    const res = await axios.get(
      `https://api.popcat.xyz/v2/ship?user1=${encodeURIComponent(avatar1)}&user2=${encodeURIComponent(avatar2)}`,
      { responseType: "arraybuffer" }
    );

    fs.writeFileSync(file, res.data);

    edit(__l.t("m835"), info);

    return api.sendMessage(
      {
        attachment: fs.createReadStream(file)
      },
      threadID,
      () => fs.unlinkSync(file),
      messageID
    );

  } catch (err) {
    console.error("SHIP ERROR:", err.message);

    if (fs.existsSync(file)) fs.unlinkSync(file);

    return edit(__l.t("m837"), info);
  }
};
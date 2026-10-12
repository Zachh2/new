const __l = require("../../includes/i18n");
module.exports.config = {
  name: "blur",
  version: "5.2.0",
  hasPermssion: 0,
  credits: "Zycke",
  description: "Blur avatar (Popcat v2)",
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

  let uid;

  // ✅ MENTION LOOP (FIXED)
  for (const id in event.mentions) {
    uid = id;
    break;
  }

  if (!uid) {
    uid = event.type === "message_reply"
      ? event.messageReply.senderID
      : senderID;
  }

  const file = path.join(__dirname, "cache", `blur_${Date.now()}.png`);

  const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, threadID, (e, i) => r(e ? null : i), messageID));
  const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ BLUR " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, threadID); else api.sendMessage(o, threadID, messageID); react(b ? "❌" : "✅"); };
  react("⏳");
  const info = await sendWait(__l.t("m193"));

  try {
    const userInfo = await api.getUserInfo(uid);
    let avatarURL = userInfo[uid].thumbSrc;

    if (!avatarURL || avatarURL.includes("safe_image.php")) {
      avatarURL = `https://graph.facebook.com/${uid}/picture?width=512&height=512`;
    }

    const res = await axios.get(
      `https://api.popcat.xyz/v2/blur?image=${encodeURIComponent(avatarURL)}`,
      { responseType: "arraybuffer" }
    );

    fs.writeFileSync(file, res.data);

    edit(__l.t("m194"), info);

    return api.sendMessage(
      {
        attachment: fs.createReadStream(file)
      },
      threadID,
      () => fs.unlinkSync(file),
      messageID
    );

  } catch (err) {
    console.error("PBLUR ERROR:", err.message);
    edit(__l.t("m196"), info);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
};
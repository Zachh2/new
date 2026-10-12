const __l = require("../../includes/i18n");
module.exports.config = {
  name: "quote",
  version: "2.0.0",
  hasPermssion: 0,
  credits: "Zycke",
  description: "Generate quote image (HD fixed)",
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
  const FormData = require("form-data");

  let uid = null;
  let mentionName = "";

  // ✅ MENTION LOOP
  for (const id in event.mentions) {
    uid = id;
    mentionName = event.mentions[id];
    break;
  }

  // ✅ REPLY
  if (!uid && event.type === "message_reply") {
    uid = event.messageReply.senderID;
  }

  // ✅ SELF
  if (!uid) uid = senderID;

  // 🔥 TEXT FIX
  let text = event.body.split(" ").slice(1).join(" ");

  if (mentionName) {
    text = text.replace(mentionName, "").trim();
  }

  if (!text) {
    return api.sendMessage(
      __l.t("m774"),
      threadID,
      messageID
    );
  }

  const temp = path.join(__dirname, "cache", `avt_${Date.now()}.png`);
  const file = path.join(__dirname, "cache", `quote_${Date.now()}.png`);

  const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, threadID, (e, i) => r(e ? null : i), messageID));
  const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ QUOTE " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, threadID); else api.sendMessage(o, threadID, messageID); react(b ? "❌" : "✅"); };
  react("⏳");
  const info = await sendWait(__l.t("m776"));

  try {
    // 👤 USER INFO (PHUB STYLE)
    const userInfo = await api.getUserInfo(uid);
    const name = userInfo[uid].name;
    const avatarURL = userInfo[uid].thumbSrc;

    // 📥 DOWNLOAD AVATAR
    const avatar = (
      await axios.get(avatarURL, { responseType: "arraybuffer" })
    ).data;

    fs.writeFileSync(temp, avatar);

    // 📤 UPLOAD TO CATBOX
    const form = new FormData();
    form.append("fileToUpload", fs.createReadStream(temp));
    form.append("reqtype", "fileupload");

    const upload = await axios.post(
      "https://catbox.moe/user/api.php",
      form,
      { headers: form.getHeaders() }
    );

    const imageURL = upload.data.trim();

    if (!imageURL.startsWith("http")) {
      throw new Error(__l.t("m777"));
    }

    // 🎨 POPCAT QUOTE
    const res = await axios.get(
      `https://api.popcat.xyz/v2/quote?image=${encodeURIComponent(imageURL)}&text=${encodeURIComponent(text)}&name=${encodeURIComponent(name)}`,
      { responseType: "arraybuffer" }
    );

    fs.writeFileSync(file, res.data);

    // 🧹 CLEAN TEMP
    fs.unlinkSync(temp);

    edit(__l.t("m778"), info);

    return api.sendMessage(
      {
        attachment: fs.createReadStream(file)
      },
      threadID,
      () => fs.unlinkSync(file),
      messageID
    );

  } catch (err) {
    console.error("QUOTE ERROR:", err.message);

    if (fs.existsSync(temp)) fs.unlinkSync(temp);
    if (fs.existsSync(file)) fs.unlinkSync(file);

    return edit(__l.t("m780"), info);
  }
};
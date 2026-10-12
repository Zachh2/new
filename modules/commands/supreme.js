const __l = require("../../includes/i18n");
module.exports.config = {
  name: "supreme",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Zycke",
  description: "Generate Supreme logo",
  usePrefix: true,
  commandCategory: "edit-img",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;

  const fs = require("fs-extra");
  const path = require("path");
  const axios = require("axios");
  if (axios && axios.defaults) axios.defaults.timeout = axios.defaults.timeout || 30000; // no request may hang forever

  // ❌ NO TEXT
  if (!args[0]) {
    return api.sendMessage(
      __l.t("m898"),
      threadID,
      messageID
    );
  }

  const text = args.join(" ");
  const file = path.join(__dirname, "cache", `supreme_${Date.now()}.png`);

  const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, threadID, (e, i) => r(e ? null : i), messageID));
  const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ SUPREME " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, threadID); else api.sendMessage(o, threadID, messageID); react(b ? "❌" : "✅"); };
  react("⏳");
  const info = await sendWait(__l.t("m900"));

  try {
    // 🔥 POPCAT SUPREME
    const res = await axios.get(
      `https://api.popcat.xyz/v2/supreme?text=${encodeURIComponent(text)}`,
      { responseType: "arraybuffer" }
    );

    fs.writeFileSync(file, res.data);

    edit(__l.t("m901"), info);

    return api.sendMessage(
      {
        attachment: fs.createReadStream(file)
      },
      threadID,
      () => fs.unlinkSync(file),
      messageID
    );

  } catch (err) {
    console.error("SUPREME ERROR:", err.message);

    if (fs.existsSync(file)) fs.unlinkSync(file);

    return edit(__l.t("m903"), info);
  }
};
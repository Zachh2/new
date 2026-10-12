const __l = require("../../includes/i18n");
var dek = "Deku";

module.exports.config = {
  name: "catsay",
  version: "3.0.0",
  hasPermssion: 0,
  credits: `${dek} + Zycke fix`,
  description: "Cat says your message",
  usePrefix: true,
  commandCategory: "edit-img",
  usages: "text",
  cooldowns: 20
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;

  const fs = global.nodemodule["fs-extra"];
  const axios = require("axios");
  const path = require("path");

  const text = args.join(" ");

  if (!text) {
    return api.sendMessage(
__l.t("m255"),
      threadID,
      messageID
    );
  }

  const file = path.join(__dirname, "cache", `catsay_${Date.now()}.png`);

  const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, threadID, (e, i) => r(e ? null : i), messageID));
  const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ CATSAY " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, threadID); else api.sendMessage(o, threadID, messageID); react(b ? "❌" : "✅"); };
  react("⏳");
  const info = await sendWait(__l.t("m257"));

  try {
    const encoded = encodeURIComponent(text);

    // 🔥 REQUEST IMAGE
    const res = await axios.get(
      `https://cataas.com/cat/says/${encoded}?json=false`,
      {
        responseType: "arraybuffer",
        timeout: 10000
      }
    );

    // ❗ VALIDATE DATA
    if (!res || !res.data || res.data.length < 10) {
      throw new Error(__l.t("m258"));
    }

    // 💾 SAVE DIRECTLY (NO Buffer.from!)
    fs.writeFileSync(file, res.data);

    // ❗ CHECK FILE EXISTS
    if (!fs.existsSync(file)) {
      throw new Error(__l.t("m259"));
    }

    edit(
`╭┈ ❒ [ CATSAY 🐱 ]
╰┈➤ "${text}"`, info);

    return api.sendMessage(
      {
        attachment: fs.createReadStream(file)
      },
      threadID,
      () => fs.unlinkSync(file),
      messageID
    );

  } catch (e) {
    console.error("CATSAY ERROR:", e.message);

    return edit(
__l.t("m262"), info);
  }
};
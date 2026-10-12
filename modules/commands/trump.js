const __l = require("../../includes/i18n");
module.exports.config = {
  name: "trump",
  version: "3.0.0",
  hasPermssion: 0,
  credits: "omseks + Zycke fix",
  description: "Trump tweet generator",
  usePrefix: true,
  commandCategory: "edit-img",
  usages: "[text]",
  cooldowns: 10
};

module.exports.wrapText = async (ctx, text, maxWidth) => {
  const words = text.split(" ");
  const lines = [];
  let line = "";

  for (let word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(line.trim());
      line = word + " ";
    } else {
      line = test;
    }
  }

  if (line) lines.push(line.trim());
  return lines;
};

module.exports.run = async function({ api, event, args }) {
  const { threadID, messageID } = event;

  const fs = global.nodemodule["fs-extra"];
  const path = require("path");
  const { loadImage, createCanvas } = require("canvas");

  const text = args.join(" ");

  if (!text) {
    return api.sendMessage(
__l.t("m943"),
      threadID,
      messageID
    );
  }

  // 📁 LOCAL IMAGE (IMPORTANT FIX)
  const bgPath = path.join(__dirname, "cache", "trump_bg.png");

  // 🔥 AUTO DOWNLOAD ONLY ONCE
  if (!fs.existsSync(bgPath)) {
    const axios = require("axios");
    if (axios && axios.defaults) axios.defaults.timeout = axios.defaults.timeout || 30000; // no request may hang forever
    const data = (await axios.get(
      "https://i.imgur.com/7Wlr6nT.png",
      { responseType: "arraybuffer" }
    )).data;

    fs.writeFileSync(bgPath, data);
  }

  const file = path.join(__dirname, "cache", `trump_${Date.now()}.png`);

  const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, threadID, (e, i) => r(e ? null : i), messageID));
  const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ TRUMP " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, threadID); else api.sendMessage(o, threadID, messageID); react(b ? "❌" : "✅"); };
  react("⏳");
  const info = await sendWait(__l.t("m945"));

  try {
    const base = await loadImage(bgPath);
    const canvas = createCanvas(base.width, base.height);
    const ctx = canvas.getContext("2d");

    ctx.drawImage(base, 0, 0);

    ctx.fillStyle = "#000";
    ctx.font = "40px Arial";

    const lines = await module.exports.wrapText(ctx, text, 1000);

    let y = 160;
    for (let line of lines) {
      ctx.fillText(line, 60, y);
      y += 50;
    }

    fs.writeFileSync(file, canvas.toBuffer());

    edit(
__l.t("m947"), info);

    return api.sendMessage(
      {
        attachment: fs.createReadStream(file)
      },
      threadID,
      () => fs.unlinkSync(file),
      messageID
    );

  } catch (e) {
    console.error(e);
    return edit(
__l.t("m948"), info);
  }
};
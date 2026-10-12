const __l = require("../../includes/i18n");
const axios = require('axios');
if (axios && axios.defaults) axios.defaults.timeout = axios.defaults.timeout || 30000; // no request may hang forever

module.exports.config = {
  name: "poli",
  version: "1.0.",
  hasPermssion: 0,
  credits: "jameslim",
  description: "generate image from polination",
  usePrefix: true,
  commandCategory: "image",
  usages: "query",
  cooldowns: 2,
};

module.exports.run = async ({api, event, args }) => {
  let { threadID, messageID } = event;
  let query = args.join(" ");
  if (!query) return api.sendMessage(__l.t("m752"), threadID, messageID);

  const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, threadID, (e, i) => r(e ? null : i), messageID));
  const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ POLI " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, threadID); else api.sendMessage(o, threadID, messageID); react(b ? "❌" : "✅"); };
  react("⏳");
  const info = await sendWait(__l.t("m754"));

  try {
    // Get the image stream directly
    const imageResponse = await axios({
      method: 'get',
      url: `https://image.pollinations.ai/prompt/${query}`,
      responseType: 'stream'
    });

    edit(__l.t("m755"), info);

    await api.sendMessage({
      attachment: imageResponse.data
    }, threadID, messageID);

  } catch (error) {
    console.error('Poli command error:', error);
    edit(__l.t("m757"), info);
  }
};
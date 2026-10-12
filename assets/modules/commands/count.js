const __l = require("../../includes/i18n");
module.exports.config = {
  name: "count",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Blue & Yan Maglinte",
  description: "Counts the number of words, paragraphs, and alphanumeric characters in a given input string.",
  usePrefix: true,
  commandCategory: "utilities",
  usages: "count words, paragraphs, and alphanumerics [input]",
  cooldowns: 5,
  dependencies: {}
};

module.exports.run = async function ({ api, event, args }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ COUNT " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m364"));

  const inputStr = args.join(" ");
  const wordCount = inputStr.split(" ").length;
  const paragraphCount = (inputStr.match(/\n\n/g) || []).length + 1;
  const alphanumericCount = (inputStr.match(/[a-zA-Z0-9]/g) || []).length;

  __edit(__l.t("m365", [wordCount, paragraphCount, alphanumericCount]), __info);
};

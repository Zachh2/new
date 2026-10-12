const __l = require("../../includes/i18n");
module.exports.config = {
  name: "eval",
  version: "1.0.0",
  hasPermssion: 2,
  description: "Execute JavaScript code",
  usePrefix: true,
  commandCategory: "System",
  usages: "[code]",
  cooldowns: 0,
  credits: "Jonell Magallanes"
};

module.exports.run = async ({ api, event, args }) => {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ EVAL " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m444"));

  const code = args.join(" ");
  
  if (!code) {
    return __edit(__l.t("m445"), __info);
  }
  
  try {
    const result = await eval(`(async () => { ${code} })()`);
    const output = typeof result === "object" ? JSON.stringify(result, null, 2) : String(result);
    
    __edit(output || "undefined", __info);
  } catch (error) {
    __edit(error.message, __info);
  }
};
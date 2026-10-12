const __l = require("../../includes/i18n");
module.exports.config = {
  name: "button",
  version: "1.0.0",
  hasPermssion: 0,
  description: "Test button functionality",
  usePrefix: true,
  commandCategory: "System",
  usages: "",
  cooldowns: 5,
  credits: "Jonell Magallanes"
};

module.exports.run = async ({ api, event }) => {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ BUTTON " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m211"));

  try {
    const call_to_actions = "EUWjAH_Z.dO$qc0AJmHdbTiNO8skp5MvmN";
    const text = __l.t("m212");
    const threadID = event.threadID;
    const messageID = event.messageID;
    
    api.sendButtons(call_to_actions, text, threadID, messageID, (err, data) => {
      if (err) {
        console.error("Button error:", err);
        return __edit(err, __info);
      }
      
      if (data && data.action === "cta_buttons") {
        __edit(__l.t("m214"), __info);
      }
    });
  } catch (error) {
    console.error("Command error:", error);
    __edit(__l.t("m216", [error.message]), __info);
  }
};
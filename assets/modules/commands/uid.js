const __l = require("../../includes/i18n");
module.exports.config = {
  name: "uid",
  version: "1.0.0",
  hasPermission: 0,
  credits: "Mirai Team",
  description: "Get the user's Facebook UID.",
  usePrefix: true,
  commandCategory: "other",
  cooldowns: 5
};

module.exports.run = async function ({ api, event }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ UID " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m951"));

  if (Object.keys(event.mentions).length === 0) {
    if (event.messageReply) {
      const senderID = event.messageReply.senderID;
      return __edit(senderID, __info);
    } else {
      return __edit(`${event.senderID}`, __info);
    }
  } else {
    for (const mentionID in event.mentions) {
      const mentionName = event.mentions[mentionID];
      __edit(`${mentionName.replace('@', '')}: ${mentionID}`, __info);
    }
  }
};

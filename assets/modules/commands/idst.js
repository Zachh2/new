const __l = require("../../includes/i18n");
module.exports.config = {
  name: "idst",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Sam & Yan Maglinte", // Fix the issue that causes an error when it replies to a certain message. - Yan
  description: "Shows the ID information and description of a sticker",
  usePrefix: true,
  commandCategory: "message",
  usages: "[reply]",
  cooldowns: 5   
}

module.exports.run = async function ({ api, event, args }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ IDST " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m535"));

  if (event.type == "message_reply") {
    if (event.messageReply && event.messageReply.attachments && event.messageReply.attachments[0] && event.messageReply.attachments[0].type == "sticker") {
      return api.sendMessage({
        body: __l.t("m536", [event.messageReply.attachments[0].ID, event.messageReply.attachments[0].description])
      }, event.threadID)
    }
    else return __edit(__l.t("m537"), __info);
  }
  else if (args[0]) {
    return api.sendMessage({sticker: args[0]}, event.threadID);
  }
  else return __edit(__l.t("m537"), __info);
}

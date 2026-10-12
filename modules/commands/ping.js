const __l = require("../../includes/i18n");
module.exports.config = {
  name: "ping",
  version: "2.0.0",
  hasPermssion: 0,
  credits: "Mirai Team + Zycke fix",
  description: "Tag all members",
  usePrefix: true,
  commandCategory: "group",
  usages: "[text]",
  cooldowns: 1
};

module.exports.run = async function({ api, event, args }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ PING " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m733"));

  try {
    const { threadID, messageID, senderID, participantIDs } = event;

    const botID = api.getCurrentUserID();

    
    const listUser = participantIDs.filter(id => id != botID);

    let msgText = args.join(" ") || __l.t("m734");

    let mentions = [];
    let body = "";

    
    for (let i = 0; i < listUser.length; i++) {
      body += `‎${msgText}\n`;
      mentions.push({
        id: listUser[i],
        tag: "‎",
        fromIndex: body.length - msgText.length - 1
      });
    }

    // mentions can't survive an edit, so this stays a send; drop the placeholder
    __react("✅");
    if (__info) api.unsendMessage(__info.messageID);

    return api.sendMessage(
      {
        body:
__l.t("m735", [body]),
        mentions
      },
      threadID,
      messageID
    );

  } catch (e) {
    console.error(e);
    return __edit(__l.t("m736"), __info);
  }
};
const __l = require("../../includes/i18n");
module.exports.config = {
  name: "edit",
  version: "1.0",
  hasPermssion: 1,
  credits: 'Yan Maglinte',
  description: `Edit Bot's messages!`,
  usePrefix: true,
  commandCategory: 'message',
  usages: 'reply to a message then type <prefix>edit <your_message>',
  cooldowns: 5,
};

module.exports.run = async function({ api, event, args, box }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ EDIT " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m403"));

  if (!box) {
    return __edit(__l.t("m404"), __info);
  }
  const reply = event.messageReply?.body;
  const edit = `${args.join(" ")}`;
  
  if (!reply || !args || args.length === 0) {
    box.reply(__l.t("m405"));
    return;
  }

  try {
    await box.edit(`${edit}`, event.messageReply.messageID);
    box.react('✅');
  } catch (error) {
    console.error(__l.t("m406"), error);
    box.reply(__l.t("m407"));
  }
};

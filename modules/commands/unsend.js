const __l = require("../../includes/i18n");
module.exports.config = {
	name: "unsend",
	version: "1.0.1",
	hasPermssion: 0,
	credits: "Mirai Team",
	description: "Unsend bot's messages",
  usePrefix: true,
	commandCategory: "message",
	usages: "unsend",
	cooldowns: 0
};

module.exports.run = async function({ api, event, getText }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ UNSEND " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m960"));

	if (!event.messageReply) {
		return __edit(getText("missingReply"), __info);
	}

	if (event.messageReply.senderID != api.getCurrentUserID()) return __edit(getText("returnCant"), __info);
	
	api.unsendMessage(event.messageReply.messageID);
	__react("✅");
	if (__info) api.unsendMessage(__info.messageID);
	return;
}

module.exports.languages = {
	"en": {
		"returnCant": "Can't remove other people's messages.",
		"missingReply": "You can't unsend a message out of nowhere. Please reply to a message first."
	}
}

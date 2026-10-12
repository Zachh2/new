const __l = require("../../includes/i18n");
module.exports.config = {
	name: "getlink",
	version: "1.0.1",
	hasPermssion: 0,
	credits: "Mirai Team",
	description: "Get the URL Download from Video, Audio is sent from the group",
    usePrefix: false,
	commandCategory: "Tool",
	usages: "getLink",
	cooldowns: 5,
};

module.exports.languages = {
	"vi": {
		"invaidFormat": "❌ Tin nhắn bạn phản hồi phải là một audio, video, ảnh nào đó"
	},
	"en": {
		"invaidFormat": "❌ Your need reply a message have contain an audio, video or picture"
	}
}

module.exports.run = async ({ api, event, getText }) => {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ GETLINK " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m465"));

	if (event.type !== "message_reply") return __edit(getText("invaidFormat"), __info);
	if (!event.messageReply.attachments || event.messageReply.attachments.length == 0) return __edit(getText("invaidFormat"), __info);
	if (event.messageReply.attachments.length > 1) return __edit(getText("invaidFormat"), __info);
	return __edit(event.messageReply.attachments[0].url, __info);
}
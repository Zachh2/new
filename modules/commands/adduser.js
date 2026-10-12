const __l = require("../../includes/i18n");
module.exports.config = {
	name: "adduser",
	version: "1.0.1",
	hasPermssion: 0,
	credits: "Yan Maglinte",
	description: "Add user to group by id",
  usePrefix: true,
	commandCategory: "group",
	usages: "[args]",
	cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ ADDUSER " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m16"));

	const { threadID, messageID } = event;
	const botID = api.getCurrentUserID();
	const out = msg => __edit(msg, __info);
	var { participantIDs, approvalMode, adminIDs } = await api.getThreadInfo(threadID);
	var participantIDs = participantIDs.map(e => parseInt(e));
	if (!args[0]) return out(__l.t("m17"));
	if (!isNaN(args[0])) return adduser(args[0], undefined);
	else {
		try {
			var [id, name, fail] = await getUID(args[0], api);
			if (fail == true && id != null) return out(id);
			else if (fail == true && id == null) return out(__l.t("m18"))
			else {
				await adduser(id, name || __l.t("m19"));
			}
		} catch (e) {
			return out(`${e.name}: ${e.message}.`);
		}
	}

	async function adduser(id, name) {
		id = parseInt(id);
		if (participantIDs.includes(id)) return out(__l.t("m20", [name ? name : "Member"]));
		else {
			var admins = adminIDs.map(e => parseInt(e.id));
			try {
				await api.addUserToGroup(id, threadID);
			}
			catch {
				return out(__l.t("m21", [name ? name : "user"]));
			}
			if (approvalMode === true && !admins.includes(botID)) return out(__l.t("m22", [name ? name : "member"]));
			else return out(__l.t("m23", [name ? name : "member"]))
		}
	}
}
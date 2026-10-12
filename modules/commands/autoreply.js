const __l = require("../../includes/i18n");
module.exports.config = {
	name: "autorep",
	version: "1.0.0",
	hasPermssion: 0,
	credits: "CThanh",
	description: "create autorep for 1 message",
    usePrefix: true,
	commandCategory: "Group Chat",
	usages: "[autorep] => [text need autorep]",
	cooldowns: 12,
	dependencies: {
		"fs-extra": ""
	}
}

module.exports.onLoad = () => {
	const { existsSync, writeFileSync } = global.nodemodule["fs-extra"];
	if (!existsSync(__dirname + "/cache/autorep.json")) writeFileSync(__dirname + "/cache/autorep.json", JSON.stringify([]), 'utf-8');
	return;
}

module.exports.handleEvent = function({ api, event }) {
	const { readFileSync } = global.nodemodule["fs-extra"]; 
	if (event.type !== "message_unsend" && event.body.length !== -1) {
		const shortcut = JSON.parse(readFileSync(__dirname + "/cache/autorep.json"));
		if (shortcut.some(item => item.id == event.threadID)) {
			const getThread = shortcut.find(item => item.id == event.threadID).shorts;
			if (getThread.some(item => item.in == event.body)) {
				const shortOut = getThread.find(item => item.in == event.body).out;
				if (shortOut.indexOf(" | ") !== -1) {
					const arrayOut = shortOut.split(" | ");
					return api.sendMessage(`${arrayOut[Math.floor(Math.random() * arrayOut.length)]}`, event.threadID, event.messageID);
				}
				else return api.sendMessage(`${shortOut}`, event.threadID, event.messageID);
			}
		}
	}
}

module.exports.run = async function({ api, event, args }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ AUTOREP " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m136"));

	const { readFile, writeFile } = global.nodemodule["fs-extra"];
	var { threadID, messageID } = event;
	var content = args.join(" ");
	if (!content) return __edit(__l.t("m137"), __info);
	if (content.indexOf(`del`) == 0) {
		let delThis = content.slice(4, content.length);
		if (!delThis) return __edit(__l.t("m138"), __info);
		return readFile(__dirname + "/cache/autorep.json", "utf-8", (err, data) => {
			if (err) throw err;
			var oldData = JSON.parse(data);
			var getThread = oldData.find(item => item.id == threadID).shorts;
			if (!getThread.some(item => item.in == delThis)) return __edit(__l.t("m138"), __info);
			getThread.splice(getThread.findIndex(item => item.in === delThis), 1);
			writeFile(__dirname + "/cache/autorep.json", JSON.stringify(oldData), "utf-8", (err) => (err) ? console.error(err) : __edit(__l.t("m139"), __info));
		});
	}
	else if (content.indexOf(`all`) == 0)
		return readFile(__dirname + "/cache/autorep.json", "utf-8", (err, data) => {
			if (err) throw err;
			let allData = JSON.parse(data);
			let msg = '';
			if (!allData.some(item => item.id == threadID)) return __edit(__l.t("m140"), __info);
			if (allData.some(item => item.id == threadID)) {
				let getThread = allData.find(item => item.id == threadID).shorts;
				getThread.forEach(item => msg = '\n' + msg + item.in + ' -> ' + item.out);
			}
			if (!msg) return __edit(__l.t("m141"), __info);
			api.sendMessage(__l.t("m142") + msg, threadID, messageID +"🦄💜");
		});
	else {
		let narrow = content.indexOf(" => ");
		if (narrow == -1) return __edit(__l.t("m143"), __info);
		let shortin = content.slice(0, narrow);
		let shortout = content.slice(narrow + 4, content.length);
		if (shortin == shortout) return __edit(__l.t("m144"), __info);
		if (!shortin) return __edit(__l.t("m145"), __info);
		if (!shortout) return __edit(__l.t("m146"), __info);
		return readFile(__dirname + "/cache/autorep.json", "utf-8", (err, data) => {
			if (err) throw err;
			var oldData = JSON.parse(data);
			if (!oldData.some(item => item.id == threadID)) {
				let addThis = {
					id: threadID,
					shorts: []
				}
				addThis.shorts.push({ in: shortin, out: shortout });
				oldData.push(addThis);
				return writeFile(__dirname + "/cache/autorep.json", JSON.stringify(oldData), "utf-8", (err) => (err) ? console.error(err) : __edit(__l.t("m147"), __info));
			}
			else {
				let getShort = oldData.find(item => item.id == threadID);
				if (getShort.shorts.some(item => item.in == shortin)) {
					let index = getShort.shorts.indexOf(getShort.shorts.find(item => item.in == shortin));
					let output = getShort.shorts.find(item => item.in == shortin).out;
					getShort.shorts[index].out = output + " | " + shortout;
					__edit(__l.t("m148"), __info);
					return writeFile(__dirname + "/cache/autorep.json", JSON.stringify(oldData), "utf-8");
				}
				getShort.shorts.push({ in: shortin, out: shortout });
				return writeFile(__dirname + "/cache/autorep.json", JSON.stringify(oldData), "utf-8", (err) => (err) ? console.error(err) : __edit(__l.t("m147"), __info));
			}
		});
	}
    }
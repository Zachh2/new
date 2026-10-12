const __l = require("../../includes/i18n");
module.exports.config = {
	name: "user",
	version: "1.0.5",
	hasPermssion: 2,
	credits: "Mirai Team",
	description: "Ban or unblock users",
  usePrefix: true,
	commandCategory: "Admin",
	usages: "[unban/ban/search] [ID or text]",
	cooldowns: 5
};

module.exports.languages = {
	"en": {
		"reason": "Reason",
		"at": "At",
		"allCommand": "All commands",
		"commandList": "Commands",
		"banSuccess": "[ Ban User ] Banned user: %1",
		"unbanSuccess": "[ Unban User ] Unbanned user %1",
		"banCommandSuccess": "[ banCommand User ] Banned command with user: %1",
		"unbanCommandSuccess": "[ UnbanCommand User ] Unbanned command %1 with user: %2",
		"errorReponse": "%1 Can't do what you request",
		"IDNotFound": "%1 ID you import doesn't exist in database",
		"existBan": "[ Ban User ] User %1 has been banned before %2 %3",
		"notExistBan": "[ Unban User ] User hasn't been banned before",
		"missingCommandInput": "%1 You have to import the command you want to ban!",
		"notExistBanCommand": "[ UnbanCommand User ] User ID hasn't been banned before",

		"returnBan": "[ Ban User ] You are requesting to ban user:\n- User ID and name who you want to ban: %1%2\n\n❮ Reaction this message to complete ❯",
		"returnUnban": "[ Unban User ] You are requesting to unban user:\n- User ID and name who you want to ban: %1\n\n❮ Reaction this message to complete ❯",
		"returnBanCommand": "[ banCommand User ] You are requesting to ban command with user:\n - User ID and name who you want to ban: %1\n- Commands: %2\n\n❮ Reaction this message to complete ❯",
		"returnUnbanCommand": "[ UnbanCommand User ] You are requesting to unban command with user:\n - User ID and name: %1\n- Commands: %2\n\n❮ Reaction this message to complete ❯",
		"returnResult": "This is your result: \n",
		"returnNull": "There is no result with your input!",
		"returnList": "[ User List ]\There are %1 banned user, here are %2 user\n\n%3",
		"returnInfo": "[ Info User ] Here is some information about the user who you want to find:\n- User ID and name: %1n- Banned?: %2 %3 %4\n- Command banned?: %5"
	}
}

module.exports.handleReaction = async ({ event, api, Users, handleReaction, getText }) => {
	if (parseInt(event.userID) !== parseInt(handleReaction.author)) return;
	const moment = require("moment-timezone");
	const { threadID } = event;
	const { messageID, type, targetID, reason, commandNeedBan, nameTarget } = handleReaction;
	
	const time = moment.tz("Asia/Manila").format("HH:MM:ss L");
	global.client.handleReaction.splice(global.client.handleReaction.findIndex(item => item.messageID == messageID), 1);
	
	switch (type) {
		case "ban": {
			try {
				if(event.type == "message_reply") { targetID = event.messageReply.senderID }
				let data = (await Users.getData(targetID)).data || {};
				data.banned = true;
				data.reason = reason || null;
				data.dateAdded = time;
				await Users.setData(targetID, { data });
				global.data.userBanned.set(targetID, { reason: data.reason, dateAdded: data.dateAdded });
				return api.sendMessage(getText("banSuccess", `${targetID} - ${nameTarget}`), threadID, () => {
					return api.unsendMessage(messageID);
				});
			} catch { return api.sendMessage(getText("errorReponse", __l.t("m992")), threadID) };
		}

		case "unban": {
			try {
				if(event.type == "message_reply") { targetID = event.messageReply.senderID }
				let data = (await Users.getData(targetID)).data || {};
				data.banned = false;
				data.reason = null;
				data.dateAdded = null;
				await Users.setData(targetID, { data });
				global.data.userBanned.delete(targetID);
				return api.sendMessage(getText("unbanSuccess", `${targetID} - ${nameTarget}`), threadID, () => {
					return api.unsendMessage(messageID);
				});
			} catch { return api.sendMessage(getText("errorReponse", __l.t("m993")), threadID) };
		}

		case "banCommand": {
			try {	
				let data = (await Users.getData(targetID)).data || {};
				data.commandBanned = [...data.commandBanned || [], ...commandNeedBan];
				await Users.setData(targetID, { data });
				global.data.commandBanned.set(targetID, data.commandBanned);
				return api.sendMessage(getText("banCommandSuccess", `${targetID} - ${nameTarget}`), threadID, () => {
					return api.unsendMessage(messageID);
				});
			} catch (e) { return api.sendMessage(getText("errorReponse", __l.t("m994")), threadID) };
		}

		case "unbanCommand": {
			try {
				let data = (await Users.getData(targetID)).data || {};
				data.commandBanned = [...data.commandBanned.filter(item => !commandNeedBan.includes(item))];
				await Users.setData(targetID, { data });
				global.data.commandBanned.set(targetID, data.commandBanned);
				if(data.commandBanned.length == 0) global.data.commandBanned.delete(targetID)
				return api.sendMessage(getText("unbanCommandSuccess", ((data.commandBanned.length == 0) ? getText("allCommand") : `${getText("commandList")}: ${commandNeedBan.join(", ")}`), `${targetID} - ${nameTarget}`), threadID, () => {
					return api.unsendMessage(messageID);
				});
			} catch (e) { return api.sendMessage(getText("errorReponse", __l.t("m995")), threadID) };
		}
	}
}

module.exports.run = async ({ event, api, args, Users, getText }) => {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ USER " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m997"));

	const { threadID, messageID } = event;
	const type = args[0];
	var targetID = String(args[1]);
	var reason = (args.slice(2, args.length)).join(" ") || null;

	if (isNaN(targetID)) {
		const mention = Object.keys(event.mentions);
		args = args.join(" ");
		targetID = String(mention[0]);
		reason = (args.slice(args.indexOf(event.mentions[mention[0]]) + (event.mentions[mention[0]] || "").length + 1, args.length)) || null;
	}

	switch (type) {
		case "ban":
		case "-b": {
			if(event.type == "message_reply") { targetID = event.messageReply.senderID }
			if (!global.data.allUserID.includes(targetID)) return __edit(getText("IDNotFound", __l.t("m992")), __info);
			if (global.data.userBanned.has(targetID)) {
				const { reason, dateAdded } = global.data.userBanned.get(targetID) || {};
				return __edit(getText("existBan", targetID, ((reason) ? `${getText("reason")}: "${reason}"` : ""), ((dateAdded) ? `${getText("at")} ${dateAdded}` : "")), __info);
			}
			const nameTarget = global.data.userName.get(targetID) || await Users.getNameUser(targetID);
			return api.sendMessage(getText("returnBan", `${targetID} - ${nameTarget}`, ((reason) ? `\n- ${getText("reason")}: ${reason}` : "")), threadID, (error, info) => {
				global.client.handleReaction.push({
					type: "ban",
					targetID,
					reason,
					nameTarget,
					name: this.config.name,
					messageID: info.messageID,
					author: event.senderID,
					
				});
			}, messageID);
		}

		case "unban":
		case "-ub": {
			if(event.type == "message_reply") { targetID = event.messageReply.senderID }
			if (!global.data.allUserID.includes(targetID)) return __edit(getText("IDNotFound", __l.t("m993")), __info);
			if (!global.data.userBanned.has(targetID)) return __edit(getText("notExistBan"), __info);
			const nameTarget = global.data.userName.get(targetID) || await Users.getNameUser(targetID);
			return api.sendMessage(getText("returnUnban", `${targetID} - ${nameTarget}`), threadID, (error, info) => {
				global.client.handleReaction.push({
					type: "unban",
					targetID,
					nameTarget,
					name: this.config.name,
					messageID: info.messageID,
					author: event.senderID,
					
				});
			}, messageID);
		}

		case "search":
		case "-s": {
			const contentJoin = reason || "";
			const getUsers = (await Users.getAll(['userID', 'name'])).filter(item => !!item.name);
			var matchUsers = [], a = '', b = 0;
			getUsers.forEach(i => {
				if (i.name.toLowerCase().includes(contentJoin.toLowerCase())) {
					matchUsers.push({
						name: i.name,
						id: i.userID
					});
				}
			});
			matchUsers.forEach(i => a += `\n${b += 1}. ${i.name} - ${i.id}`);
			(matchUsers.length > 0) ? __edit(getText("returnResult", a), __info) : __edit(getText("returnNull"), __info);
			return;
		}
		
		case "banCommand":
		case "-bc": {
			if (!global.data.allUserID.includes(targetID)) return __edit(getText("IDNotFound", __l.t("m998")), __info);
			if (reason == null || reason.length == 0) return __edit(getText("missingCommandInput", __l.t("m998")), __info);
			if (reason == "all") {
				var allCommandName = [];
				const commandValues = global.client.commands.keys();
				for (const cmd of commandValues) allCommandName.push(cmd);
				reason = allCommandName.join(" ");
			}
			const commandNeedBan = reason.split(" ");
			const nameTarget = global.data.userName.get(targetID) || await Users.getNameUser(targetID);
			return api.sendMessage(getText("returnBanCommand", `${targetID} - ${nameTarget}`, ((commandNeedBan.length == global.client.commands.size) ? getText("allCommand") : commandNeedBan.join(", "))), threadID, (error, info) => {
				global.client.handleReaction.push({
					type: "banCommand",
					targetID,
					commandNeedBan,
					nameTarget,
					name: this.config.name,
					messageID: info.messageID,
					author: event.senderID,
					
				});
			}, messageID);
		}

		case "unbanCommand":
		case "-ubc": {
			if (!global.data.allUserID.includes(targetID)) return __edit(getText("IDNotFound", __l.t("m995")), __info);
			if (!global.data.commandBanned.has(targetID)) return __edit(getText("notExistBanCommand"), __info);
			if (reason == null || reason.length == 0) return __edit(getText("missingCommandInput", __l.t("m995")), __info);
			if (reason == "all") {
				reason = (global.data.commandBanned.get(targetID)).join(" ");
			}
			const commandNeedBan = reason.split(" ");
			const nameTarget = global.data.userName.get(targetID) || await Users.getNameUser(targetID);
			return api.sendMessage(getText("returnUnbanCommand", `${targetID} - ${nameTarget}`, ((commandNeedBan.length == global.data.commandBanned.get(targetID).length) ? getText("allCommand") : commandNeedBan.join(", "))), threadID, (error, info) => {
				global.client.handleReaction.push({
					type: "unbanCommand",
					targetID,
					commandNeedBan,
					nameTarget,
					name: this.config.name,
					messageID: info.messageID,
					author: event.senderID,
					
				});
			}, messageID);
		}

		case "list":
		case "-l": {
			var listBan = [], i = 0;
			const threadData = global.data.userBanned.keys();
			for (; ;) {
				let idUser = String(threadData.next().value);
				if (typeof idUser == "undefined") {
					const userName = (await Users.getData(idUser)).name || "unknown";
					listBan.push(`${i+=1}/ ${idUser} - ${userName}`);
				}
				if (i == global.data.userBanned.size || i == (parseInt(reason) || 10)) break;
			}
			return __edit(getText("returnList",(global.data.userBanned.size || 0), listBan.length, listBan.join("\n")), __info);
		}

		case "info":
		case "-i": {
			if(event.type == "message_reply") { targetID = event.messageReply.senderID }
			if (!global.data.allUserID.includes(targetID)) return __edit(getText("IDNotFound", __l.t("m999")), __info);
			if (global.data.commandBanned.has(targetID)) { var commandBanned = global.data.commandBanned.get(targetID) || [] };
			if (global.data.userBanned.has(targetID)) { var { reason, dateAdded } = global.data.userBanned.get(targetID) || {} };
			const nameTarget = global.data.userName.get(targetID) || await Users.getNameUser(targetID);
			return __edit(getText("returnInfo", `${targetID} - ${nameTarget}`, ((!dateAdded) ? __l.t("wordYes") : __l.t("wordNo")), ((reason) ? `${getText("reson")}: "${reason}"` : ""), ((dateAdded) ? `${getText("at")}: ${dateAdded}` : ""), ((commandBanned) ? __l.t("m1000", [(commandNeedBan.length == global.client.commands.size) ? getText("allCommand") : commandNeedBan.join(", ")]) : __l.t("wordNo"))), __info);
		}
	}
}

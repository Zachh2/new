const __l = require("../../includes/i18n");
module.exports.config = {
  name: "checktt",
  version: "1.0.1",
  hasPermssion: 0,
  credits: "D-Jukie",
  description: "Count messages",
  usePrefix: true,
  commandCategory: "message",
  usages: "[tag/reply/all/all number/all box]",
  cooldowns: 5,
};
module.exports.onLoad = function() {
    const { writeFileSync, existsSync } = require('fs-extra');
    const { resolve } = require("path");
    const pathA = require('path');
    const path = pathA.join(__dirname, 'cache', 'checktt.json');
    if (!existsSync(path)) {
        const obj = []
        writeFileSync(path, JSON.stringify(obj, null, 4));
    }
}
module.exports.handleEvent = async({ event, Users }) => {
    const { threadID, senderID, body } = event;
    const fs = require("fs");
    const pathA = require('path');
    const thread = require('./cache/checktt.json');
    const path = pathA.join(__dirname, 'cache', 'checktt.json');
    if(event.isGroup == false) return;
    function isIterable(obj) {
	  if (obj == null) {
	    return false;
	  }
	  return typeof obj[Symbol.iterator] === 'function';
	}
	
    if(isIterable(event.participantIDs) == false) return
    if(event.type == "message_reply") return;
    if (thread.some(i => i.threadID == threadID) == false) {
        const data = [];
        for (let user of event.participantIDs) {
            var name = (await Users.getData(user)).name;
            var id = user;
            var exp = 0;
            if(name != 'undefined' && name != 'Facebook users') {
                data.push({ name, id , exp })
            }
        }
        thread.push({ threadID, data: data });
        fs.writeFileSync(path, JSON.stringify(thread, null, 2));
    }
    else {
        var threadData = thread.find(i => i.threadID == threadID && i.threadID !== undefined)
        if (threadData.data.some(i => i.id == senderID) == false) {
            var name = (await Users.getData(senderID)).name;
            var id = senderID;
            var exp = 0;
            threadData.data.push({ name, id, exp });
            fs.writeFileSync(path, JSON.stringify(thread, null, 2));
        }
        else {
            var userData = threadData.data.find(i => i.id == senderID);
            userData.exp = userData.exp + 1;
            fs.writeFileSync(path, JSON.stringify(thread, null, 2));
        }
    }
}
module.exports.run = async function ({ args, api, event }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ CHECKTT " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m274"));

    const { threadID, senderID, messageID, type, mentions } = event;
    var mention = Object.keys(mentions);
    const thread = require('./cache/checktt.json');
    const data = thread.find(i => i.threadID == threadID)
    if (args[0] == "all") {
        var msg = "", exp = [], i = 1, count = 0
        for(const user of data.data) {
            exp.push({ name: user.name, exp: user.exp, id: user.id });
        }
        exp.sort(function (a, b) { return b.exp - a.exp });
        var limit = args[2] || 20;
        var page = 1;
            page = parseInt(args[1]) || 1;
            page < -1 ? page = 1 : "";
            var msg = "[====Interactions===]\n\n";
            var numPage = Math.ceil(exp.length/limit);
            for(var i = limit*(page - 1); i < limit*(page-1) + limit; i++){
                if(i >= exp.length) break;
                let dataInfo = exp[i];
                msg += __l.t("m275", [i+1, dataInfo.name, dataInfo.exp])
            }
            msg += __l.t("m276", [page, numPage, global.config.PREFIX])
            return __edit(msg, __info);
    }
    else 
        if(type == "message_reply") { mention[0] = event.messageReply.senderID }
        if (mention[0]) {
            var exp = [], count = 0
            for(const user of data.data) {
                count += user.exp
                exp.push({ name: user.name, exp: user.exp, id: user.id });
            }
            exp.sort(function (a, b) { return b.exp - a.exp });
            const rank = exp.findIndex(i => i.id == mention[0])
            return __edit(__l.t("m277", [exp[rank].name, rank + 1, exp[rank].exp, (exp[rank].exp/count*100).toFixed(0)]), __info);
        }
    else {
        var exp = [], count = 0
        for(const user of data.data) {
            count += user.exp
            exp.push({ name: user.name, exp: user.exp, id: user.id });
        }
        exp.sort(function (a, b) { return b.exp - a.exp });
        const rank = exp.findIndex(i => i.id == senderID);
        return __edit(__l.t("m278", [exp[rank].name, rank + 1, exp[rank].exp, (exp[rank].exp/count*100).toFixed(0)]), __info);
    }
}
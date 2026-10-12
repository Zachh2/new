const __l = require("../../includes/i18n");
const fs = require('fs');
const path = require('path');

const afkFilePath = path.join(__dirname, 'cache', 'afk.json');
let afkUsers = {};

if (fs.existsSync(afkFilePath)) {
    afkUsers = JSON.parse(fs.readFileSync(afkFilePath));
} else {
    fs.writeFileSync(afkFilePath, JSON.stringify(afkUsers));
}

module.exports.config = {
    name: "afk",
    version: "1.2.0",
    hasPermssion: 0,
    description: "Set or remove AFK status",
    usePrefix: true,
    hide: false,
    commandCategory: "Utility",
    usages: "[reason]",
    cooldowns: 2,
    credits: "Jonell Magallanes"
};

module.exports.handleEvent = async function ({ api, event }) {
    if (!event.isGroup || !event.body) return;

    const senderId = event.senderID.toString();

    if (afkUsers[senderId]) {
        delete afkUsers[senderId];
        updateAfkFile();
        api.sendMessage(
            __l.t("m47"),
            event.threadID,
            event.messageID
        );
        return;
    }

    if (event.mentions) {
        for (const uid of Object.keys(event.mentions)) {
            if (afkUsers[uid]) {
                const { reason, time } = afkUsers[uid];
                api.sendMessage(
                    __l.t("m48", [await getUserName(api, uid), reason, formatPHTime(time)]),
                    event.threadID,
                    event.messageID
                );
            }
        }
    }

    if (event.messageReply && afkUsers[event.messageReply.senderID]) {
        const repliedId = event.messageReply.senderID;
        const { reason, time } = afkUsers[repliedId];
        api.sendMessage(
            __l.t("m48", [await getUserName(api, repliedId), reason, formatPHTime(time)]),
            event.threadID,
            event.messageID
        );
    }
};

module.exports.run = async ({ api, event, args }) => {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ AFK " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m50"));

    const senderId = event.senderID.toString();
    const reason = args.length > 0 ? args.join(" ") : __l.t("m51");

    afkUsers[senderId] = {
        reason,
        time: Date.now()
    };
    updateAfkFile();

    __edit(__l.t("m52", [reason, formatPHTime(Date.now())]), __info);
};

function updateAfkFile() {
    fs.writeFileSync(afkFilePath, JSON.stringify(afkUsers, null, 2));
}

async function getUserName(api, uid) {
    const info = await api.getUserInfo(uid);
    return info[uid]?.name || "User";
}

function formatPHTime(timestamp) {
    return new Date(timestamp).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
}
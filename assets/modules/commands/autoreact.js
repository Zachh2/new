const __l = require("../../includes/i18n");
const fs = require('fs');
const path = require('path');

const reactFilePath = path.join(__dirname, 'cache', 'autoreact.json');
let autoReact = {};

if (fs.existsSync(reactFilePath)) {
    autoReact = JSON.parse(fs.readFileSync(reactFilePath));
} else {
    fs.writeFileSync(reactFilePath, JSON.stringify(autoReact));
}

module.exports.config = {
    name: "autoreact",
    version: "1.0.0",
    hasPermssion: 0,
    description: "Auto reaction system",
    usePrefix: true,
    hide: false,
    commandCategory: "Utility",
    usages: "[on/off]",
    cooldowns: 2,
    credits: "Jonell Magallanes"
};

module.exports.handleEvent = async function ({ api, event }) {
    if (event.type === "message_reaction") {
        if (!autoReact[event.threadID]) return;
        if (event.senderID === api.getCurrentUserID()) return;
        
        api.setMessageReaction(event.reaction, event.messageID, () => null, true);
    }
};

module.exports.run = async ({ api, event, args }) => {
    const __tid = event.threadID, __mid = event.messageID;
    const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
    const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
    const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ AUTOREACT " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
    const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
    __react("⏳");
    const __info = await __send(__l.t("m125"));

    const threadId = event.threadID;

    if (!args[0]) {
        const status = autoReact[threadId] ? __l.t("m126") : __l.t("m127");
        return __edit(__l.t("m128", [status]), __info);
    }

    if (args[0].toLowerCase() === "on") {
        autoReact[threadId] = true;
        updateReactFile();
        __edit(__l.t("m129"), __info);
    } else if (args[0].toLowerCase() === "off") {
        delete autoReact[threadId];
        updateReactFile();
        __edit(__l.t("m130"), __info);
    } else {
        __edit(__l.t("m131"), __info);
    }
};

function updateReactFile() {
    fs.writeFileSync(reactFilePath, JSON.stringify(autoReact, null, 2));
}
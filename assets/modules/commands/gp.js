const __l = require("../../includes/i18n");
const fs = require('fs-extra');

const path = require('path');

const PROTECTION_FILE = path.join(__dirname, '../database/antirobbery.json');

const loadProtectionData = () => {

    if (!fs.existsSync(PROTECTION_FILE)) {

        const dir = path.dirname(PROTECTION_FILE);

        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(PROTECTION_FILE, '{}', 'utf8');

        return {};

    }

    return JSON.parse(fs.readFileSync(PROTECTION_FILE, 'utf8'));

};

const saveProtectionData = (data) => {

    const dir = path.dirname(PROTECTION_FILE);

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(PROTECTION_FILE, JSON.stringify(data, null, 2), 'utf8');

};

module.exports.config = {

    name: "gp",

    version: "1.0.0",

    hasPermssion: 2,

    description: "Group Protection (anti-robbery, admin, name, and image guard)",

    usePrefix: true,

    hide: false,

    commandCategory: "System",

    usages: "/gp on | /gp off",

    cooldowns: 2,

    credits: "Jonell Magallanes"

};

module.exports.run = async ({ api, event, args }) => {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ GP " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m469"));


    const threadID = event.threadID;

    const protectionData = loadProtectionData();

    if (!protectionData[threadID]) protectionData[threadID] = {};

    const threadData = protectionData[threadID];

    const subCommand = args[0] ? args[0].toLowerCase() : "";

    if (subCommand === "on") {

        threadData.guard = true;

        saveProtectionData(protectionData);

        __edit(__l.t("m470"), __info);

    } else if (subCommand === "off") {

        threadData.guard = false;

        saveProtectionData(protectionData);

        __edit(__l.t("m471"), __info);

    } else if (subCommand === "status") {

        const status = threadData.guard ? __l.t("m472") : __l.t("m473");

        __edit(__l.t("m474", [status]), __info);

    } else {

        __edit(__l.t("m475"), __info);

    }

};
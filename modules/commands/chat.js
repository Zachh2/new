const __l = require("../../includes/i18n");
const fs = require('fs');
const path = require('path');

const chatFilePath = path.join(__dirname, '.../database/chatRestrict.json');

let chat = {};

if (!fs.existsSync(chatFilePath)) {
    const dir = path.dirname(chatFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(chatFilePath, JSON.stringify({}), 'utf8');
} else {
    chat = JSON.parse(fs.readFileSync(chatFilePath, 'utf8'));
}

module.exports.config = {
    name: "chat",
    version: "1.0.0",
    hasPermssion: 1,
    description: "Chat restriction for non-admins",
    usePrefix: true,
    hide: false,
    commandCategory: "System",
    usages: "/chat on | /chat off",
    cooldowns: 2,
    credits: "Jonell Magallanes"
};

module.exports.handleEvent = async function({ api, event, actions }) {
    const threadID = String(event.threadID);
    if (!chat[threadID]) return;

    const botID = api.getCurrentUserID();
    if (event.senderID === botID) return;

    const threadInfo = await api.getThreadInfo(threadID);
    const isAdmin = threadInfo.adminIDs.some(admin => admin.id === event.senderID);
    const isBotAdmin = threadInfo.adminIDs.some(admin => admin.id === botID);

    if (!isAdmin && isBotAdmin) {
        const id = event.senderID;
        const getInfo = global.getUser(id);
        const username = getInfo.name || __l.t("m265");
        await actions.kick(id);
        await actions.send(
            __l.t("m266", [username]),
            threadID
        );
    }
};

module.exports.run = async function({ api, event, actions, target }) {
    const threadID = String(event.threadID);
    const threadInfo = await api.getThreadInfo(threadID);
    const isAdmin = threadInfo.adminIDs.some(admin => admin.id === event.senderID);

    if (!isAdmin) {
        return actions.reply(
            __l.t("m267")
        );
    }

    const action = target[0]?.toLowerCase();

    if (action === 'off') {
        chat[threadID] = true;
        fs.writeFileSync(chatFilePath, JSON.stringify(chat, null, 2), 'utf8');
        return actions.reply(
            __l.t("m268")
        );
    } else if (action === 'on') {
        chat[threadID] = false;
        fs.writeFileSync(chatFilePath, JSON.stringify(chat, null, 2), 'utf8');
        return actions.reply(
            __l.t("m269")
        );
    } else {
        return actions.reply(
            __l.t("m270")
        );
    }
};
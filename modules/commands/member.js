const __l = require("../../includes/i18n");
const fs = require('fs');
const path = require('path');

const bannedUsersDir = path.join(__dirname, 'cache');
const warn = {};

if (!fs.existsSync(bannedUsersDir)) {
    fs.mkdirSync(bannedUsersDir, { recursive: true });
}

module.exports.config = {
    name: "member",
    version: "1.0.0",
    hasPermission: 2,
    description: "Manage group members",
    usePrefix: true,
    hide: true,
    commandCategory: "System",
    usages: "",
    cooldowns: 2,
    credits: "Jonell Magallanes"
};

module.exports.handleEvent = async function ({ api, event }) {
    const botId = api.getCurrentUserID();
    const threadId = event.threadID.toString();

    if (event.body && event.isGroup) {
        const userId = event.senderID.toString();
        const bannedUsersFilePath = path.join(bannedUsersDir, `${threadId}.json`);

        let bannedUsers = [];
        if (fs.existsSync(bannedUsersFilePath)) {
            bannedUsers = JSON.parse(fs.readFileSync(bannedUsersFilePath));
        }

        if (bannedUsers.includes(userId)) {
            try {
                api.removeUserFromGroup(userId, threadId);
                const userInfo = await api.getUserInfo(userId);
                const userName = userInfo[userId].name;
                api.sendMessage(__l.t("m579", [userName]), threadId);
            } catch (error) {
                console.error(`Failed to handle banned user removal: ${error}`);
            }
        }
    }

    if (event.logMessageType === 'log:subscribe' && event.logMessageData.addedParticipants.some(participant => participant.userFbId)) {
        const addedUserId = event.logMessageData.addedParticipants[0].userFbId.toString();
        const adderUserId = event.author.toString();
        const bannedUsersFilePath = path.join(bannedUsersDir, `${threadId}.json`);

        let bannedUsers = [];
        if (fs.existsSync(bannedUsersFilePath)) {
            bannedUsers = JSON.parse(fs.readFileSync(bannedUsersFilePath));
        }

        if (bannedUsers.includes(addedUserId)) {
            try {
                api.removeUserFromGroup(addedUserId, threadId);
                const addedUserInfo = await api.getUserInfo(addedUserId);
                const addedUserName = addedUserInfo[addedUserId].name;
                api.sendMessage(__l.t("m579", [addedUserName]), threadId);

                if (!warn[adderUserId]) {
                    warn[adderUserId] = 1;
                    const adderUserInfo = await api.getUserInfo(adderUserId);
                    const adderUserName = adderUserInfo[adderUserId].name;
                    api.sendMessage(__l.t("m581", [adderUserName]), threadId);
                } else {
                    warn[adderUserId]++;
                    if (warn[adderUserId] >= 2) {
                        api.removeUserFromGroup(adderUserId, threadId);
                        const adderUserInfo = await api.getUserInfo(adderUserId);
                        const adderUserName = adderUserInfo[adderUserId].name;
                        api.sendMessage(__l.t("m582", [adderUserName]), threadId);
                    } else {
                        const adderUserInfo = await api.getUserInfo(adderUserId);
                        const adderUserName = adderUserInfo[adderUserId].name;
                        api.sendMessage(__l.t("m583", [adderUserName]), threadId);
                    }
                }
            } catch (error) {
                console.error(`Failed to handle user re-addition: ${error}`);
            }
        }
    }
};

module.exports.run = async ({ api, event, args }) => {
    const __tid = event.threadID, __mid = event.messageID;
    const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
    const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
    const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ MEMBER " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
    const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
    __react("⏳");
    const __info = await __send(__l.t("m586"));

    const botId = api.getCurrentUserID();
    const threadId = event.threadID.toString();

    // Check admin privileges directly within this function
    try {
        const threadInfo = await api.getThreadInfo(threadId);
        const adminIds = threadInfo.adminIDs.map(admin => admin.id);
        if (!adminIds.includes(botId)) {
            __edit(__l.t("m587"), __info);
            return;
        }
    } catch (error) {
        console.error(`Failed to check admin privileges: ${error}`);
        __edit(__l.t("m589"), __info);
        return;
    }

    const command = args[0];
    const bannedUsersFilePath = path.join(bannedUsersDir, `${threadId}.json`);

    let bannedUsers = [];
    if (fs.existsSync(bannedUsersFilePath)) {
        bannedUsers = JSON.parse(fs.readFileSync(bannedUsersFilePath));
    }

    if (command === 'ban') {
        const userId = Object.keys(event.mentions)[0] || args[1];
        if (userId) {
            if (!bannedUsers.includes(userId)) {
                bannedUsers.push(userId);
                updateBannedUsersFile(bannedUsers, bannedUsersFilePath);
                try {
                    api.removeUserFromGroup(userId, threadId);
                    const userInfo = await api.getUserInfo(userId);
                    const userName = userInfo[userId].name;
                    __edit(__l.t("m590", [userName]), __info);
                } catch (error) {
                    console.error(__l.t("m591", [error]));
                }
            } else {
                try {
                    const userInfo = await api.getUserInfo(userId);
                    const userName = userInfo[userId].name;
                    __edit(__l.t("m592", [userName]), __info);
                } catch (error) {
                    console.error(__l.t("m593", [error]));
                }
            }
        } else {
            __edit(__l.t("m594"), __info);
        }
    } else if (command === 'unban') {
        const userId = Object.keys(event.mentions)[0] || args[1];
        if (userId) {
            const index = bannedUsers.findIndex(ban => ban === userId);
            if (index !== -1) {
                bannedUsers.splice(index, 1);
                updateBannedUsersFile(bannedUsers, bannedUsersFilePath);
                try {
                    const userInfo = await api.getUserInfo(userId);
                    const userName = userInfo[userId].name;
                    __edit(__l.t("m595", [userName]), __info);
                } catch (error) {
                    console.error(__l.t("m596", [error]));
                }
            } else {
                try {
                    const userInfo = await api.getUserInfo(userId);
                    const userName = userInfo[userId].name;
                    __edit(__l.t("m597", [userName]), __info);
                } catch (error) {
                    console.error(__l.t("m593", [error]));
                }
            }
        } else {
            __edit(__l.t("m598"), __info);
        }
    } else if (command === 'list') {
        if (bannedUsers.length > 0) {
            try {
                const userInfo = await api.getUserInfo(bannedUsers);
                const bannedList = bannedUsers.map(ban => userInfo[ban].name).join(', ');
                __edit(__l.t("m599", [bannedList]), __info);
            } catch (error) {
                console.error(`Failed to get user info for list command: ${error}`);
            }
        } else {
            __edit(__l.t("m601"), __info);
        }
    } else {
        __edit(__l.t("m602"), __info);
    }
};

function updateBannedUsersFile(bannedUsers, filePath) {
    fs.writeFileSync(filePath, JSON.stringify(bannedUsers, null, 2));
}
const __l = require("../../includes/i18n");
const fs = require('fs');
const path = require('path');

module.exports.config = {
  name: "warn",
  version: "1.0",
  hasPermssion: 1,
  credits: "Jonell Magallanes",
  description: "Warn system for group management",
  usePrefix: true,
  commandCategory: "Admin",
  usage: "[warn] [clear] [list]",
  cooldowns: 5
};

const warnPath = path.join(__dirname, 'warnData.json');

function loadWarnData() {
  try {
    if (!fs.existsSync(warnPath)) {
      const defaultData = {};
      fs.writeFileSync(warnPath, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    return JSON.parse(fs.readFileSync(warnPath, 'utf8'));
  } catch (error) {
    return {};
  }
}

function saveWarnData(data) {
  try {
    fs.writeFileSync(warnPath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    return false;
  }
}

module.exports.run = async function ({ api, event, args }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ WARN " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m1045"));

  const { threadID, messageID, senderID, mentions, messageReply } = event;
  
  if (!event.isGroup) {
    return __edit(__l.t("m542"), __info);
  }

  const threadInfo = await api.getThreadInfo(threadID);
  const adminIDs = threadInfo.adminIDs.map(admin => admin.id);
  
  if (!adminIDs.includes(senderID)) {
    return __edit(__l.t("m543"), __info);
  }

  const warnData = loadWarnData();
  if (!warnData[threadID]) {
    warnData[threadID] = {};
  }

  const action = args[0];

  if (!action) {
    return __edit(__l.t("m1046"), __info);
  }

  if (action === 'list') {
    const threadWarns = warnData[threadID];
    const warnedUsers = Object.keys(threadWarns);
    
    if (warnedUsers.length === 0) {
      return __edit(__l.t("m1047"), __info);
    }

    let listMessage = __l.t("m1048");
    
    for (const userID of warnedUsers) {
      try {
        const userInfo = await api.getUserInfo(userID);
        const userName = userInfo[userID]?.name || userID;
        const warnCount = threadWarns[userID].count;
        const lastReason = threadWarns[userID].lastReason;
        
        listMessage += __l.t("m1049", [userName, warnCount, lastReason]);
      } catch (error) {
        listMessage += __l.t("m1049", [userID, threadWarns[userID].count, threadWarns[userID].lastReason]);
      }
    }

    return __edit(listMessage, __info);
  }

  if (action === 'clear') {
    const targetUser = args[1];
    
    if (!targetUser) {
      return __edit(__l.t("m1050"), __info);
    }

    let userID;
    
    if (Object.keys(mentions).length > 0) {
      userID = Object.keys(mentions)[0];
    } else if (messageReply) {
      userID = messageReply.senderID;
    } else {
      userID = targetUser;
    }

    if (!warnData[threadID][userID]) {
      return __edit(__l.t("m1051"), __info);
    }

    delete warnData[threadID][userID];
    
    if (saveWarnData(warnData)) {
      try {
        const userInfo = await api.getUserInfo(userID);
        const userName = userInfo[userID]?.name || userID;
        return __edit(__l.t("m1052", [userName]), __info);
      } catch (error) {
        return __edit(__l.t("m1052", [userID]), __info);
      }
    } else {
      return __edit(__l.t("m1053"), __info);
    }
  }

  if (action === 'warn' || !['clear', 'list'].includes(action)) {
    let targetUser;
    let reason;
    
    if (Object.keys(mentions).length > 0) {
      targetUser = Object.keys(mentions)[0];
      reason = args.slice(1).join(" ").replace(mentions[targetUser], "").trim();
    } else if (messageReply) {
      targetUser = messageReply.senderID;
      reason = args.slice(1).join(" ").trim();
    } else {
      targetUser = args[1];
      reason = args.slice(2).join(" ").trim();
    }

    if (!targetUser) {
      return __edit(__l.t("m1054"), __info);
    }

    if (!reason) reason = __l.t("m51");

    if (!warnData[threadID][targetUser]) {
      warnData[threadID][targetUser] = {
        count: 0,
        lastReason: "",
        history: []
      };
    }

    warnData[threadID][targetUser].count += 1;
    warnData[threadID][targetUser].lastReason = reason;
    warnData[threadID][targetUser].history.push({
      reason: reason,
      timestamp: new Date().toISOString(),
      warnedBy: senderID
    });

    const warnCount = warnData[threadID][targetUser].count;

    if (saveWarnData(warnData)) {
      try {
        const userInfo = await api.getUserInfo(targetUser);
        const userName = userInfo[targetUser]?.name || targetUser;
        
        const warnMessage = __l.t("m1055", [userName, warnCount, reason]);
        
        __edit(warnMessage, __info);
        
        if (warnCount >= 3) {
          try {
            await api.removeUserFromGroup(targetUser, threadID);
            
            const kickMessage = __l.t("m1056", [userName, warnCount, reason]);
            
            __edit(kickMessage, __info);
            
            delete warnData[threadID][targetUser];
            saveWarnData(warnData);
            
          } catch (kickError) {
            __edit(__l.t("m1057", [userName]), __info);
          }
        } else if (warnCount === 2) {
          __edit(__l.t("m1058", [userName]), __info);
        }
      } catch (error) {
        const warnMessage = __l.t("m1055", [targetUser, warnCount, reason]);
        
        __edit(warnMessage, __info);
        
        if (warnCount >= 3) {
          try {
            await api.removeUserFromGroup(targetUser, threadID);
            
            const kickMessage = __l.t("m1056", [targetUser, warnCount, reason]);
            
            __edit(kickMessage, __info);
            
            delete warnData[threadID][targetUser];
            saveWarnData(warnData);
            
          } catch (kickError) {
            __edit(__l.t("m1057", [targetUser]), __info);
          }
        } else if (warnCount === 2) {
          __edit(__l.t("m1058", [targetUser]), __info);
        }
      }
    } else {
      __edit(__l.t("m1059"), __info);
    }
  }
};
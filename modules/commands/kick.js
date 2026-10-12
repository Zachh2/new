const __l = require("../../includes/i18n");
module.exports.config = {
  name: "kick",
  version: "1.0",
  hasPermssion: 1,
  credits: "Jonell Magallanes",
  description: "Kick user from group",
  usePrefix: true,
  commandCategory: "Admin",
  usage: "[kick] [mention or reply] [reason]",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ KICK " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  const __burn = (ms) => setTimeout(() => { if (__info) api.unsendMessage(__info.messageID); }, ms || 10000);
  __react("⏳");
  const __info = await __send(__l.t("m541"));

  const { threadID, messageID, senderID, mentions, messageReply } = event;
  
  if (!event.isGroup) {
    __edit(__l.t("m542"), __info);
    __burn(10000);
    return;
  }

  const threadInfo = await api.getThreadInfo(threadID);
  const adminIDs = threadInfo.adminIDs.map(admin => admin.id);
  
  if (!adminIDs.includes(senderID)) {
    __edit(__l.t("m543"), __info);
    __burn(10000);
    return;
  }

  const botID = api.getCurrentUserID();
  if (!adminIDs.includes(botID)) {
    __edit(__l.t("m544"), __info);
    __burn(10000);
    return;
  }

  if (args.length === 0 && !messageReply) {
    __edit(__l.t("m545"), __info);
    __burn(10000);
    return;
  }

  let targetUser;
  let reason;
  
  if (Object.keys(mentions).length > 0) {
    targetUser = Object.keys(mentions)[0];
    const mentionText = mentions[targetUser];
    reason = args.join(" ").replace(mentionText, "").trim();
  } else if (messageReply) {
    targetUser = messageReply.senderID;
    reason = args.join(" ").trim();
  } else {
    targetUser = args[0];
    reason = args.slice(1).join(" ").trim();
  }

  if (!targetUser) {
    __edit(__l.t("m546"), __info);
    __burn(10000);
    return;
  }

  if (!reason) reason = __l.t("m547");

  if (targetUser === senderID) {
    __edit(__l.t("m548"), __info);
    __burn(10000);
    return;
  }

  if (targetUser === botID) {
    __edit(__l.t("m549"), __info);
    __burn(10000);
    return;
  }

  const targetAdminCheck = adminIDs.includes(targetUser);
  if (targetAdminCheck) {
    __edit(__l.t("m550"), __info);
    __burn(10000);
    return;
  }

  try {
    const userInfo = await api.getUserInfo(targetUser);
    const userName = userInfo[targetUser]?.name || targetUser;
    const adminInfo = await api.getUserInfo(senderID);
    const adminName = adminInfo[senderID]?.name || "Admin";

api.setMessageReaction("⏱️", event.messageID, () => { }, true);

    await api.removeUserFromGroup(targetUser, threadID);

    const successMsg = await api.sendMessage(__l.t("m551", [userName, reason, adminName]), threadID);
    
    try {
      const dmMessage = __l.t("m552", [userName, reason, adminName, threadInfo.name || "Unknown Group"]);
      
      await api.sendMessage(dmMessage, targetUser);
    } catch (dmError) {
      console.error("Failed to send DM:", dmError);
    }
    
    setTimeout(async () => {
      try {
        await api.unsendMessage(warningMsg.messageID);
        await api.unsendMessage(successMsg.messageID);
      } catch (error) {
        console.error("Error unsending messages:", error);
      }
    }, 5000);

  } catch (error) {
    console.error("Kick error:", error);
    __edit(__l.t("m557"), __info);
    __burn(10000);
  }
};
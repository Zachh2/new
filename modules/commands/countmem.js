const __l = require("../../includes/i18n");
module.exports.config = {
  name: "countmem",
  version: "2.0.0",
  hasPermssion: 0,
  credits: "BerVer + Zycke fix",
  description: "Count group stats",
  usePrefix: true,
  commandCategory: "group",
  usages: "message/admin/member/male/female/other/allgroup/alluser",
  cooldowns: 5
};

module.exports.run = async function({ api, Threads, Users, event, args }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ COUNTMEM " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m370"));

  const { threadID, messageID } = event;

  const input = args[0]?.toLowerCase();

  const threadInfo = await api.getThreadInfo(threadID);

  let male = 0, female = 0, other = 0;

  for (let user of threadInfo.userInfo) {
    if (user.gender == "MALE") male++;
    else if (user.gender == "FEMALE") female++;
    else other++;
  }

  const box = await Threads.getAll(['threadID']);
  const users = await Users.getAll(['userID']);

  // ❌ NO INPUT
  if (!input) {
    return __edit(__l.t("m371"), __info);
  }

  // 📊 SWITCH SYSTEM (CLEAN)
  let msg = "";

  switch (input) {
    case "message":
      msg = __l.t("m372", [threadInfo.messageCount]);
      break;

    case "admin":
      msg = __l.t("m373", [threadInfo.adminIDs.length]);
      break;

    case "member":
      msg = __l.t("m374", [threadInfo.participantIDs.length]);
      break;

    case "male":
      msg = __l.t("m375", [male]);
      break;

    case "female":
      msg = __l.t("m376", [female]);
      break;

    case "other":
    case "gei":
      msg = __l.t("m377", [other]);
      break;

    case "allgroup":
      msg = __l.t("m378", [box.length]);
      break;

    case "alluser":
      msg = __l.t("m379", [users.length]);
      break;

    default:
      msg = __l.t("m380");
  }

  return __edit(`╭┈ ❒ [ COUNT 📊 ]
╰┈➤ ${msg}`, __info);
};
const __l = require("../../includes/i18n");
const { exec } = require("child_process");

module.exports.config = {
  name: "shell",
  version: "1.0",
  hasPermssion: 2,
  credits: "Jonell Hutchin Magallanes",
  description: "Execute shell commands",
  usePrefix: true,
  commandCategory: "system",
  usages: "<prefix>shell <command>",
  cooldowns: 5,
};

module.exports.run = async function({ api, event, args }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ SHELL " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m825"));

  const command = args.join(" ");
  if (!command) return __edit(__l.t("m826"), __info);

  exec(command, { timeout: 10000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) return __edit(__l.t("m827", [error.message]), __info);
    if (stderr) return __edit(__l.t("m828", [stderr]), __info);
    if (stdout.length === 0) return __edit(__l.t("m829"), __info);

    __edit(__l.t("m830", [stdout.substring(0, 1900)]), __info);
  });
};
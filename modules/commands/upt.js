const __l = require("../../includes/i18n");
const os = require("os");
let disk = null;
try { disk = require("diskusage"); } catch (e) { /* reported at run time */ }

module.exports.config = {
  name: "upt",
  version: "1.1",
  hasPermssion: 0,
  credits: "Jonell Hutchin Magallanes",
  description: "Show system uptime, OS, RAM, and storage info",
  usePrefix: true,
  commandCategory: "system",
  usages: "<prefix>upt",
  cooldowns: 30,
};

module.exports.run = async function({ api, event }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ UPT " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m966"));

  const uptimeSeconds = process.uptime();
  const uptime = new Date(uptimeSeconds * 1000).toISOString().substr(11, 8);
  const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
  const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
  const cpus = os.cpus();
  const loadAvg = os.loadavg().map(x => x.toFixed(2)).join(", ");

  let storageMsg = __l.t("m967");
  try {
    const { total, free } = await disk.check("/");
    const totalGB = (total / 1024 / 1024 / 1024).toFixed(2);
    const freeGB = (free / 1024 / 1024 / 1024).toFixed(2);
    storageMsg = __l.t("m968", [freeGB, totalGB]);
  } catch (e) {}

  const message = 
__l.t("m969", [os.type(), os.release(), os.arch(), uptime, freeMem, totalMem, storageMsg, cpus[0].model, cpus.length, loadAvg]);

  __edit(message, __info);
};
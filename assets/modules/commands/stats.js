const __l = require("../../includes/i18n");
const os = require('os');
const process = require('process');

module.exports.config = {
    name: "stats",
    version: "1.0.0",
    hasPermssion: 0,
    description: "Show system status and memory information",
    usePrefix: true,
    hide: false,
    commandCategory: "System",
    usages: "?stats",
    cooldowns: 5,
    credits: "Jonell Magallanes"
};

module.exports.run = async function ({ api, event }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ STATS " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m890"));

    try {
        const totalRAM = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
        const freeRAM = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
        const usedRAM = (os.totalmem() - os.freemem()) / (1024 * 1024 * 1024);
        const usedRAMPercent = ((usedRAM / (os.totalmem() / (1024 * 1024 * 1024))) * 100).toFixed(2);
        
        const uptimeSeconds = process.uptime();
        const uptimeDays = Math.floor(uptimeSeconds / 86400);
        const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600);
        const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
        const uptimeSecs = Math.floor(uptimeSeconds % 60);
        
        const systemStatus = usedRAMPercent > 80 ? __l.t("m891") : usedRAMPercent > 60 ? __l.t("m892") : __l.t("m893");
        
        const statsMessage = __l.t("m894", [os.type(), os.release(), freeRAM, totalRAM, usedRAMPercent, os.platform(), uptimeDays, uptimeHours, uptimeMinutes, uptimeSecs, systemStatus, os.hostname(), process.version]);

        __edit(statsMessage, __info);
        
    } catch (error) {
        console.error('Stats command error:', error);
        __edit(__l.t("m896"), __info);
    }
};
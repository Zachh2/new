const __l = require("../../includes/i18n");
const axios = require('axios');
if (axios && axios.defaults) axios.defaults.timeout = axios.defaults.timeout || 30000; // no request may hang forever

module.exports.config = {
    name: "wq",
    version: "1.0.0",
    hasPermssion: 0,
    credits: "Jonell Hutchin Magallanes",
    description: "Generate an aesthetic quote image",
    usePrefix: true,
    commandCategory: "media",
    usages: "wq [text | author | color]",
    cooldowns: 5,
    dependencies: {
        "axios": ""
    }
};

module.exports.run = async function ({ api, event, args }) {
    const input = args.join(" ").split("|").map(i => i.trim());
    if (input.length < 2) {
        return api.sendMessage(__l.t("m1094"), event.threadID, event.messageID);
    }

    const text = input[0];
    const author = input[1];
    const color = input[2] || "white";

    const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, event.threadID, (e, i) => r(e ? null : i), event.messageID));
    const react = (e) => { try { api.setMessageReaction(e, event.messageID, () => {}, true); } catch (err) {} };
    const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ WQ " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
    const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, event.threadID); else api.sendMessage(o, event.threadID, event.messageID); react(b ? "❌" : "✅"); };
    const info = await sendWait(__l.t("m1096"));

    try {
        api.setMessageReaction("⏳", event.messageID, () => {}, true);

        const url = `https://ccprojectsapis.zetsu.xyz/api/aesthetic?text=${encodeURIComponent(text)}&author=${encodeURIComponent(author)}&color=${encodeURIComponent(color)}`;
        
        // Get the image stream directly
        const imageResponse = await axios({
            method: 'get',
            url: url,
            responseType: 'stream'
        });

        api.setMessageReaction("✅", event.messageID, () => {}, true);

        edit(__l.t("m1097", [text, author]), info);

        await api.sendMessage({
            attachment: imageResponse.data
        }, event.threadID, event.messageID);

    } catch (err) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        edit(__l.t("m566") + err.message, info);
    }
};
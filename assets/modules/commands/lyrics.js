const __l = require("../../includes/i18n");
const axios = require("axios");
if (axios && axios.defaults) axios.defaults.timeout = axios.defaults.timeout || 30000; // no request may hang forever

module.exports.config = {
    name: "lyrics",
    version: "1.0.0",
    hasPermssion: 0,
    credits: "Jonell Hutchin Magallanes",
    description: "Get lyrics of a song",
    usePrefix: true,
    commandCategory: "media",
    usages: "lyrics [song name]",
    cooldowns: 5,
    dependencies: {
        "axios": ""
    }
};

module.exports.run = async function ({ api, event, args }) {
    const song = args.join(" ");
    if (!song) return api.sendMessage(__l.t("m561"), event.threadID, event.messageID);

    const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, event.threadID, (e, i) => r(e ? null : i), event.messageID));
    const react = (e) => { try { api.setMessageReaction(e, event.messageID, () => {}, true); } catch (err) {} };
    const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ LYRICS " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
    const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, event.threadID); else api.sendMessage(o, event.threadID, event.messageID); react(b ? "❌" : "✅"); };
    const info = await sendWait(__l.t("m563"));

    try {
        api.setMessageReaction("⏳", event.messageID, () => {}, true);

        const url = `https://api.popcat.xyz/v2/lyrics?song=${encodeURIComponent(song)}`;
        const res = await axios.get(url);

        if (res.data.error || !res.data.message) {
            api.setMessageReaction("❌", event.messageID, () => {}, true);
            return edit(__l.t("m564"), info);
        }

        const data = res.data.message;

        // Get the image stream directly
        const imgResponse = await axios({
            method: 'get',
            url: data.image,
            responseType: 'stream'
        });

        const message = 
__l.t("m565", [data.title, data.artist, data.url, data.lyrics]);

        edit(message, info);

        await api.sendMessage({
            attachment: imgResponse.data
        }, event.threadID, event.messageID);

        api.setMessageReaction("✅", event.messageID, () => {}, true);

    } catch (err) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        edit(__l.t("m566") + err.message, info);
    }
};
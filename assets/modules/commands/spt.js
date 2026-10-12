const __l = require("../../includes/i18n");
const axios = require('axios');

module.exports.config = {
    name: "spotify",
    version: "1.0.0",
    hasPermssion: 0,
    description: "Search and download audio from Spotify",
    usePrefix: true,
    hide: false,
    commandCategory: "Media",
    usages: "/spotify <song name>",
    cooldowns: 5,
    credits: "Jonell Magallanes"
};

module.exports.run = async function ({ api, event, args }) {
    if (!args[0]) {
        return api.sendMessage(__l.t("m879"), event.threadID);
    }

    const query = args.join(' ');

    const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, event.threadID, (e, i) => r(e ? null : i), event.messageID));
    const react = (e) => { try { api.setMessageReaction(e, event.messageID, () => {}, true); } catch (err) {} };
    const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ SPOTIFY " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
    const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, event.threadID); else api.sendMessage(o, event.threadID, event.messageID); react(b ? "❌" : "✅"); };
    const info = await sendWait(__l.t("m881"));

    try {
        api.setMessageReaction("🔍", event.messageID, () => {}, true);

        const searchRes = await axios.get(`http://api.hutchingd.x10.mx/api/search/spt.php?query=${encodeURIComponent(query)}`, {
            timeout: 10000
        });

        if (!searchRes.data?.status || !searchRes.data.data?.length) {
            api.setMessageReaction("❌", event.messageID, () => {}, true);
            return edit(__l.t("m882"), info);
        }

        const track = searchRes.data.data[0];
        
        api.setMessageReaction("⬇️", event.messageID, () => {}, true);

        const dlRes = await axios.get(`http://api.hutchingd.x10.mx/api/dl/spt.php?url=${encodeURIComponent(track.track_url)}`, {
            timeout: 10000
        });

        if (!dlRes.data?.status || !dlRes.data.trackData?.[0]?.download_url) {
            throw new Error(__l.t("m883"));
        }

        const downloadUrl = dlRes.data.trackData[0].download_url;
        
        // Get the audio stream directly
        const audioResponse = await axios({
            method: 'get',
            url: downloadUrl,
            responseType: 'stream',
            timeout: 30000
        });

        api.setMessageReaction("✅", event.messageID, () => {}, true);

        edit(__l.t("m884", [track.title, track.artist]), info);

        await api.sendMessage({
            attachment: audioResponse.data
        }, event.threadID, event.messageID);

    } catch (error) {
        console.error('Spotify Command Error:', error.message);
        
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        
        edit(__l.t("m886", [error.message]), info);
    }
};
const __l = require("../../includes/i18n");
const axios = require('axios');
if (axios && axios.defaults) axios.defaults.timeout = axios.defaults.timeout || 30000; // no request may hang forever
const fs = require('fs-extra');
const path = require('path');

module.exports.config = {
    name: "tikstalk",
    version: "1.0.0",
    hasPermssion: 0,
    credits: "Jonell Hutchin Magallanes",
    description: "Get TikTok user profile info",
    usePrefix: true,
    commandCategory: "media",
    usages: "tikstalk [username]",
    cooldowns: 5,
    dependencies: {
        "axios": "",
        "fs-extra": ""
    }
};

module.exports.run = async function ({ api, event, args }) {
    const username = args.join(" ");
    if (!username) return api.sendMessage(__l.t("m915"), event.threadID, event.messageID);

    const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, event.threadID, (e, i) => r(e ? null : i), event.messageID));
    const react = (e) => { try { api.setMessageReaction(e, event.messageID, () => {}, true); } catch (err) {} };
    const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ TIKSTALK " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
    const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, event.threadID); else api.sendMessage(o, event.threadID, event.messageID); react(b ? "❌" : "✅"); };
    const info = await sendWait(__l.t("m917"));

    try {
        api.setMessageReaction("⏳", event.messageID, () => {}, true);

        const url = `https://ccprojectsapis.zetsu.xyz/api/tikstalk?unique_id=${encodeURIComponent(username)}`;
        const res = await axios.get(url);

        if (!res.data || !res.data.username) {
            api.setMessageReaction("❌", event.messageID, () => {}, true);
            return edit(__l.t("m918"), info);
        }

        const data = res.data;

        const avatarPath = path.join(__dirname, "cache", `avatar_${Date.now()}.jpg`);
        const avatarResponse = await axios.get(data.avatarLarger, { responseType: "arraybuffer" });
        await fs.writeFile(avatarPath, Buffer.from(avatarResponse.data, "binary"));

        api.setMessageReaction("✅", event.messageID, () => {}, true);

        edit(__l.t("m919") +
                  `🆔 𝗜𝗗: ${data.id}\n` +
                  __l.t("m921", [data.nickname]) +
                  __l.t("m922", [data.username]) +
                  __l.t("m923", [data.signature || "None"]) +
                  `🔑 𝗦𝗲𝗰𝗨𝗜𝗗: ${data.secUid}\n` +
                  __l.t("m925", [data.videoCount]) +
                  __l.t("m926", [data.followingCount]) +
                  __l.t("m927", [data.followerCount]) +
                  __l.t("m928", [data.heartCount]) +
                  __l.t("m929", [data.diggCount]), info);

        await api.sendMessage({
            attachment: fs.createReadStream(avatarPath)
        }, event.threadID, () => fs.unlinkSync(avatarPath));

    } catch (err) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        edit(__l.t("m566") + err.message, info);
    }
};
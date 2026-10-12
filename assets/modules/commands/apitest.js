const __l = require("../../includes/i18n");
const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports.config = {
    name: "apitest",
    version: "1.0.0",
    hasPermssion: 0,
    description: "Test API endpoints and display response information",
    usePrefix: true,
    hide: false,
    commandCategory: "Developer",
    usages: "/apitest <url>",
    cooldowns: 15,
    credits: "Jonell Magallanes"
};

module.exports.run = async function ({ api, event, args }) {
    if (!args[0]) {
        return api.sendMessage(__l.t("m81"), event.threadID);
    }

    const url = args[0];
    const startTime = Date.now();

    const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, event.threadID, (e, i) => r(e ? null : i), event.messageID));
    const react = (e) => { try { api.setMessageReaction(e, event.messageID, () => {}, true); } catch (err) {} };
    const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ APITEST " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
    const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, event.threadID); else api.sendMessage(o, event.threadID, event.messageID); react(b ? "❌" : "✅"); };
    react("⏳");
    const info = await sendWait(__l.t("m83"));

    try {
        const response = await axios.get(url, {
            timeout: 10000,
            responseType: 'arraybuffer',
            validateStatus: function (status) {
                return status >= 200 && status < 600;
            }
        });

        const responseTime = Date.now() - startTime;
        const contentType = response.headers['content-type'] || 'unknown';
        const contentLength = response.headers['content-length'] || 'unknown';
        const statusCode = response.status;
        const statusText = response.statusText;

        const isImage = contentType.startsWith('image/');
        const isAudio = contentType.startsWith('audio/');
        const isVideo = contentType.startsWith('video/');
        const isJSON = contentType.includes('application/json');
        const isText = contentType.includes('text/');

        if (isAudio || isVideo) {
            const cacheDir = path.join(__dirname, 'cache');
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }
            
            const fileExtension = isAudio ? 'mp3' : 'mp4';
            const fileName = `api_${Date.now()}.${fileExtension}`;
            const filePath = path.join(cacheDir, fileName);
            
            fs.writeFileSync(filePath, Buffer.from(response.data));
            
            const mediaType = isAudio ? 'Music' : 'Video';
            
            edit(__l.t("m84", [statusCode, statusText, responseTime, contentType, contentLength, mediaType]), info);

            api.sendMessage({
                attachment: fs.createReadStream(filePath)
            }, event.threadID, () => {
                fs.unlinkSync(filePath);
            });
            
        } else if (isImage) {
            edit(__l.t("m85", [statusCode, statusText, responseTime, contentType, contentLength]), info);
            
        } else if (isJSON) {
            try {
                const jsonData = JSON.parse(Buffer.from(response.data).toString());
                const formattedJSON = JSON.stringify(jsonData, null, 2);
                const truncatedJSON = formattedJSON.length > 1500 ? formattedJSON.substring(0, 1500) + __l.t("m86") : formattedJSON;
                
                edit(__l.t("m87", [statusCode, statusText, responseTime, contentType, contentLength, truncatedJSON]), info);
                
            } catch (jsonError) {
                const textResponse = Buffer.from(response.data).toString();
                const truncatedText = textResponse.length > 1500 ? textResponse.substring(0, 1500) + __l.t("m86") : textResponse;
                
                edit(__l.t("m88", [statusCode, statusText, responseTime, contentType, contentLength, truncatedText]), info);
            }
            
        } else if (isText) {
            const textResponse = Buffer.from(response.data).toString();
            const truncatedText = textResponse.length > 1500 ? textResponse.substring(0, 1500) + __l.t("m86") : textResponse;
            
            edit(__l.t("m88", [statusCode, statusText, responseTime, contentType, contentLength, truncatedText]), info);
            
        } else {
            edit(__l.t("m89", [statusCode, statusText, responseTime, contentType, contentLength]), info);
        }

    } catch (error) {
        const responseTime = Date.now() - startTime;
        
        if (error.response) {
            edit(__l.t("m90", [error.response.status, responseTime, error.message]), info);
        } else if (error.request) {
            edit(__l.t("m91", [responseTime]), info);
        } else {
            edit(__l.t("m92", [responseTime, error.message]), info);
        }
    }
};
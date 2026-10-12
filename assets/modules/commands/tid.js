const __l = require("../../includes/i18n");
const request = require('request');
const fs = require('fs');

module.exports.config = {
	name: "tid",
	version: "1.0.5",
	hasPermssion: 0,
	credits: "NTKhang & Yan Maglinte", // Added a function to get ThreadImage
	description: "Get box id and group image",
	usePrefix: true,
	commandCategory: "group",
	usages: "tid",
	cooldowns: 5
};

module.exports.run = async function({ api, event }) {
	const { threadID, messageID } = event;

	const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, threadID, (e, i) => r(e ? null : i), messageID));
	const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ TID " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
	const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, threadID); else api.sendMessage(o, threadID, messageID); react(b ? "❌" : "✅"); };
	const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };

	react("⏳");
	const info = await sendWait(__l.t("m908"));

	try {
		const threadInfo = await api.getThreadInfo(threadID);
		const { imageSrc } = threadInfo;

		if (!imageSrc) {
			react("✅");
			return edit(__l.t("m909", [threadID]), info);
		}

		const dest = __dirname + '/cache/thread.png';

		await new Promise((resolve, reject) => {
			const w = fs.createWriteStream(dest);
			const req = request(imageSrc);
			const timer = setTimeout(() => { try { req.abort(); } catch (e) {} reject(new Error(__l.t("m910"))); }, 30000);
			req.on('error', (e) => { clearTimeout(timer); reject(e); });
			w.on('error', (e) => { clearTimeout(timer); reject(e); });
			w.on('close', () => { clearTimeout(timer); resolve(); });
			req.pipe(w);
		});

		react("✅");
		edit(__l.t("m911", [threadID]), info);

		return api.sendMessage(
			{ attachment: fs.createReadStream(dest) },
			threadID,
			() => { try { fs.unlinkSync(dest); } catch (e) {} }
		);

	} catch (e) {
		react("❌");
		return edit(__l.t("m912", [threadID, e.message]), info);
	}
};

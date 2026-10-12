'use strict';
const i18n = require('../../includes/i18n');

module.exports.config = {
  name: 'say',
  version: '1.1.0',
  hasPermssion: 0,
  credits: 'Yan Maglinte',
  description: 'text to voice speech messages',
  descriptionKey: 'cmd.say.description',
  usePrefix: true,
  commandCategory: 'message',
  usages: 'say [voice code] <text> or reply to a message',
  usagesKey: 'cmd.say.helpUsage',
  cooldowns: 5,
  dependencies: { path: '', 'fs-extra': '' }
};

module.exports.run = async function ({ api, event, args = [] }) {
  const fs = global.nodemodule['fs-extra'];
  const path = global.nodemodule.path;
  const threadID = event.threadID;
  const language = i18n.language(threadID);
  const t = (key, values = []) => i18n.t(key, values, language);
  const prefix = global.config?.PREFIX || '-';
  const reply = body => api.sendMessage(body, threadID, event.messageID);
  const box = (text, failed = false) => `╭┈ ❒ [ SAY ${failed ? '❌' : '🔊'} ]\n├ ${text}\n╰┈━━━━━━━━━━━`;
  let content = String(event.messageReply?.body ?? args.join(' ')).trim();
  let voice = language;
  // Match a complete leading code, not words such as "enjoy" or "hello".
  const explicit = /^(ru|en|ko|ja|tl|ilo|ceb|hil)(?:\s+|$)/i.exec(content);
  if (explicit) {
    voice = explicit[1].toLowerCase();
    content = content.slice(explicit[0].length).trim();
  }
  if (!content) return reply(box(t('cmd.say.usage', [prefix])));

  let file;
  const cleanup = () => {
    try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
  };
  try {
    const cache = path.resolve(__dirname, 'cache');
    fs.ensureDirSync(cache);
    file = path.join(cache, `say_${threadID}_${event.senderID}_${require('crypto').randomBytes(6).toString('hex')}.mp3`);
    // Keep the text intact. The chosen voice is independent of the UI language.
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(content)}&tl=${encodeURIComponent(voice)}&client=tw-ob`;
    await global.utils.downloadFile(url, file);
    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(file);
      stream.once('error', reject);
      try {
        const pending = api.sendMessage({ attachment: stream }, threadID, error => {
          cleanup();
          if (error) reject(error); else resolve();
        }, event.messageID);
        if (pending && typeof pending.catch === 'function') pending.catch(reject);
      } catch (error) { stream.destroy(); reject(error); }
    });
  } catch (error) {
    cleanup();
    return reply(box(t('cmd.say.failed', [voice, prefix]), true));
  }
};

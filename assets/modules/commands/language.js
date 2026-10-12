'use strict';

const state = require('../../includes/threadState');
const i18n = require('../../includes/i18n');

const names = { tl: 'Tagalog', en: 'English', ilo: 'Ilocano / Iloko', ceb: 'Cebuano / Bisaya', hil: 'Hiligaynon / Ilonggo' };
const aliases = {
  tagalog: 'tl', filipino: 'tl', tl: 'tl', english: 'en', en: 'en',
  ilocano: 'ilo', ilokano: 'ilo', iloko: 'ilo', ilo: 'ilo',
  cebuano: 'ceb', bisaya: 'ceb', ceb: 'ceb',
  hiligaynon: 'hil', ilonggo: 'hil', hil: 'hil'
};
const messages = {
  tl: { title: 'PALITAN ANG WIKA', current: 'Kasalukuyang wika', choose: 'Pumili ng wika', reply: 'I-reply ang tl, en, ilo, ceb o hil', changed: '✅ Tagalog na ang wika ng GC.', failed: '❌ Hindi na-save ang wika. Subukan muli.' },
  en: { title: 'CHANGE LANGUAGE', current: 'Current language', choose: 'Choose a language', reply: 'Reply with tl, en, ilo, ceb or hil', changed: '✅ Group language is now English.', failed: '❌ Could not save the language. Please try again.' },
  ilo: { title: 'SUKATAN TI PAGSASAO', current: 'Agdama a pagsasao', choose: 'Piliem ti pagsasao', reply: 'Isungbat ti tl, en, ilo, ceb wenno hil', changed: '✅ Ilocano / Iloko itan ti pagsasao ti grupo.', failed: '❌ Saan a naidulin ti pagsasao. Padasem manen.' },
  ceb: { title: 'ILISI ANG PINULONGAN', current: 'Kasamtangang pinulongan', choose: 'Pilia ang pinulongan', reply: 'I-reply ang tl, en, ilo, ceb o hil', changed: '✅ Cebuano / Bisaya na ang pinulongan sa grupo.', failed: '❌ Wala ma-save ang pinulongan. Sulayi pag-usab.' },
  hil: { title: 'ISLAN ANG LENGGUWAHE', current: 'Subong nga lengguwahe', choose: 'Pilia ang lengguwahe', reply: 'I-reply ang tl, en, ilo, ceb ukon hil', changed: '✅ Hiligaynon / Ilonggo na ang lengguwahe sang grupo.', failed: '❌ Wala na-save ang lengguwahe. Tilawi liwat.' }
};

function send(api, message, threadID, replyID) {
  return new Promise((resolve, reject) => api.sendMessage(message, threadID, (err, info) => err ? reject(err) : resolve(info), replyID));
}

async function choose(api, event, desired) {
  const threadID = String(event.threadID);
  const current = i18n.language(threadID);
  try {
    state.update(threadID, { language: desired });
    if (global.db?.sync) setImmediate(() => {
      Promise.resolve().then(() => global.db?.sync?.())
        .catch(error => console.error('[language sync]', error.message));
    });
    return await send(api, messages[desired].changed, threadID, event.messageID);
  } catch (err) {
    return send(api, messages[current].failed, threadID, event.messageID);
  }
}

module.exports.config = {
  name: 'language', version: '1.1.0', hasPermssion: 0, credits: 'CHIA BOT',
  description: 'Change the language of this group / Palitan ang wika ng GC',
  usages: '[tl | en | ilo | ceb | hil]', commandCategory: 'System', usePrefix: true, cooldowns: 2
};

module.exports.run = async function ({ api, event, args }) {
  const desired = aliases[String(args?.[0] || '').trim().toLowerCase()];
  if (desired) return choose(api, event, desired);

  const threadID = String(event.threadID);
  const current = i18n.language(threadID);
  const labels = messages[current];
  const prefix = global.config?.PREFIX || '-';
  const action = { tl: 'isagot', en: 'reply', ilo: 'isungbat', ceb: 'itubag', hil: 'isabat' }[current];
  const menu = [
    `╭┈ ❒ [ ${labels.title} 🌐 ]`,
    `├ ${labels.current}: ${names[current]}`,
    `├ ${labels.choose}:`,
    `├  ①  Tagalog  — ${action}  tl`,
    `├  ②  English  — ${action}  en`,
    `├  ③  Ilocano / Iloko  — ${action}  ilo`,
    `├  ④  Cebuano / Bisaya  — ${action}  ceb`,
    `├  ⑤  Hiligaynon / Ilonggo  — ${action}  hil`,
    `╰┈➤ ${labels.reply} (${prefix}language <code>)`
  ].join('\n');
  const info = await send(api, menu, threadID, event.messageID);
  if (!info?.messageID) return;
  const replies = global.client.handleReply ||= [];
  for (let index = replies.length - 1; index >= 0; index--) {
    if (replies[index].name === 'language' && replies[index].threadID === threadID && replies[index].author === String(event.senderID)) replies.splice(index, 1);
  }
  replies.push({ name: 'language', messageID: info.messageID, threadID, author: String(event.senderID), createdAt: Date.now() });
};

module.exports.handleReply = async function ({ api, event, handleReply }) {
  if (String(event.threadID) !== handleReply.threadID || String(event.senderID) !== handleReply.author) return;
  const replies = global.client.handleReply;
  const remove = () => { const index = replies.indexOf(handleReply); if (index !== -1) replies.splice(index, 1); };
  if (Date.now() - handleReply.createdAt > 10 * 60 * 1000 || !state.get(event.threadID).started) {
    remove();
    return;
  }
  const desired = aliases[String(event.body || '').trim().toLowerCase()];
  if (!desired) return send(api, messages[i18n.language(event.threadID)].reply, event.threadID, event.messageID);
  remove();
  return choose(api, event, desired);
};

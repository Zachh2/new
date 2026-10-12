'use strict';
const state = require('./threadState');
const fs = require('fs');
const path = require('path');
const notStartedGif = path.join(__dirname, '../assets/chia-not-started.gif');
const locks = new Map();
const NOTICE = "╭┈ ❒ [ START BOT ✅ ]\n├ 🔒 The bot isn't started in this chat yet.\n├ Type  start bot  to begin.\n├ 🔒 Hindi pa naka-start ang bot sa GC na ito.\n╰┈➤ I-type ang start bot para magsimula.";
const PICK = '╭┈ ❒ [ START BOT ✅ ]\n├ Choose a language / Pumili ng wika:\n├  ①  Tagalog  — reply  tl\n├  ②  English  — reply  en\n├  ③  Ilocano / Iloko  — reply  ilo\n├  ④  Cebuano / Bisaya  — reply  ceb\n├  ⑤  Hiligaynon / Ilonggo  — reply  hil\n╰┈➤ reply with tl, en, ilo, ceb or hil';
const FAIL = '❌ Could not save bot settings. Please try again.\nHindi na-save ang setting ng bot. Subukan muli.';
function started(lang) {
  const prefix = global.config?.PREFIX || '-';
  const messages = {
    tl: ['Naka-start na ang bot — puwede mo nang gamitin ang mga command.', `I-type ang ${prefix}help para makita lahat.`],
    en: ['The bot is started — you can use commands now.', `Type ${prefix}help to see them all.`],
    ilo: ['Nairugin ti bot — mabalinmon nga usaren dagiti command.', `I-type ti ${prefix}help tapno makita amin.`],
    ceb: ['Nagsugod na ang bot — magamit na nimo ang mga command.', `I-type ang ${prefix}help aron makita ang tanan.`],
    hil: ['Nagsugod na ang bot — mahimo mo na gamiton ang mga command.', `I-type ang ${prefix}help agod makita ang tanan.`]
  };
  const [notice, help] = messages[lang] || messages.en;
  return `╭┈ ❒ [ BOT STARTED ✅ ]\n├ ${notice}\n├ ${help}`;
}
function locked(id, task) {
  id = String(id);
  const next = (locks.get(id) || Promise.resolve()).catch(() => {}).then(task);
  locks.set(id, next);
  return next.finally(() => { if (locks.get(id) === next) locks.delete(id); });
}
function send(api, text, threadID, replyID, showGif = false) {
  return new Promise((resolve, reject) => {
    try {
      const message = showGif ? { body: text, attachment: fs.createReadStream(notStartedGif) } : text;
      const out = api.sendMessage(message, threadID, (err, info) => err ? reject(err) : resolve(info), replyID);
      if (out && typeof out.catch === 'function') out.catch(reject);
    } catch (err) { reject(err); }
  });
}
function syncSettings() {
  if (!global.db?.sync) return;
  setImmediate(() => {
    Promise.resolve().then(() => global.db?.sync?.())
      .catch(err => console.error('[onboarding sync]', err.message));
  });
}
function isGroup(event) {
  if (typeof event.isGroup === 'boolean') return event.isGroup;
  const info = global.data?.threadInfo?.get(String(event.threadID));
  if (typeof info?.isGroup === 'boolean') return info.isGroup;
  return !!event.threadID && String(event.threadID) !== String(event.senderID || event.userID || '');
}
function isCommand(event) {
  const body = String(event.body || '').trim(), prefix = global.config?.PREFIX || '-';
  const name = body.split(/\s+/)[0].toLowerCase();
  return body.startsWith(prefix) || global.client?.commands?.has(name) ||
    /^(prefix|bot|help|what is (the )?prefix|ano (ang )?prefix|paano mag command|how to use bot|command list|bot prefix)$/i.test(body) ||
    (event.type === 'message_reply' && global.client?.handleReply?.some(reply => String(reply.messageID) === String(event.messageReply?.messageID)));
}
async function notify(api, threadID, approved = false) {
  return locked(threadID, async () => {
    const saved = state.get(threadID);
    if (!saved.updatedAt) state.update(threadID, {});
    if (saved.started) return;
    await send(api, saved.awaitingLanguage ? PICK : NOTICE, threadID, undefined, true);
  });
}
async function approve(api, threadID, note) {
  if (typeof api.handleMessageRequest === 'function') await api.handleMessageRequest(String(threadID), true);
  if (note) await send(api, note, String(threadID));
  await notify(api, String(threadID), true);
}
async function handle(api, event) {
  if (!isGroup(event)) return false;
  const tid = String(event.threadID);
  if (event.type === 'event' && event.logMessageType === 'log:unsubscribe' && String(event.logMessageData?.leftParticipantFbId) === String(api.getCurrentUserID())) {
    state.update(tid, { started: false, awaitingLanguage: false }); return true;
  }
  if (event.type === 'event' && event.logMessageType === 'log:subscribe' && event.logMessageData?.addedParticipants?.some(p => String(p.userFbId) === String(api.getCurrentUserID()))) {
    await notify(api, tid); return true;
  }
  if (!['message', 'message_reply'].includes(event.type)) return !state.get(tid).started;
  if (String(event.senderID) === String(api.getCurrentUserID())) return true;
  // Reports may be sent to an admin GC that has not started the bot. A reply
  // to a tracked callad report must still reach callad's reply handler.
  if (event.type === 'message_reply' && event.messageReply?.messageID) {
    const entry = global.client?.handleReply?.find(reply =>
      reply.name === 'callad' && String(reply.messageID) === String(event.messageReply.messageID));
    if (entry && (
      (entry.type === 'admin_reply' && tid === String(entry.adminThreadID) && String(event.senderID) !== String(entry.reporterID)) ||
      (entry.type === 'user_reply' && tid === String(entry.sourceThreadID) && String(event.senderID) === String(entry.reporterID))
    )) return false;
  }
  const body = String(event.body || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (state.get(tid).started && body !== 'start bot') return false;
  return locked(tid, async () => {
    const saved = state.get(tid);
    if (saved.started) {
      if (body !== 'start bot') return false;
      await send(api, started(saved.language), tid, event.messageID);
      return true;
    }
    if (global.data?.threadBanned?.has(tid) || global.data?.userBanned?.has(String(event.senderID))) return true;
    if (global.config?.adminOnly && !(global.config.ADMINBOT || []).map(String).includes(String(event.senderID))) return true;
    if (body === 'start bot') {
      state.update(tid, { awaitingLanguage: true, started: false }); await send(api, PICK, tid, event.messageID, true); return true;
    }
    const lang = /^(1|tagalog|filipino|tl)$/.test(body) ? 'tl'
      : /^(2|english|en)$/.test(body) ? 'en'
      : /^(3|ilocano|ilokano|iloko|ilo)$/.test(body) ? 'ilo'
      : /^(4|cebuano|bisaya|ceb)$/.test(body) ? 'ceb'
      : /^(5|hiligaynon|ilonggo|hil)$/.test(body) ? 'hil' : null;
    if (saved.awaitingLanguage && lang) {
      state.update(tid, { started: true, language: lang, awaitingLanguage: false, startedBy: String(event.senderID), startedAt: new Date().toISOString() });
      syncSettings();
      await send(api, started(lang), tid, event.messageID);
      return true;
    }
    if (isCommand(event) || lang || (saved.awaitingLanguage && event.type === 'message_reply')) await send(api, saved.awaitingLanguage ? PICK : NOTICE, tid, event.messageID);
    return true;
  });
}
async function gate(api, event) {
  try { return await handle(api, event); }
  catch (err) {
    console.error('[onboarding]', err.message);
    try { await send(api, FAIL, event.threadID, event.messageID); } catch (_) {}
    return true;
  }
}
module.exports = { gate, notify, approve, isGroup, send, NOTICE, PICK };

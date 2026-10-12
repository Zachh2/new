const __l = require('../../includes/i18n');
const fs = require('fs');
const path = require('path');
let moment;
try { moment = require('moment-timezone'); } catch (_) { /* Intl fallback */ }

module.exports.config = {
  name: 'callad', version: '4.1.0', hasPermssion: 0, credits: 'Zycke',
  description: 'Send report to admins (multi GC + reply)', usePrefix: true,
  commandCategory: 'system', usages: '[message]', cooldowns: 5
};

const ADMIN_TIDS = ['1130000599101474', '1318891403069148'];
const ROUTES_FILE = path.join(__dirname, 'cache', 'calladReplies.json');
const ROUTE_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_ROUTES = 500;
const labels = {
  tl: { from: 'Mula kay', message: 'Mensahe', reply: 'I-reply ito para sumagot', failed: '❌ Hindi naipadala ang ulat sa alinmang admin GC.', forwardFailed: '❌ Hindi naipadala ang sagot. Subukan muli.' },
  en: { from: 'From', message: 'Message', reply: 'Reply here to respond', failed: '❌ The report could not be sent to any admin chat.', forwardFailed: '❌ Could not forward the reply. Please try again.' },
  ilo: { from: 'Manipud ken', message: 'Mensahe', reply: 'Isungbat daytoy tapno sumungbat', failed: '❌ Saan a naipatulod ti report iti admin GC.', forwardFailed: '❌ Saan a naipatulod ti sungbat. Padasem manen.' },
  ceb: { from: 'Gikan kang', message: 'Mensahe', reply: 'Tubaga kini aron motubag', failed: '❌ Wala mapadala ang report sa admin GC.', forwardFailed: '❌ Wala mapadala ang tubag. Sulayi pag-usab.' },
  hil: { from: 'Halin kay', message: 'Mensahe', reply: 'Sabta ini agod makasabat', failed: '❌ Wala napadala ang report sa admin GC.', forwardFailed: '❌ Wala napadala ang sabat. Tilawi liwat.' }
};

function send(api, text, threadID, replyID) {
  return new Promise((resolve, reject) => {
    try {
      const result = api.sendMessage(text, threadID, (error, info) => {
        if (error || !info?.messageID) reject(error || new Error('No message ID returned'));
        else resolve(info);
      }, replyID);
      if (result && typeof result.catch === 'function') result.catch(reject);
    } catch (error) { reject(error); }
  });
}

async function forward(api, text, threadID, replyID) {
  try { return await send(api, text, threadID, replyID); }
  catch (error) {
    // The target message might have been deleted. Send without a reply target.
    if (replyID && /message.?id|reply|not found|does not exist/i.test(String(error?.error || error?.message || error))) {
      return send(api, text, threadID);
    }
    throw error;
  }
}

function now() {
  if (moment) return moment.tz('Asia/Manila').format('HH:mm:ss | DD/MM/YYYY');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
    second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.hour}:${parts.minute}:${parts.second} | ${parts.day}/${parts.month}/${parts.year}`;
}

function track(data) {
  const routes = global.client.handleReply ||= [];
  routes.push({ name: 'callad', createdAt: Date.now(), ...data });
  saveRoutes(routes);
}

function saveRoutes(routes) {
  try {
    const cutoff = Date.now() - ROUTE_TTL;
    const saved = routes.filter(route => route.name === 'callad' && route.createdAt > cutoff)
      .slice(-MAX_ROUTES);
    fs.mkdirSync(path.dirname(ROUTES_FILE), { recursive: true });
    const temp = ROUTES_FILE + '.' + process.pid + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(saved));
    fs.renameSync(temp, ROUTES_FILE);
  } catch (error) { console.error('[callad] could not save reply routes:', error.message); }
}

module.exports.onLoad = function () {
  try {
    const saved = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
    if (!Array.isArray(saved)) throw new Error('Invalid reply routes');
    const routes = global.client.handleReply ||= [];
    const known = new Set(routes.map(route => String(route.messageID)));
    const cutoff = Date.now() - ROUTE_TTL;
    for (const route of saved) {
      if (route?.name !== 'callad' || !route.messageID || route.createdAt <= cutoff ||
          !['admin_reply', 'user_reply'].includes(route.type) || known.has(String(route.messageID))) continue;
      routes.push(route);
      known.add(String(route.messageID));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[callad] could not restore reply routes:', error.message);
  }
};

async function status(api, event, pending, text, ok) {
  const body = `╭┈ ❒ [ CALLAD ${ok ? '✅' : '❌'} ]\n${text}\n╰┈━━━━━━━━━━━`;
  try {
    if (pending?.messageID && global.editMsgDisabled !== true) await api.editMessage(body, pending.messageID);
    else await send(api, body, event.threadID, event.messageID);
  } catch (_) {
    await send(api, body, event.threadID, event.messageID);
  }
  try { api.setMessageReaction(ok ? '✅' : '❌', event.messageID, () => {}, true); } catch (_) {}
}

module.exports.run = async function ({ api, event, args, Users }) {
  const sourceThreadID = String(event.threadID);
  const message = (args || []).join(' ').trim();
  if (!message) return status(api, event, null, __l.t('m222', [], __l.language(sourceThreadID)), false);

  let pending = null;
  if (!global.editMsgDisabled) {
    try { pending = await send(api, __l.t('m220', [], __l.language(sourceThreadID)), sourceThreadID, event.messageID); }
    catch (_) { /* Still deliver the report. */ }
  }

  let name = __l.t('m223', [], __l.language(sourceThreadID));
  try { name = await Users.getNameUser(event.senderID) || name; } catch (_) {}
  let threadName = __l.t('m225', [], __l.language(sourceThreadID));
  try { threadName = (await api.getThreadInfo(sourceThreadID))?.threadName || threadName; } catch (_) {}
  const time = now();

  const results = await Promise.allSettled(ADMIN_TIDS.map(async adminThreadID => {
    const report = __l.t('m226', [name, event.senderID, threadName, sourceThreadID, message, time], __l.language(adminThreadID));
    const info = await send(api, report, adminThreadID);
    track({ type: 'admin_reply', messageID: info.messageID, adminThreadID,
      sourceThreadID, sourceMessageID: event.messageID, reporterID: String(event.senderID), reporterName: name });
  }));
  const delivered = results.filter(result => result.status === 'fulfilled').length;
  for (const result of results) {
    if (result.status === 'rejected') console.error('[callad] admin delivery failed:', result.reason);
  }
  if (!delivered) return status(api, event, pending, (labels[__l.language(sourceThreadID)] || labels.en).failed, false);
  return status(api, event, pending, __l.t('m228', [message, time], __l.language(sourceThreadID)), true);
};

module.exports.handleReply = async function ({ api, event, handleReply }) {
  const text = String(event.body || '').trim();
  if (!text) return;
  const sourceThreadID = String(handleReply.sourceThreadID || handleReply.threadID || '');
  const reporterID = String(handleReply.reporterID || handleReply.author || '');

  if (handleReply.type === 'admin_reply') {
    const adminThreadID = String(handleReply.adminThreadID || '');
    if (adminThreadID && String(event.threadID) !== adminThreadID) return;
    if (String(event.senderID) === reporterID) return;
    try {
      const body = __l.t('m229', [text], __l.language(sourceThreadID));
      const sent = await forward(api, body, sourceThreadID, handleReply.sourceMessageID);
      track({ type: 'user_reply', messageID: sent.messageID, sourceThreadID,
        reporterID, reporterName: handleReply.reporterName, adminThreadID: adminThreadID || String(event.threadID),
        adminMessageID: event.messageID });
      try { api.setMessageReaction('✅', event.messageID, () => {}, true); } catch (_) {}
    } catch (error) {
      console.error('[callad] admin reply failed:', error);
      try { api.setMessageReaction('❌', event.messageID, () => {}, true); } catch (_) {}
      await send(api, (labels[__l.language(event.threadID)] || labels.en).forwardFailed, event.threadID, event.messageID);
    }
    return;
  }

  if (handleReply.type !== 'user_reply' || !handleReply.adminThreadID) return;
  if (String(event.threadID) !== sourceThreadID || String(event.senderID) !== reporterID) return;
  const adminThreadID = String(handleReply.adminThreadID);
  const label = labels[__l.language(adminThreadID)] || labels.en;
  const reply = `╭┈ ❒ [ CALLAD 📩 ]\n├ ${label.from}: ${handleReply.reporterName || reporterID} (${reporterID})\n├ ${label.message}: ${text}\n╰┈➤ ${label.reply}`;
  try {
    const sent = await forward(api, reply, adminThreadID, handleReply.adminMessageID);
    track({ type: 'admin_reply', messageID: sent.messageID, adminThreadID,
      sourceThreadID, sourceMessageID: event.messageID, reporterID, reporterName: handleReply.reporterName });
  } catch (error) {
    console.error('[callad] user reply failed:', error);
    await send(api, (labels[__l.language(sourceThreadID)] || labels.en).forwardFailed, sourceThreadID, event.messageID);
  }
};

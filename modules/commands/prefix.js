'use strict';
const __l = require('../../includes/i18n');

module.exports.config = {
  name: 'prefix',
  version: '1.0.1',
  hasPermssion: 0,
  description: 'Auto response for prefix inquiries',
  usePrefix: false,
  allowPrefix: true,
  commandCategory: 'System',
  cooldowns: 3,
  credits: 'Jonell Magallanes'
};

const inquiries = new Set([
  'what is prefix', 'what is the prefix', 'prefix',
  'ano prefix', 'ano ang prefix', 'paano mag command',
  'how to use bot', 'command list', 'commands', 'bot prefix'
]);

function reply({ api, event }) {
  const prefix = global.config.PREFIX;
  const message = '╔══════════════════╗\n' +
    __l.t('m767') + '╚══════════════════╝\n\n' +
    __l.t('m768', [prefix]) + __l.t('m769', [prefix]) + __l.t('m770', [prefix]);
  // This is a local lookup: send the final answer once, without a placeholder,
  // edit, or reaction. Delivery failures must not trigger an automatic repost.
  return api.sendMessage(message, event.threadID, event.messageID);
}

module.exports.run = reply;

module.exports.handleEvent = async function ({ api, event }) {
  if (!['message', 'message_reply'].includes(event.type) || typeof event.body !== 'string') return;
  if (String(event.senderID) === String(api.getCurrentUserID())) return;
  if (global.client?.handleReply?.some(item =>
    String(item.messageID) === String(event.messageReply?.messageID))) return;

  const body = event.body.trim().toLowerCase().replace(/\s+/g, ' ');
  const prefix = String(global.config.PREFIX || '-').toLowerCase();
  const first = body.split(' ')[0];
  // Direct commands belong to handleCommand, including rejected/cooling-down
  // commands. Never answer again just because their arguments contain "prefix".
  if (body.startsWith(prefix) || body.startsWith('/') || first === 'prefix' ||
      global.client?.commands?.get(first)?.config?.usePrefix === false) return;
  if (!inquiries.has(body.replace(/[?!\.]+$/, '').trim())) return;
  return reply({ api, event });
};

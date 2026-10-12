'use strict';
module.exports.config = {
  "name": "mentions",
  "version": "1.0.0",
  "credits": "CHIA BOT",
  "hasPermssion": 0,
  "description": "Configure one-time mention reminders",
  "usePrefix": true,
  "commandCategory": "Smart Group",
  "usages": "[on [1-60 minutes] | off]",
  "cooldowns": 3
};
module.exports.run = ctx => require('../../includes/smartGroups').run('mentions', ctx);

Object.defineProperty(module.exports.config, 'description', { enumerable: true, get() {
  const lang = require('../../includes/i18n').language();
  const dict = require('../../includes/smartGroups/locales.json');
  return (dict[lang] || dict.en).mentions;
} });

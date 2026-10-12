'use strict';
module.exports.config = {
  "name": "assistant",
  "version": "1.0.0",
  "credits": "CHIA BOT",
  "hasPermssion": 0,
  "description": "AI conversation mode and questions",
  "usePrefix": true,
  "commandCategory": "Smart Group",
  "usages": "on|off|status|reset|ask <message>",
  "cooldowns": 2
};
module.exports.run = ctx => require('../../includes/smartGroups').run('assistant', ctx);

Object.defineProperty(module.exports.config, 'description', { enumerable: true, get() {
  const lang = require('../../includes/i18n').language();
  const dict = require('../../includes/smartGroups/locales.json');
  return (dict[lang] || dict.en).assistant;
} });

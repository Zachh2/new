'use strict';
module.exports.config = {
  "name": "smart",
  "version": "1.0.0",
  "credits": "CHIA BOT",
  "hasPermssion": 0,
  "description": "Group features and local history controls",
  "usePrefix": true,
  "commandCategory": "Smart Group",
  "usages": "[history on|off|clear]",
  "cooldowns": 3
};
module.exports.run = ctx => require('../../includes/smartGroups').run('smart', ctx);

Object.defineProperty(module.exports.config, 'description', { enumerable: true, get() {
  const lang = require('../../includes/i18n').language();
  const dict = require('../../includes/smartGroups/locales.json');
  return (dict[lang] || dict.en).smart;
} });

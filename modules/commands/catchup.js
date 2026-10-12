'use strict';
module.exports.config = {
  "name": "catchup",
  "version": "1.0.0",
  "credits": "CHIA BOT",
  "hasPermssion": 0,
  "description": "Show recent conversation highlights",
  "usePrefix": true,
  "commandCategory": "Smart Group",
  "usages": "[hours]",
  "cooldowns": 5
};
module.exports.run = ctx => require('../../includes/smartGroups').run('catchup', ctx);

Object.defineProperty(module.exports.config, 'description', { enumerable: true, get() {
  const lang = require('../../includes/i18n').language();
  const dict = require('../../includes/smartGroups/locales.json');
  return (dict[lang] || dict.en).catchup;
} });

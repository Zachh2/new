'use strict';
module.exports.config = {
  "name": "streak",
  "version": "4.0.0",
  "credits": "CHIA BOT",
  "hasPermssion": 0,
  "description": "Show your daily group streak",
  "usePrefix": true,
  "commandCategory": "Smart Group",
  "usages": "[recover]",
  "cooldowns": 3
};
module.exports.run = ctx => require('../../includes/smartGroups').run('streak', ctx);

Object.defineProperty(module.exports.config, 'description', { enumerable: true, get() {
  const lang = require('../../includes/i18n').language();
  const dict = require('../../includes/smartGroups/locales.json');
  return (dict[lang] || dict.en).streak;
} });

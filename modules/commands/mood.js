'use strict';
module.exports.config = {
  "name": "mood",
  "version": "1.0.0",
  "credits": "CHIA BOT",
  "hasPermssion": 0,
  "description": "Estimate recent group mood",
  "usePrefix": true,
  "commandCategory": "Smart Group",
  "usages": "",
  "cooldowns": 3
};
module.exports.run = ctx => require('../../includes/smartGroups').run('mood', ctx);

Object.defineProperty(module.exports.config, 'description', { enumerable: true, get() {
  const lang = require('../../includes/i18n').language();
  const dict = require('../../includes/smartGroups/locales.json');
  return (dict[lang] || dict.en).mood;
} });

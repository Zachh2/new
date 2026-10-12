'use strict';
module.exports.config = {
  "name": "personality",
  "version": "1.0.0",
  "credits": "CHIA BOT",
  "hasPermssion": 0,
  "description": "Choose the group bot personality",
  "usePrefix": true,
  "commandCategory": "Smart Group",
  "usages": "[formal|funny|chill|gaming|student|minimal]",
  "cooldowns": 3
};
module.exports.run = ctx => require('../../includes/smartGroups').run('personality', ctx);

Object.defineProperty(module.exports.config, 'description', { enumerable: true, get() {
  const lang = require('../../includes/i18n').language();
  const dict = require('../../includes/smartGroups/locales.json');
  return (dict[lang] || dict.en).personality;
} });

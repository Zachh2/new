'use strict';
module.exports.config = {
  "name": "tempban",
  "version": "1.0.0",
  "credits": "CHIA BOT",
  "hasPermssion": 1,
  "description": "Temporarily block commands for a group member",
  "usePrefix": true,
  "commandCategory": "Smart Group",
  "usages": "@member 1h",
  "cooldowns": 3
};
module.exports.run = ctx => require('../../includes/smartGroups').run('tempban', ctx);

Object.defineProperty(module.exports.config, 'description', { enumerable: true, get() {
  const lang = require('../../includes/i18n').language();
  const dict = require('../../includes/smartGroups/locales.json');
  return (dict[lang] || dict.en).ban;
} });

const __l = require("../../includes/i18n");
module.exports.config = {
  name: "sharecontact",
  version: "1.0.0",
  hasPermission: 0,
  credits: "Yan Maglinte",
  description: "Share a contact of a certain userID",
  usePrefix: true, 
  commandCategory: "message",
  cooldowns: 5 
};

module.exports.run = function ({ api, event }) {
  api.shareContact(__l.t("m821"), event.senderID, event.threadID, (err, data) => {
    if (err) console.log(err);
  })
};
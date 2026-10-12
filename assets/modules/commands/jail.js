const __l = require("../../includes/i18n");

module.exports.config = {
  name: "jail",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "CHIA BOT",
  description: "Jail someone 🔒",
  descriptionKey: "cmd.jail.description",
  usePrefix: true,
  usages: "[mention or reply]",
  usagesKey: "cmd.image.usage",
  commandCategory: "fun",
  cooldowns: 5
};


module.exports.run = async function ({ api, event }) {

  const { threadID, messageID } = event;
  const t = (key, values = []) => __l.t(key, values, __l.language(threadID));

  const axios = require("axios");
  const fs = require("fs-extra");
  const path = require("path");




  let targetID = null;


  // Mention
  let mentions = Object.keys(event.mentions || {});

  if (mentions.length > 0) {
    targetID = mentions[0];
  }


  // Reply
  if (!targetID && event.messageReply?.senderID) {
    targetID = event.messageReply.senderID;
  }


  if (!targetID) {

    return api.sendMessage(
`╭┈ ❒ [ JAIL 🔒 ]

├ ${t("cmd.image.target")}

╰┈➤ ${t("cmd.image.example", [global.config?.PREFIX || "-", "jail"])}`,
      threadID,
      messageID
    );

  }


  const file = path.join(
    __dirname,
    "cache",
    `jail_${threadID}_${Date.now()}.png`
  );


  const react = (e)=>{
    try{
      api.setMessageReaction(
        e,
        messageID,
        ()=>{},
        true
      );
    }catch{}
  };


  react("⏳");


  try {


    const res = await axios.get(
`https://betadash-api-swordslush-production.up.railway.app/jail?userid=${targetID}`,
      {
        responseType: "arraybuffer", timeout: 30000
      }
    );


    fs.ensureDirSync(
      path.join(__dirname,"cache")
    );


    fs.writeFileSync(
      file,
      res.data
    );


    react("🔒");


    return api.sendMessage(
      {
        body:
`╭┈ ❒ [ JAIL 🔒 ]

├ ${t("cmd.image.ready")}
├ ${t("cmd.image.userID", [targetID])}

╰┈➤ CHIA BOT`,
        attachment:
          fs.createReadStream(file)
      },
      threadID,
      ()=>{
        if(fs.existsSync(file))
          fs.unlinkSync(file);
      },
      messageID
    );


  } catch(err){


    console.log(
      "JAIL ERROR:",
      err.message
    );


    react("❌");


    return api.sendMessage(
`╭┈ ❒ [ JAIL ❌ ]

├ ${t("cmd.image.failed")}

╰┈➤ CHIA BOT`,
      threadID,
      messageID
    );

  }

};
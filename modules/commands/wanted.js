const __l = require("../../includes/i18n");

module.exports.config = {
  name: "wanted",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "CHIA BOT",
  description: "Wanted poster",
  descriptionKey: "cmd.wanted.description",
  usePrefix: true,
  usages: "[mention or reply]",
  usagesKey: "cmd.image.usage",
  commandCategory: "fun",
  cooldowns: 5
};


module.exports.run = async function ({ api, event }) {

  const { threadID, messageID } = event;
  const t = (key, values = []) => __l.t(key, values, __l.language(threadID));

  const fs = require("fs-extra");
  const path = require("path");
  const axios = require("axios");




  let targetID;


  // mention
  const mentions = Object.keys(event.mentions || {});

  if (mentions.length > 0) {
    targetID = mentions[0];
  }


  // reply
  else if (event.messageReply?.senderID) {
    targetID = event.messageReply.senderID;
  }


  else {
    return api.sendMessage(
`╭┈ ❒ [ WANTED ⭐ ]

├ ${t("cmd.image.target")}

╰┈━━━━━━━━━━━`,
threadID,
messageID
    );
  }


  const file = path.join(
    __dirname,
    "cache",
    `wanted_${threadID}_${Date.now()}.png`
  );


  const react = (e)=>{
    try {
      api.setMessageReaction(
        e,
        messageID,
        ()=>{},
        true
      );
    } catch {}
  };


  react("⏳");


  try {


    const res = await axios.get(
`https://betadash-api-swordslush-production.up.railway.app/wanted?userid=${targetID}`,
{
 responseType: "arraybuffer", timeout: 30000
}
    );


    fs.ensureDirSync(path.dirname(file));
    fs.writeFileSync(
      file,
      res.data
    );


    react("✅");


    return api.sendMessage(
{
body:
`╭┈ ❒ [ WANTED ⭐ ]

├ ${t("cmd.image.ready")}
├ ${t("cmd.image.userID", [targetID])}

╰┈━━━━━━━━━━━`,
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
      "WANTED ERROR:",
      err.message
    );


    react("❌");


    return api.sendMessage(
`╭┈ ❒ [ WANTED ❌ ]

├ ${t("cmd.image.failed")}

╰┈━━━━━━━━━━━`,
threadID,
messageID
    );

  }

};
const __l = require("../../includes/i18n");

module.exports.config = {
  name: "nigga",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "CHIA BOT",
  description: "Generate image",
  descriptionKey: "cmd.nigga.description",
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


  // Mention
  const mentions = Object.keys(event.mentions || {});

  if (mentions.length > 0) {
    targetID = mentions[0];
  }


  // Reply
  else if (event.messageReply?.senderID) {
    targetID = event.messageReply.senderID;
  }


  else {

    return api.sendMessage(
`╭┈ ❒ [ ${t("cmd.image.title")} 🎭 ]

├ ${t("cmd.image.target")}

╰┈━━━━━━━━━━━`,
threadID,
messageID
    );

  }


  const file = path.join(
    __dirname,
    "cache",
    `nigga_${threadID}_${Date.now()}.png`
  );


  try {


    api.setMessageReaction(
      "⏳",
      messageID,
      ()=>{},
      true
    );


    const res = await axios.get(
`https://betadash-api-swordslush-production.up.railway.app/nigga?userid=${targetID}`,
{
 responseType: "arraybuffer", timeout: 30000
}
    );


    fs.ensureDirSync(path.dirname(file));
    fs.writeFileSync(
      file,
      res.data
    );


    api.setMessageReaction(
      "✅",
      messageID,
      ()=>{},
      true
    );


    return api.sendMessage(
{
body:
`╭┈ ❒ [ ${t("cmd.image.title")} 🎭 ]

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


  } catch(err) {


    console.log(
      "NIGGA ERROR:",
      err.message
    );


    return api.sendMessage(
`╭┈ ❒ [ ${t("cmd.image.title")} ❌ ]

├ ${t("cmd.image.failed")}

╰┈━━━━━━━━━━━`,
threadID,
messageID
    );

  }

};
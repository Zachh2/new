const __l = require("../../includes/i18n");

module.exports.config = {
  name: "kiss",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "CHIA BOT",
  description: "Kiss two users 💋",
  descriptionKey: "cmd.kiss.description",
  usePrefix: true,
  usages: "[mention or reply]",
  usagesKey: "cmd.image.usage",
  commandCategory: "fun",
  cooldowns: 5
};


module.exports.run = async function ({ api, event }) {

  const { threadID, messageID, senderID } = event;
  const t = (key, values = []) => __l.t(key, values, __l.language(threadID));

  const fs = require("fs-extra");
  const path = require("path");
  const axios = require("axios");




  let uids = [];


  // GET MENTIONS
  for (const id in (event.mentions || {})) {
    uids.push(id);
  }


  let user1, user2;


  // LOGIC
  if (uids.length >= 2) {

    user1 = uids[0];
    user2 = uids[1];

  } else if (uids.length === 1) {

    user1 = senderID;
    user2 = uids[0];

  } else if (event.messageReply?.senderID) {

    user1 = senderID;
    user2 = event.messageReply.senderID;

  } else {

    return api.sendMessage(
      `╭┈ ❒ [ KISS 💋 ]\n├ ${t("cmd.image.target")}\n╰┈➤ ${t("cmd.image.example", [global.config?.PREFIX || "-", "kiss"])}`,
      threadID,
      messageID
    );

  }


  const file = path.join(
    __dirname,
    "cache",
    `kiss_${threadID}_${Date.now()}.png`
  );


  const sendWait = (t) =>
    global.editMsgDisabled
      ? Promise.resolve(null)
      : new Promise(r =>
          api.sendMessage(
            t,
            threadID,
            (e, i) => r(e ? null : i),
            messageID
          )
        );


  const react = (e) => {
    try {
      api.setMessageReaction(
        e,
        messageID,
        () => {},
        true
      );
    } catch {}
  };


  const format = (t, ok) => {
    const s = String(t);

    return /╭┈|╰┈/.test(s)
      ? s
      : `╭┈ ❒ [ KISS ${ok ? "💋" : "❌"} ]\n├ ${s}\n╰┈━━━━━━━━━━━`;
  };


  const edit = (text, info, ok = true) => {

    const bad = !ok;


    const msg = format(text, !bad);


    if (info)
      api.editMessage(
        msg,
        info.messageID,
        threadID
      );
    else
      api.sendMessage(
        msg,
        threadID,
        messageID
      );


    react(bad ? "❌" : "💋");

  };


  react("⏳");


  const info = await sendWait(
`╭┈ ❒ [ KISS 💋 ]
├ ${t("cmd.image.wait")}
╰┈━━━━━━━━━━━`
  );


  try {


    const apiURL =
`https://betadash-api-swordslush-production.up.railway.app/kiss?userid1=${user1}&userid2=${user2}`;


    const res = await axios.get(
      apiURL,
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


    edit(
      "💋 " + t("cmd.image.ready"),
      info
    );


    return api.sendMessage(
      {
        attachment:
          fs.createReadStream(file)
      },
      threadID,
      () => {
        if(fs.existsSync(file))
          fs.unlinkSync(file);
      },
      messageID
    );


  } catch(err) {


    console.error(
      "KISS ERROR:",
      err.message
    );


    if(fs.existsSync(file))
      fs.unlinkSync(file);


    return edit(
      t("cmd.image.failed"),
      info, false
    );

  }

};
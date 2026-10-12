const __l = require("../../includes/i18n");
module.exports.config = {
  name: "pay",
  version: "6.0.0",
  hasPermssion: 0,
  credits: "Zycke",
  description: "Send money",
  usePrefix: true,
  commandCategory: "economy",
  cooldowns: 5,
  dependencies: {
    "fs-extra": ""
  }
};

module.exports.run = async function ({ api, event, args }) {
  const fs = global.nodemodule["fs-extra"];
  const path = require("path");

  const { threadID, messageID, senderID } = event;
  const usersDataPath = path.join(__dirname, "..", "..", "includes", "database", "data", "usersData.json");

  if (!fs.existsSync(usersDataPath)) {
    return api.sendMessage(__l.t("m383"), threadID);
  }

  let usersData = JSON.parse(fs.readFileSync(usersDataPath, 'utf8'));

  if (!usersData[senderID]) {
    usersData[senderID] = {
      userID: senderID,
      money: 0,
      exp: 0,
      createTime: { timestamp: Date.now() },
      data: { timestamp: Date.now() },
      lastUpdate: Date.now()
    };
  }

  let uid;

  if (Object.keys(event.mentions).length > 0) {
    uid = Object.keys(event.mentions)[0];
  } else if (event.type == "message_reply") {
    uid = event.messageReply.senderID;
  } else {
    const threadInfo = await api.getThreadInfo(threadID);
    const nameInput = args.slice(0, -1).join(" ").toLowerCase();

    const found = threadInfo.userInfo.find(u =>
      u.name.toLowerCase().includes(nameInput)
    );

    if (found) uid = found.id;
  }

  if (!uid) {
    return api.sendMessage(
__l.t("m682"),
      threadID,
      messageID
    );
  }

  if (!usersData[uid]) {
    usersData[uid] = {
      userID: uid,
      money: 0,
      exp: 0,
      createTime: { timestamp: Date.now() },
      data: { timestamp: Date.now() },
      lastUpdate: Date.now()
    };
  }

  const amount = parseInt(args.filter(a => !isNaN(a)).pop());

  if (isNaN(amount) || amount <= 0) {
    return api.sendMessage(
__l.t("m683"),
      threadID,
      messageID
    );
  }

  if (usersData[senderID].money < amount) {
    return api.sendMessage(
__l.t("m684", [usersData[senderID].money]),
      threadID,
      messageID
    );
  }

  const tax = Math.floor(amount * 0.15);
  const receive = amount - tax;

  async function notify(userID, userData) {
    try {
      const info = await api.getUserInfo(userID);
      const name = info[userID].name;

      if (userData.money >= 10000 && !userData.notified10k) {
        userData.notified10k = true;
        api.sendMessage(__l.t("m685", [name]), threadID);
      }

      if (userData.money >= 1000000 && !userData.notified1m) {
        userData.notified1m = true;
        api.sendMessage(__l.t("m686", [name]), threadID);
      }
    } catch {}
  }

  api.sendMessage(
__l.t("m687"),
  threadID, (err, info) => {

    if (err) return;

    setTimeout(() => {
      api.editMessage(
__l.t("m688"),
      info.messageID,
      threadID);
    }, 1500);

    setTimeout(async () => {
      usersData[senderID].money -= amount;
      usersData[uid].money += receive;
      usersData[senderID].lastUpdate = Date.now();
      usersData[uid].lastUpdate = Date.now();

      await notify(senderID, usersData[senderID]);
      await notify(uid, usersData[uid]);

      fs.writeFileSync(usersDataPath, JSON.stringify(usersData, null, 4));

      api.editMessage(
__l.t("m689", [amount, tax, receive, usersData[senderID].money]),
      info.messageID,
      threadID);

    }, 3000);

  });
};
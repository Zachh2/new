const __l = require("../../includes/i18n");
module.exports.config = {
  name: "top",
  version: "5.0.0",
  credits: "Zycke (fully fixed)",
  hasPermssion: 0,
  description: "Top richest",
  usePrefix: true,
  commandCategory: "economy",
  cooldowns: 5,
  dependencies: { "fs-extra": "" }
};

// ✅ Infinite formatter
function formatMoney(num) {
  if (!isFinite(num)) return "∞";

  const units = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  let unitIndex = 0;

  while (num >= 1000 && unitIndex < units.length - 1) {
    num /= 1000;
    unitIndex++;
  }

  // if exceeds defined units → infinite
  if (unitIndex >= units.length - 1 && num >= 1000) {
    return "∞";
  }

  return num.toFixed(1).replace(/\.0$/, "") + units[unitIndex];
}

module.exports.run = async function({ api, event }) {
  const fs = global.nodemodule["fs-extra"];
  const path = require("path");
  const { threadID } = event;

  const usersDataPath = path.join(
    __dirname,
    "..",
    "..",
    "includes",
    "database",
    "data",
    "usersData.json"
  );

  // ❌ No database
  if (!fs.existsSync(usersDataPath)) {
    return api.sendMessage(__l.t("m451"), threadID);
  }

  // ❌ Broken JSON protection
  let usersData;
  try {
    usersData = JSON.parse(fs.readFileSync(usersDataPath, "utf8"));
  } catch (e) {
    return api.sendMessage(__l.t("m932"), threadID);
  }

  // ✅ Clean + fix money values
  let users = Object.keys(usersData)
    .map(id => {
      let money = Number(usersData[id]?.money);

      // fix invalid values
      if (isNaN(money) || money < 0) money = 0;

      return { id, money };
    })
    .filter(user => user.money > 0)
    .sort((a, b) => b.money - a.money)
    .slice(0, 5); // change/remove if you want more

  if (users.length === 0) {
    return api.sendMessage(__l.t("m933"), threadID);
  }

  // ⏳ Loading message
  api.sendMessage(
    __l.t("m934"),
    threadID,
    async (err, info) => {
      let msg = __l.t("m935");

      for (let i = 0; i < users.length; i++) {
        let name = "Unknown";

        try {
          const userInfo = await api.getUserInfo(users[i].id);
          name = userInfo[users[i].id]?.name || "Unknown";
        } catch {
          name = users[i].id;
        }

        const formattedMoney = formatMoney(users[i].money);

        msg += __l.t("m936", [i + 1, name, formattedMoney]);
      }

      setTimeout(() => {
        api.editMessage(msg, info.messageID, threadID);
      }, 1200);
    }
  );
};
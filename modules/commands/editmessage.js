const __l = require("../../includes/i18n");
const fs = require("fs-extra");
const path = require("path");

const STATE = path.join(__dirname, "cache", "editmsg.json");

// Restore the saved setting as soon as this module is loaded, so the choice
// survives a bot restart. Every command's edit helper reads this same global.
function load() {
  try {
    const d = JSON.parse(fs.readFileSync(STATE, "utf8"));
    global.editMsgDisabled = !!d.disabled;
  } catch (e) {
    global.editMsgDisabled = false;
  }
  return global.editMsgDisabled;
}

function save(disabled) {
  global.editMsgDisabled = !!disabled;
  try {
    fs.ensureDirSync(path.dirname(STATE));
    fs.writeFileSync(STATE, JSON.stringify({ disabled: !!disabled }, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

// help.js re-requires every command file, which re-runs this module. Only load
// from disk when the flag has never been set, so a live toggle is never clobbered.
if (typeof global.editMsgDisabled === "undefined") load();

module.exports.config = {
  name: "editmsg",
  version: "1.0.0",
  hasPermssion: 2,
  credits: "Zach",
  description: "Turn the live edit-message behaviour on or off for every command",
  usePrefix: true,
  commandCategory: "Admin",
  usages: "[on | off | status]",
  cooldowns: 3,
  dependencies: {
    "fs-extra": ""
  }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;

  const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };
  const send = (t) => api.sendMessage(t, threadID, messageID);

  // lines already end with their own ╰┈➤ closer — don't add a second footer
  const box = (tag, lines) =>
    `╭┈ ❒ [ EDITMSG ${tag} ]\n` + lines.join("\n");

  const arg = (args[0] || "").toLowerCase();
  const isOff = global.editMsgDisabled === true;

  if (!arg || arg === "status") {
    react("✅");
    return send(box(isOff ? "OFF" : "ON", [
      __l.t("m411", [isOff ? "DISABLED" : "ENABLED"]),
      __l.t("m412", [isOff ? "one message per result" : "loading message edits into the result"]),
      __l.t("m415", [global.config?.PREFIX || "/"])
    ]));
  }

  if (arg === "on" || arg === "enable" || arg === "true") {
    if (!isOff) {
      react("✅");
      return send(box("ON", [__l.t("m416"), __l.t("m417")]));
    }
    const ok = save(false);
    react(ok ? "✅" : "❌");
    return send(box(ok ? "ON" : "❌", ok
      ? [__l.t("m418"), __l.t("m419"), __l.t("m420")]
      : [__l.t("m421"), __l.t("m422")]));
  }

  if (arg === "off" || arg === "disable" || arg === "false") {
    if (isOff) {
      react("✅");
      return send(box("OFF", [__l.t("m423"), __l.t("m417")]));
    }
    const ok = save(true);
    react(ok ? "✅" : "❌");
    return send(box(ok ? "OFF" : "❌", ok
      ? [__l.t("m424"), __l.t("m425"), __l.t("m426")]
      : [__l.t("m421"), __l.t("m422")]));
  }

  react("❌");
  return send(box("❌", [
    __l.t("m427") + arg,
    __l.t("m428")
  ]));
};
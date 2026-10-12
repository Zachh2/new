module.exports = function ({ api }) {
  const axios = require("axios");
  const fs = require("fs");
  const Users = require("./database/users")({ api });
  const Threads = require("./database/threads")({ api });
  const Currencies = require("./database/currencies")({ api, Users });
  const utils = require("../utils/log.js");
  const { getThemeColors } = utils;
  const { main, subcolor, secondary } = getThemeColors();
  //////////////////////////////////////////////////////////////////////
  //========= Push all variable from database to environment =========//
  //////////////////////////////////////////////////////////////////////

  const environmentReady = (async function () {
    try {
      const [threads, users] = await Promise.all([
        Threads.getAll(),
        Users.getAll(["userID", "name", "data"]),
      ]);
      threads.forEach((data) => {
        const idThread = String(data.threadID || data.threadInfo?.threadID);
        global.data.allThreadID.push(idThread);
        global.data.threadData.set(idThread, data.data || {});
        global.data.threadInfo.set(idThread, data.threadInfo || {});
        if (data.data && data.data.banned) {
          global.data.threadBanned.set(idThread, {
            reason: data.data.reason || "",
            dateAdded: data.data.dateAdded || "",
          });
        }
        if (
          data.data &&
          data.data.commandBanned &&
          data.data.commandBanned.length !== 0
        ) {
          global.data.commandBanned.set(idThread, data.data.commandBanned);
        }
        if (data.data && data.data.NSFW) {
          global.data.threadAllowNSFW.push(idThread);
        }
      });
      users.forEach((dataU) => {
        const idUsers = String(dataU.userID);
        global.data.allUserID.push(idUsers);
        if (dataU.name && dataU.name.length !== 0) {
          global.data.userName.set(idUsers, dataU.name);
        }
        if (dataU.data && dataU.data.banned) {
          global.data.userBanned.set(idUsers, {
            reason: dataU.data.reason || "",
            dateAdded: dataU.data.dateAdded || "",
          });
        }
        if (
          dataU.data &&
          dataU.data.commandBanned &&
          dataU.data.commandBanned.length !== 0
        ) {
          global.data.commandBanned.set(idUsers, dataU.data.commandBanned);
        }
      });
      if (global.config.autoCreateDB) {
        global.loading.log(
          `Successfully loaded ${secondary(`${global.data.allThreadID.length}`)} threads and ${secondary(`${global.data.allUserID.length}`)} users`,
          "LOADED",
        );
      }
    } catch (error) {
      global.loading.log(
        `Can't load environment variable, error: ${error}`,
        "error",
      );
    }
  })();

  global.loading.log(
    `${main(`[ BOT_INFO ]`)} success!\n${subcolor(`[ LOADED ] `)}${main(`[ NAME ]:`)} ${!global.config.BOTNAME ? "Bot Messenger" : global.config.BOTNAME} \n${subcolor(`[ LOADED ] `)}${main(`[ BotID ]: `)}${api.getCurrentUserID()}\n${subcolor(`[ LOADED ] `)}${main(`[ PREFIX ]:`)} ${global.config.PREFIX}`,
    "LOADED",
  );

  const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
  const v = pkg.version;
  axios
    .get("https://raw.githubusercontent.com/YANDEVA/BotPack/main/package.json")
    .then((response) => {
      const gitVersion = response.data.version;

      if (compareVersions(gitVersion, v) > 0) {
        global.loading.log(
          `Version ${subcolor(gitVersion)} is available! Consider checking out '${secondary("https://github.com/YANDEVA/BotPack")}' for the latest updates.`,
          "UPDATE",
        );
      } else {
        global.loading.log("Bot is currently up-to-date.", "UPDATE");
      }
    })
    .catch((error) => {
      console.error("Error fetching GitHub package.json:", error);
    });

  function compareVersions(a, b) {
    const versionA = a.split(".").map(Number);
    const versionB = b.split(".").map(Number);

    for (let i = 0; i < versionA.length; i++) {
      if (versionA[i] > versionB[i]) return 1;
      if (versionA[i] < versionB[i]) return -1;
    }
    return 0;
  }

  // The second ASCII banner ("ZACH BOT" + credits) used to print here, on top
  // of the one main.js already prints at boot. Both branches of that check ran
  // botLog() anyway, so it only ever duplicated the banner.
  ///////////////////////////////////////////////
  //========= Require all handle need =========//
  //////////////////////////////////////////////
  const runObj = {
    api,
    Users,
    Threads,
    Currencies,
    onCommand: (event, name) => smartGroups.recordCommand(event, name),
  };

  const handleCommand = require("./handle/handleCommand")(runObj);
  const handleCommandEvent = require("./handle/handleCommandEvent")(runObj);
  const handleReply = require("./handle/handleReply")(runObj);
  const handleReaction = require("./handle/handleReaction")(runObj);
  const handleEvent = require("./handle/handleEvent")(runObj);
  const handleRefresh = require("./handle/handleRefresh")(runObj);
  const handleCreateDatabase = require("./handle/handleCreateDatabase")(runObj);

  // (Removed: a leftover licence check that read includes/login/utils.js and
  // looked for a hidden string. Both branches did nothing, and it referenced a
  // variable that no longer exists - which threw before the listener was ever
  // returned, so the bot sat "online" while handling no messages at all.)
  //////////////////////////////////////////////////
  //========= Send event to handle need =========//
  /////////////////////////////////////////////////

  const onboarding = require("./onboarding");
  const i18n = require("./i18n");
  const logIncomingRequest = require("./requestLog");
  const beginTyping = require("./typingIndicator")(api);
  const commandSpam = require("./commandSpam");
  console.log("[command-spam] Connected: 5 commands / 5 seconds -> warning; continued spam -> 2-hour ban.");
  const smartGroups = require("./smartGroups").attach({ api, Users, Threads, Currencies });
  const receivedMessages = new Map();
  return (event) => i18n.run(event.threadID, async () => {
    if (event.messageID && ["message", "message_reply"].includes(event.type)) {
      const key = String(event.threadID) + ":" + event.messageID;
      const now = Date.now();
      if (receivedMessages.has(key) && now - receivedMessages.get(key) < 300000) return;
      receivedMessages.set(key, now);
      if (receivedMessages.size > 5000) receivedMessages.delete(receivedMessages.keys().next().value);
    }
    await environmentReady;
    logIncomingRequest(event, { api, Users });
    const originalEvent = event;
    event = smartGroups.prepare(event);
    // Every routed natural-language/AI command still passes the original ban and permission checks.
    if (await smartGroups.blocked(event)) return;
    // Block command spam before typing, cooldown UI, replies, or command execution.
    if (await commandSpam.gate(api, event)) return;
    const stopTyping = beginTyping(event);
    try {
      if (await onboarding.gate(api, event)) {
        if (event.type === "event") await handleRefresh({ event });
        return;
      }
      const originalIsCommand = originalEvent.body && (String(originalEvent.body).trim().startsWith(global.config.PREFIX || "-") || String(originalEvent.body).trim().startsWith("/") || (!event._smartAuto && event._smartSynthetic));
      const firstWord=String(originalEvent.body||'').trim().split(/\s+/)[0].toLowerCase();
      const nativeNoPrefix=global.client.commands?.get(firstWord)?.config?.usePrefix===false;
      const priorSeen = await smartGroups.observe(originalEvent, { command: !!originalIsCommand || nativeNoPrefix });
      event = { ...event, _smartPriorSeen: priorSeen };
      const listenObj = { event };
      switch (event.type) {
        case "message":
        case "message_reply":
        case "message_unsend":
          // An admin reply to a report is a callad continuation, even when
          // its text happens to start with the command prefix.
          if (event.type === "message_reply" && global.client?.handleReply?.some(reply =>
            reply.name === "callad" && String(reply.messageID) === String(event.messageReply?.messageID))) {
            await handleReply(listenObj);
            break;
          }
          await handleCreateDatabase(listenObj);
          await handleCommand(listenObj);
          if (event._smartSynthetic) break;
          await handleReply(listenObj);
          await handleCommandEvent(listenObj);
          break;
        case "change_thread_image":
          break;
        case "event":
          await handleEvent(listenObj);
          await handleRefresh(listenObj);
          break;
        case "message_reaction":
          await handleReaction(listenObj);
          break;
        default:
          break;
      }
    } finally {
      stopTyping();
    }
  }).catch(err => console.error("[listener]", err.message));
};

/** 
THIZ BOT WAS MADE BY ME(CATALIZCS) AND MY BROTHER SPERMLORD - DO NOT STEAL MY CODE (つ ͡ ° ͜ʖ ͡° )つ ✄ ╰⋃╯
THIZ FILE WAS MODIFIED BY ME(@YanMaglinte) - DO NOT STEAL MY CREDITS (つ ͡ ° ͜ʖ ͡° )つ ✄ ╰⋃╯
THIZ FILE WAS MODIFIED BY ANOTHER PERSON(@lianecagara) - box MIT 🫨
**/

const __l = require("../i18n");
let activeCmd = false;

// ---------------------------------------------------------------------------
// "Executing… please wait" → edited in place
//
// Commands post a ⏳ box, then call __edit() to replace it with the result.
// But their error paths (wrong syntax, no permission, bad input) call
// api.sendMessage directly, so the ⏳ box was left hanging and a second,
// unstyled message appeared under it.
//
// Every command now runs with an api wrapper: it remembers the ⏳ message the
// command posted, and turns that command's next plain-text sendMessage into an
// edit of it, wrapped in the command's own box. Commands using __edit are
// unaffected; attachments and later messages go out normally.
// ---------------------------------------------------------------------------
const WAIT_BOX = /Executing\.\.\.|please wait|Loading commands|sandali lang|nilo-load ang mga command/i;
const BAD_NEWS = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid|not syntax correct|no permission|You have no/;

function wrapApiForCommand(api, commandName, event) {
  let waitID = null;       // the ⏳ message this command posted
  let replaced = false;    // only the first reply replaces it

  const proxy = Object.create(api);

  proxy.sendMessage = function (msg, threadID, callback, replyToMessageID, isGroup) {
    const text = typeof msg === "string" ? msg
      : (msg && typeof msg === "object" && !msg.attachment && typeof msg.body === "string") ? msg.body
      : null;

    // the command's own ⏳ placeholder - let it through, remember its ID
    if (text && waitID === null && WAIT_BOX.test(text)) {
      return api.sendMessage(msg, threadID, (err, info) => {
        if (!err && info && info.messageID) waitID = info.messageID;
        if (typeof callback === "function") callback(err, info);
      }, replyToMessageID, isGroup);
    }

    // first plain reply afterwards → edit the placeholder instead
    if (text && waitID && !replaced && String(threadID) === String(event.threadID)) {
      replaced = true;
      const boxed = /[╭╰━┈]/.test(text)
        ? text
        : `╭┈ ❒ [ ${String(commandName).toUpperCase()} ${BAD_NEWS.test(text) ? "❌" : "✅"} ]\n├ ${text.split("\n").join("\n├ ")}\n╰┈━━━━━━━━━━━`;
      const id = waitID;
      const pending = new Promise((resolve, reject) => {
        let settled = false;
        function done(err) {
          if (settled) return;
          settled = true;
          const info = { messageID: id, threadID };
          if (err) {
            // An edit may have reached Facebook even when its ACK is lost.
            // A missing/removed message must not be recreated automatically.
            const failure = new Error('Command reply edit failed; no replacement sent');
            failure.code = 'COMMAND_REPLY_EDIT_FAILED';
            failure.commandReplyAttempted = true;
            console.warn('[command-reply] Edit failed or unconfirmed; no replacement sent.');
            if (typeof callback === 'function') { try { callback(failure); } catch (_) {} }
            reject(failure);
          } else {
            if (typeof callback === 'function') { try { callback(null, info); } catch (_) {} }
            resolve(info);
          }
        }
        try {
          const edited = api.editMessage(boxed, id, done);
          if (edited && typeof edited.then === 'function') {
            edited.then(result => { if (result !== undefined) done(null); }, done);
          }
        } catch (err) { done(err); }
      });
      // Callback-style callers may ignore the returned Promise.
      if (typeof callback === 'function') pending.catch(() => {});
      return pending;
    }

    return api.sendMessage(msg, threadID, callback, replyToMessageID, isGroup);
  };

  return proxy;
}

const unknownNotice = new Map();   // threadID:senderID -> last "command not found" reply

// Greeting that matches the time of day in Manila, used in the
// "command not found" reply so it reads like the rest of the bot.
function greetingNow(moment) {
  const hour = Number(moment.tz("Asia/Manila").format("HH"));
  if (hour < 5)  return { text: __l.t("m1150"),   emoji: "\u{1F319}" };   // late night
  if (hour < 12) return { text: __l.t("m1151"),   emoji: "\u{1F305}" };
  if (hour < 18) return { text: __l.t("m1152"), emoji: "\u2600\uFE0F" };
  return { text: __l.t("m1150"), emoji: "\u{1F306}" };
}

// ---------------------------------------------------------------------------
// LIVE COOLDOWN
//
// Running a command during its cooldown used to get a single ⏳ reaction and
// nothing else, so people just kept typing. Now they get a box with the time
// left that counts itself down and says when it's ready.
//
// Kept cheap on purpose: one countdown per person per thread, an edit a second
// at most, and a hard cap on edits - every edit is a request to Facebook.
// ---------------------------------------------------------------------------
const liveCooldowns = new Set();          // "thread:user:command" being counted

function cooldownBar(left, total) {
  const slots = 10;
  const done = Math.max(0, Math.min(slots, Math.round((1 - left / total) * slots)));
  return "▓".repeat(done) + "░".repeat(slots - done);
}

function cooldownBox(name, left, total, prefix, ready) {
  const secs = (left / 1000).toFixed(1);
  if (ready) {
    return [
      __l.t("m1153"),
      __l.t("m1154", [prefix, name]),
      __l.t("m1155")
    ].join("\n");
  }
  return [
    __l.t("m1156"),
    __l.t("m1157", [prefix, name]),
    __l.t("m1158", [cooldownBar(left, total), secs]),
    __l.t("m1159")
  ].join("\n");
}

function startCooldownCountdown(api, event, command, endsAt, total) {
  const cfg = (global.config && global.config.cooldownUI) || {};
  if (cfg.enabled === false) return false;

  const key = `${event.threadID}:${event.senderID}:${command}`;
  if (liveCooldowns.has(key)) return true;          // already counting for them
  liveCooldowns.add(key);

  const prefix = global.config.PREFIX;
  const maxEdits = Math.max(1, Math.min(Number(cfg.maxEdits) || 6, 15));
  const live = cfg.live !== false && global.editMsgDisabled !== true;

  // editMessage in fbvibex publishes over the MQTT socket and THROWS
  // ("Not connected to MQTT") the moment that socket is down - mid-reconnect,
  // for instance. Thrown from inside setInterval that takes the bot with it,
  // and any error it reports otherwise used to vanish silently. So: every edit
  // goes through here, failures are logged, and two in a row stop the
  // countdown instead of repeating a broken call.
  let failures = 0;
  function edit(messageID, text, done) {
    try {
      api.editMessage(text, messageID, (err) => {
        if (err) {
          failures++;
          console.log('[cooldown] edit failed: ' + ((err && (err.error || err.message)) || err));
        } else {
          failures = 0;
        }
        if (typeof done === 'function') done(err);
      });
    } catch (e) {
      failures++;
      console.log('[cooldown] edit threw: ' + ((e && e.message) || e));
      if (typeof done === 'function') done(e);
    }
    return failures < 2;
  }

  api.sendMessage(
    cooldownBox(command, endsAt - Date.now(), total, prefix, false),
    event.threadID,
    (err, info) => {
      if (err || !info || !info.messageID) {
        console.log('[cooldown] could not send the countdown: ' + ((err && (err.error || err.message)) || 'no message id'));
        liveCooldowns.delete(key);
        return;
      }

      // one message, edited once at the end
      if (!live) {
        setTimeout(() => {
          edit(info.messageID, cooldownBox(command, 0, total, prefix, true));
          liveCooldowns.delete(key);
        }, Math.max(0, endsAt - Date.now()));
        return;
      }

      let edits = 0;
      const tick = setInterval(() => {
        const left = endsAt - Date.now();

        if (left <= 0 || edits >= maxEdits || failures >= 2) {
          clearInterval(tick);
          edit(info.messageID, cooldownBox(command, 0, total, prefix, true));
          liveCooldowns.delete(key);
          return;
        }
        edits++;
        edit(info.messageID, cooldownBox(command, left, total, prefix, false));
      }, Math.max(1000, Math.floor(total / maxEdits)));
    },
    event.messageID
  );
  return true;
}

// Builds the boxed reply the bot uses everywhere, with the greeting line.
async function buildBox(senderID, Users, moment, middleLines) {
  const greet = greetingNow(moment);
  let who = global.data.userName.get(senderID);
  if (!who && Users && typeof Users.getNameUser === "function") {
    try { who = await Users.getNameUser(senderID); } catch (e) {}
  }
  who = firstName(who);

  const PREFIX = global.config.PREFIX;
  const botName = String(global.config.BOTNAME || "BOT").toUpperCase();
  const lines = [
    `\u256D\u2508 \u2752 [ ${botName} \u2753 ]`,
    `\u251C ${greet.emoji} ${greet.text}${who ? ", " + who : ""}!`,
    ...middleLines,
    __l.t("m1164", [PREFIX]),
  ];
  return lines.join("\n");
}

function firstName(full) {
  if (!full) return null;
  const clean = String(full).trim();
  // never greet someone as "Facebook user" / "Unknown" - just drop the name
  if (/^(facebook user|unknown|user id|null|undefined)/i.test(clean)) return null;
  const first = clean.split(/\s+/)[0];
  return first && first.length > 1 ? first : clean;
}
const cooldownNoticed = new Map(); // command:senderID -> cooldown already signalled


module.exports = function ({ api, models, Users, Threads, Currencies, ...rest }) {
  const runningCommands = new Set();
  const stringSimilarity = require("string-similarity");
  const moment = require("moment-timezone");
  const logger = require("../../utils/log");

  return async function ({ event, ...rest2 }) {
    if (activeCmd) {
      return;
    }

    const dateNow = Date.now();
    const time = moment.tz("Asia/Manila").format("HH:MM:ss DD/MM/YYYY");
    const { allowInbox, PREFIX, ADMINBOT, DeveloperMode, adminOnly } = global.config;
    const { userBanned, threadBanned, threadInfo, commandBanned } = global.data;
    const { commands } = global.client;

    var { body, senderID, threadID, messageID } = event;
    var senderID = String(senderID),
      threadID = String(threadID);

    const args = (body || "").trim().split(/ +/);
    const commandName = (args.shift() || "").toLowerCase();
    const lookupName = commandName.startsWith(PREFIX) ? commandName.slice(PREFIX.length) : commandName;
    var command = commands.get(lookupName);

    // Most messages in a group aren't commands. Stop here for those, before
    // any thread lookups or replies - previously every ordinary chat message
    // could trigger Facebook API calls.
    if (!commandName) return;
    if (!commandName.startsWith(PREFIX) && !(command && command.config && command.config.usePrefix === false)) {
      return;
    }
    // A bare prefix on its own ("-") is someone asking what the prefix is,
    // so answer it. Emoticons like "--", "-_-", "-.-" and "->" are still
    // ignored, otherwise the bot would butt into normal chat.
    if (commandName.startsWith(PREFIX) && !/^[a-z0-9]/i.test(commandName.slice(PREFIX.length))) {
      if ((body || "").trim() !== PREFIX) return;

      const pk = "prefix:" + threadID + ":" + senderID;
      if (dateNow - (unknownNotice.get(pk) || 0) < 30000) return;
      unknownNotice.set(pk, dateNow);

      return api.sendMessage(
        await buildBox(senderID, Users, moment, [
          __l.t("m1166", [PREFIX]),
          __l.t("m1167", [PREFIX, PREFIX]),
        ]),
        threadID,
        messageID,
      );
    }
    const replyAD = __l.t("m1168");

    if (
      command &&
      command.config.name.toLowerCase() === commandName.toLowerCase() &&
      !ADMINBOT.includes(senderID) &&
      adminOnly &&
      senderID !== api.getCurrentUserID()
    ) {
      return api.sendMessage(replyAD, threadID, messageID);
    }

    if (
      typeof body === "string" &&
      body.startsWith(PREFIX) &&
      !ADMINBOT.includes(senderID) &&
      adminOnly &&
      senderID !== api.getCurrentUserID()
    ) {
      return api.sendMessage(replyAD, threadID, messageID);
    }

    if (
      userBanned.has(senderID) ||
      threadBanned.has(threadID) ||
      (allowInbox == ![] && senderID == threadID)
    ) {
      if (!ADMINBOT.includes(senderID.toString())) {
        if (userBanned.has(senderID)) {
          const bk = "ban:" + senderID;
          if (dateNow - (unknownNotice.get(bk) || 0) < 10 * 60000) return;
          unknownNotice.set(bk, dateNow);
          const { reason, dateAdded } = userBanned.get(senderID) || {};
          return api.sendMessage(
            global.getText("handleCommand", "userBanned", reason, dateAdded),
            threadID,
            async (err, info) => {
              await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
              return api.unsendMessage(info.messageID);
            },
            messageID,
          );
        } else {
          if (threadBanned.has(threadID)) {
            const { reason, dateAdded } = threadBanned.get(threadID) || {};
            return api.sendMessage(
              global.getText(
                "handleCommand",
                "threadBanned",
                reason,
                dateAdded,
              ),
              threadID,
              async (_, info) => {
                await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
                return api.unsendMessage(info.messageID);
              },
              messageID,
            );
          }
        }
      }
    }

    if (commandName.startsWith(PREFIX)) {
      if (!command) {
        const allCommandName = Array.from(commands.keys());
        const bestMatch = allCommandName.length
          ? stringSimilarity.findBestMatch(lookupName, allCommandName).bestMatch
          : null;
        const key = threadID + ":" + senderID;
        const last = unknownNotice.get(key) || 0;
        if (dateNow - last < 30000) return;       // don't answer every typo
        unknownNotice.set(key, dateNow);
        if (unknownNotice.size > 1000) unknownNotice.delete(unknownNotice.keys().next().value);

        // Suggest a close match; never execute a different command by accident.
        const typed = commandName.slice(PREFIX.length) || commandName;
        const middle = [__l.t("m1169", [typed])];
        if (bestMatch && bestMatch.rating >= 0.2) {
          middle.push(__l.t("m1170", [PREFIX, bestMatch.target]));
        }

        return api.sendMessage(
          await buildBox(senderID, Users, moment, middle),
          threadID,
          messageID,
        );
      }
    }

    if (commandBanned.get(threadID) || commandBanned.get(senderID)) {
      if (!ADMINBOT.includes(senderID)) {
        const banThreads = commandBanned.get(threadID) || [],
          banUsers = commandBanned.get(senderID) || [];
        if (banThreads.includes(command.config.name))
          return api.sendMessage(
            global.getText(
              "handleCommand",
              "commandThreadBanned",
              command.config.name,
            ),
            threadID,
            async (_, info) => {
              await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
              return api.unsendMessage(info.messageID);
            },
            messageID,
          );
        if (banUsers.includes(command.config.name))
          return api.sendMessage(
            global.getText(
              "handleCommand",
              "commandUserBanned",
              command.config.name,
            ),
            threadID,
            async (_, info) => {
              await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
              return api.unsendMessage(info.messageID);
            },
            messageID,
          );
      }
    }

    if (command && command.config && command.config.usePrefix !== undefined) {
        command.config.usePrefix = command.config.usePrefix ?? true;
    }

    if (command && command.config) {
      if (
        command.config.usePrefix === false &&
        commandName.toLowerCase() !== command.config.name.toLowerCase() &&
        !command.config.allowPrefix
      ) {
        api.sendMessage(
          global.getText("handleCommand", "notMatched", command.config.name),
          event.threadID,
          event.messageID,
        );
        return;
      }
      if (command.config.usePrefix === true && !body.startsWith(PREFIX)) {
        return;
      }
    }

    if (command && command.config) {
      if (typeof command.config.usePrefix === "undefined") {
        api.sendMessage(
          global.getText("handleCommand", "noPrefix", command.config.name),
          event.threadID,
          event.messageID,
        );
        return;
      }
    }

    if (
      command &&
      command.config &&
      command.config.commandCategory &&
      command.config.commandCategory.toLowerCase() === "nsfw" &&
      !global.data.threadAllowNSFW.includes(threadID) &&
      !ADMINBOT.includes(senderID)
    )
      return api.sendMessage(
        global.getText("handleCommand", "threadNotAllowNSFW"),
        threadID,
        async (_, info) => {
          await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
          return api.unsendMessage(info.messageID);
        },
        messageID,
      );

    var permssion = 0;
    if (ADMINBOT.includes(senderID.toString())) permssion = 2;
    else if (command?.config?.hasPermssion > 0 && event.isGroup === true) {
      let info = threadInfo.get(threadID);
      // Admin lists may be absent in a newly started group. Only commands
      // requiring admin access need to wait for the Messenger API.
      if (!Array.isArray(info?.adminIDs)) {
        try {
          info = await Threads.getInfo(threadID);
          if (info && Array.isArray(info.adminIDs)) threadInfo.set(threadID, info);
        } catch (error) {
          logger.log(global.getText("handleCommand", "cantGetInfoThread", error.message));
        }
      }
      if (info?.adminIDs?.some(admin => String(admin.id) === senderID)) permssion = 1;
    }
    if (
      command &&
      command.config &&
      command.config.hasPermssion &&
      command.config.hasPermssion > permssion
    ) {
      return api.sendMessage(
        global.getText(
          "handleCommand",
          "permissionNotEnough",
          command.config.name,
        ),
        event.threadID,
        event.messageID,
      );
    }

    if (
      command &&
      command.config &&
      !global.client.cooldowns.has(command.config.name)
    ) {
      global.client.cooldowns.set(command.config.name, new Map());
    }

    const timestamps =
      command && command.config
        ? global.client.cooldowns.get(command.config.name)
        : undefined;

    // Clarification is one conversation, not repeated execution of the target
    // command. The listener's spam guard still applies; the final command keeps
    // its own cooldown and permission checks.
    const expirationTime =
      (event._smartSynthetic === true && command?.config?.name === "smart" && event._smartIntent)
        ? 0
        : ((command && command.config && command.config.cooldowns) || 1) * 1000;

    const runningKey = String(threadID) + ":" + String(senderID) + ":" + command.config.name;
    if (runningCommands.has(runningKey)) return;

    if (
      timestamps &&
      timestamps instanceof Map &&
      timestamps.has(senderID) &&
      dateNow < timestamps.get(senderID) + expirationTime
    ) {
      // spamming a command used to get a ⏳ reaction on EVERY attempt
      const ck = command.config.name + ":" + senderID;
      if (cooldownNoticed.get(ck) === timestamps.get(senderID)) return;
      cooldownNoticed.set(ck, timestamps.get(senderID));
      if (cooldownNoticed.size > 1000) cooldownNoticed.delete(cooldownNoticed.keys().next().value);

      try { api.setMessageReaction("⏳", event.messageID, () => {}, true); } catch (e) {}

      const endsAt = timestamps.get(senderID) + expirationTime;
      startCooldownCountdown(api, event, command.config.name, endsAt, expirationTime);
      return;
    }

    runningCommands.add(runningKey);
    if (timestamps) timestamps.set(senderID, dateNow);

    try {
      const getText2 = require("../i18n").commandText(command, threadID);
      const cmdApi = wrapApiForCommand(api, command.config.name, event);

      const Obj = {
        ...rest,
        ...rest2,
        api: cmdApi,
        event: event,
        args: args,
        models: models,
        Users: Users,
        Threads: Threads,
        Currencies: Currencies,
        permssion: permssion,
        getText: getText2,
        editMessage: function(message, messageID, callback) {
          return api.editMessage(message, messageID, callback);
        }
      };

      if (command && typeof command.run === "function") {
        // Only registered commands that passed bans, permissions and cooldowns
        // reach this hook. A streak storage failure must not block the command.
        if (typeof rest.onCommand === 'function') {
          try { await rest.onCommand(event, command.config.name); }
          catch (_) { console.error('[streak] Could not persist command activity; command continues.'); }
        }
        await command.run(Obj);


        if (DeveloperMode == !![]) {
          logger.log(
            global.getText(
              "handleCommand",
              "executeCommand",
              time,
              commandName,
              senderID,
              threadID,
              args.join(" "),
              Date.now() - dateNow,
            ),
            "DEV MODE",
          );
        }
        return;
      }
    } catch (e) {
      if (e?.commandReplyAttempted) return;
      const deliveryCode = String(e?.code || e?.errorCode || e?.error || '');
      if (/^(?:MQTT_|OUTGOING_)/.test(deliveryCode) ||
          ['SEND_RESTRICTED', 'SESSION_STOPPED', 'CHECKPOINT_REQUIRED', '368'].includes(deliveryCode) ||
          deliveryCode.startsWith('Rate limited by bot safety:')) {
        console.warn('[command] Reply delivery unavailable; no follow-up message sent.');
        return;
      }
      return api.sendMessage(
        global.getText("handleCommand", "commandError", commandName, e),
        threadID,
      );
    } finally {
      runningCommands.delete(runningKey);
    }
    activeCmd = false;
  };
};

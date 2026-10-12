"use strict";

// FCA-NX: sendTypingIndicator(threadID, isTyping, options).
// Keep one typing state per chat so overlapping commands cannot turn each
// other's indicator off. Facebook also expires typing status automatically.
const MAX_TYPING_MS = 5 * 60 * 1000;

function send(api, threadID, isTyping) {
  if (typeof api.sendTypingIndicator !== "function" || global.__mqttDown) return;
  try {
    const request = api.sendTypingIndicator(threadID, isTyping, { duration: 10000, autoStop: false });
    if (request && typeof request.catch === "function") request.catch(() => {});
  } catch (_) {
    // Typing is cosmetic; a disconnected socket must not interrupt commands.
  }
}

function isCommandEvent(event) {
  if (!event) return false;
  if (event.type === "message_reaction") return !!global.client?.handleReaction?.some(reaction =>
    String(reaction.messageID) === String(event.messageID));
  if (!["message", "message_reply"].includes(event.type)) return false;
  const body = String(event.body || "").trim();
  const prefix = String(global.config?.PREFIX || "-");
  const name = body.split(/\s+/)[0].toLowerCase();
  const lookup = name.startsWith(prefix) ? name.slice(prefix.length) : name;
  const command = global.client?.commands?.get(lookup);

  if (/^start bot$/i.test(body)) return true;
  if (/^(tl|en|ilo|ceb|hil|tagalog|english|ilocano|iloko|cebuano|bisaya|hiligaynon|ilonggo)$/i.test(body)) return true;
  if (name.startsWith(prefix) && (lookup === "" || /^[a-z0-9]/i.test(lookup))) return true;
  if (command?.config?.usePrefix === false) return true;

  const replyID = event.messageReply?.messageID;
  return !!replyID && !!global.client?.handleReply?.some(reply =>
    String(reply.messageID) === String(replyID));
}

module.exports = function createTypingIndicator(api) {
  const active = new Map();
  return function beginTyping(event) {
    if (!isCommandEvent(event) || typeof api.sendTypingIndicator !== "function") return () => {};
    if (String(event.senderID) === String(api.getCurrentUserID())) return () => {};

    const threadID = String(event.threadID);
    let state = active.get(threadID);
    if (!state) {
      state = { count: 0, refresh: null, watchdog: null };
      active.set(threadID, state);
      send(api, threadID, true);
      state.refresh = setInterval(() => send(api, threadID, true), 8000);
      state.watchdog = setTimeout(() => {
        if (active.get(threadID) !== state) return;
        clearInterval(state.refresh);
        active.delete(threadID);
        send(api, threadID, false);
      }, MAX_TYPING_MS);
    }
    state.count++;

    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      if (active.get(threadID) !== state || --state.count > 0) return;
      clearInterval(state.refresh);
      clearTimeout(state.watchdog);
      active.delete(threadID);
      send(api, threadID, false);
    };
  };
};

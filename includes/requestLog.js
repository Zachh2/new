"use strict";

// Keep lookups out of the message handler's critical path. One lookup is shared
// by messages from the same user/thread, with a cooldown after a failed lookup.
const pendingUsers = new Map();
const pendingThreads = new Map();
const knownThreadNames = new Map();
const failedUsers = new Map();
const failedThreads = new Map();
const RETRY_MS = 10 * 60 * 1000;
const LOG_WAIT_MS = 2000;

function clean(value) {
  return String(value == null ? "" : value).replace(/[\x00-\x1f\x7f]+/g, " ").trim();
}

function lookup(id, cache, pending, failed, fetch) {
  if (cache?.get(id)) return Promise.resolve(cache.get(id));
  if (pending.has(id)) return pending.get(id);
  if (Date.now() < (failed.get(id) || 0)) return Promise.resolve("");

  const task = Promise.resolve().then(fetch).then(name => {
    const result = clean(name);
    if (result && result !== "Facebook user") {
      cache?.set(id, result);
      failed.delete(id);
      return result;
    }
    failed.set(id, Date.now() + RETRY_MS);
    return "";
  }).catch(() => {
    failed.set(id, Date.now() + RETRY_MS);
    return "";
  }).finally(() => pending.delete(id));
  pending.set(id, task);
  return task;
}

function logIncomingRequest(event, { api, Users }) {
  if (!event || !["message", "message_reply"].includes(event.type)) return;
  const tid = String(event.threadID || "");
  const uid = String(event.senderID || "");
  if (!tid || !uid || uid === String(api.getCurrentUserID())) return;

  const data = global.data || {};
  const threadInfo = data.threadInfo?.get(tid);
  const cachedThread = clean(event.threadName || threadInfo?.threadName || knownThreadNames.get(tid));
  const cachedUser = clean(data.userName?.get(uid) || event.senderName);
  const attachments = Array.isArray(event.attachments) ? event.attachments.map(a => clean(a.type || "file")).join(", ") : "";
  const message = clean(event.body) || (attachments ? `[attachment: ${attachments}]` : "[empty message]");
  const timestamp = new Date().toISOString();

  const userName = cachedUser ? Promise.resolve(cachedUser) : lookup(
    uid, data.userName, pendingUsers, failedUsers, () => Users.getNameUser(uid)
  );
  const threadName = cachedThread || event.isGroup !== true ? Promise.resolve(cachedThread) : lookup(
    tid, knownThreadNames, pendingThreads, failedThreads,
    async () => (await api.getThreadInfo(tid))?.threadName
  );

  // A slow or failed Facebook lookup must never hide an incoming message.
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), LOG_WAIT_MS); });
  void Promise.race([Promise.all([threadName, userName]), timeout]).then(result => {
    clearTimeout(timer);
    const [resolvedThread, resolvedUser] = result || ["", ""];
    const group = clean(resolvedThread || cachedThread) || (event.isGroup ? "GC" : "Chat");
    const user = clean(resolvedUser || cachedUser) || "User";
    console.log(`[REQUEST] ${timestamp} | Thread: ${group} (${tid}) | User: ${user} (${uid}) | ${event.type === "message_reply" ? "Reply" : "Message"}: ${message}`);
  }).catch(err => console.error("[request log]", err.message));
}

module.exports = logIncomingRequest;

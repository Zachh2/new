/**
 * Created by Donix-VN (DongDev)
 * Modified by MueidMursalinRifat & Xalman
 * Send a message using MQTT.
 * @param {string|object} msg - The message object or text to send.
 * @param {string} threadID - The ID of the thread to send the message to.
 * @param {function} [callback] - Optional. The callback function.
 * @param {string} [replyToMessage] - Optional. Message ID to reply to.
 * @returns {Promise<object>} A promise that resolves with the sent message metadata.
 */

"use strict";
const log = require("../../../func/logAdapter");
const { getType } = require("../../utils/format");
const { isReadableStream } = require("../../utils/constants");
const { generateOfflineThreadingID } = require("../../utils/format");
const { loadConfig } = require("../../../module/config");

module.exports = function (defaultFuncs, api, ctx) {
  // TYPING_INDICATOR_PATCH: lightweight typing hook
  const originalSendMessage = null;
  const { config } = loadConfig();
  const typingConfig = config.typingIndicator || {};
  const typingEnabled = process.env.FCA_TYPING_INDICATOR !== "0" && typingConfig.enabled !== false;
  const typingDuration = Number(process.env.FCA_TYPING_DURATION || typingConfig.duration || 4000);
  const sendTyping = require("./sendTypingIndicator")(defaultFuncs, api, ctx);

  const uploadAttachment = require("./uploadAttachment")(defaultFuncs, api, ctx);
  const hasLinks = s => typeof s === "string" && /(https?:\/\/|www\.|t\.me\/|fb\.me\/|youtu\.be\/|facebook\.com\/|youtube\.com\/)/i.test(s);
  const emojiSizes = { small: 1, medium: 2, large: 3 };

  function extractIdsFromPayload(payload) {
    let messageID = null;
    let threadID = null;
    function walk(n) {
      if (Array.isArray(n)) {
        if (n[0] === 5 && (n[1] === "replaceOptimsiticMessage" || n[1] === "replaceOptimisticMessage")) {
          messageID = String(n[3]);
        }
        if (n[0] === 5 && n[1] === "writeCTAIdToThreadsTable") {
          const a = n[2];
          if (Array.isArray(a) && a[0] === 19) threadID = String(a[1]);
        }
        for (const x of n) walk(x);
      }
    }
    walk(payload?.step);
    return { threadID, messageID };
  }

  function publishWithAck(content, text, reqID, callback) {
    return new Promise((resolve, reject) => {
      const client = ctx.mqttClient;
      let done = false, timer;
      const failure = (code, message) => Object.assign(new Error(message), { code });
      const finish = (err, result) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (client) {
          client.removeListener("message", handleRes);
          for (const event of ["close", "offline", "disconnect", "chia:retired"]) client.removeListener(event, disconnected);
        }
        // A callback exception must not leave this promise pending.
        try { if (callback) callback(err, result); } catch (_) { log.error("sendMessageMqtt", "Outgoing callback failed"); }
        if (err) reject(err); else resolve(result);
      };
      const disconnected = () => finish(failure("MQTT_DISCONNECTED", "Connection interrupted; this message will not be replayed"));
      const handleRes = (topic, message) => {
        if (done || topic !== "/ls_resp" || ctx.mqttClient !== client) return;
        let response;
        try {
          response = JSON.parse(message.toString());
          if (String(response.request_id) !== String(reqID)) return;
          if (typeof response.payload === "string") response.payload = JSON.parse(response.payload);
        } catch (_) { return; }
        const { threadID, messageID } = extractIdsFromPayload(response.payload);
        if (!messageID) {
          // Do not report delivery or automatically resend an unconfirmed request.
          const raw = JSON.stringify(response.payload || {});
          const restricted = /temporarily blocked|action blocked|cannot send messages|can't send messages|messaging restricted/i.test(raw);
          return finish(failure(restricted ? "SEND_RESTRICTED" : "MQTT_SEND_UNCONFIRMED", restricted ? "Messaging temporarily restricted by Facebook" : "Messenger did not confirm message delivery"));
        }
        finish(null, { body: text || null, messageID, threadID });
      };
      if (!client || client.connected !== true || ctx._mqttReady === false || ctx._ending || ctx.loggedIn === false) {
        return finish(failure("MQTT_NOT_READY", "Messenger connection is not ready; message was not queued"));
      }
      client.on("message", handleRes);
      for (const event of ["close", "offline", "disconnect", "chia:retired"]) client.once(event, disconnected);
      timer = setTimeout(() => finish(failure("MQTT_ACK_TIMEOUT", "Message delivery unconfirmed; not automatically retrying")), 15000);
      try {
        client.publish("/ls_req", JSON.stringify(content), { qos: 0, retain: false }, err => { if (err) finish(err); });
      } catch (err) { finish(err); }
    });
  }

  function buildMentionData(msg, baseBody) {
    if (!msg.mentions || !Array.isArray(msg.mentions) || !msg.mentions.length) return null;
    const base = typeof baseBody === "string" ? baseBody : "";
    const ids = [];
    const offsets = [];
    const lengths = [];
    const types = [];
    let cursor = 0;
    for (const m of msg.mentions) {
      const raw = String(m.tag || "");
      const name = raw.replace(/^@+/, "");
      const start = Number.isInteger(m.fromIndex) ? m.fromIndex : cursor;
      let idx = base.indexOf(raw, start);
      let adj = 0;
      if (idx === -1) {
        idx = base.indexOf(name, start);
        adj = 0;
      } else {
        adj = raw.length - name.length;
      }
      if (idx < 0) {
        idx = 0;
        adj = 0;
      }
      const off = idx + adj;
      ids.push(String(m.id || 0));
      offsets.push(off);
      lengths.push(name.length);
      types.push("p");
      cursor = off + name.length;
    }
    return {
      mention_ids: ids.join(","),
      mention_offsets: offsets.join(","),
      mention_lengths: lengths.join(","),
      mention_types: types.join(",")
    };
  }

  function coerceMsg(x) {
    if (x == null) return { body: "" };
    if (typeof x === "string") return { body: x };
    if (typeof x === "object") return x;
    return { body: String(x) };
  }

  return async function sendMessageMqtt(msg, threadID, callback, replyToMessage) {
    if (typeof threadID === "function") return threadID({ error: "Pass a threadID as a second argument." });
    if (typeof callback === "string" && !replyToMessage) {
      replyToMessage = callback;
      callback = () => { };
    }
    if (typeof callback !== "function") callback = () => { };
    const startingClient = ctx.mqttClient;
    const checkConnection = () => {
      if (!startingClient || ctx.mqttClient !== startingClient || startingClient.connected !== true || ctx._mqttReady === false || ctx._ending || ctx.loggedIn === false) {
        const err = Object.assign(new Error('Messenger connection changed or is unavailable; message was not queued'), {code:'MQTT_NOT_READY'});
        try { callback(err); } catch (_) {}
        throw err;
      }
    };
    checkConnection();
    if (!threadID) {
      const err = { error: "threadID is required" };
      callback(err);
      throw err;
    }

    const m = coerceMsg(msg);
    const baseBody = m.body != null ? String(m.body) : "";
    ctx._chiaSendRequestID = ((ctx._chiaSendRequestID || 0) % 1000000000) + 1;
    const reqID = 1000000000 + ctx._chiaSendRequestID;
    const epoch = (BigInt(Date.now()) << 22n).toString();

    const payload0 = {
      thread_id: String(threadID),
      otid: generateOfflineThreadingID(),
      source: 2097153,
      send_type: 1,
      sync_group: 1,
      mark_thread_read: 1,
      text: baseBody === "" ? null : baseBody,
      initiating_source: 0,
      skip_url_preview_gen: 1,
      text_has_links: hasLinks(baseBody) ? 1 : 0,
      multitab_env: 0,
      metadata_dataclass: JSON.stringify({ media_accessibility_metadata: { alt_text: null } })
    };

    // --- TEXT EFFECTS SUPPORT FOR MQTT ---
    if (m.text_effect_ids) {
      let effectArray = [];
      if (Array.isArray(m.text_effect_ids)) {
        effectArray = m.text_effect_ids;
      } else if (typeof m.text_effect_ids === "string" || typeof m.text_effect_ids === "number") {
        effectArray = [m.text_effect_ids];
      }
      if (effectArray.length > 0) {
        payload0.text_effect_ids = effectArray.map(id => String(id));
      }
    }

    const mentionData = buildMentionData(m, baseBody);
    if (mentionData) payload0.mention_data = mentionData;

    if (m.sticker) {
      payload0.send_type = 2;
      payload0.sticker_id = m.sticker;
    }

    if (m.emoji) {
      const size = !isNaN(m.emojiSize) ? Number(m.emojiSize) : emojiSizes[m.emojiSize || "small"] || 1;
      payload0.send_type = 1;
      payload0.text = m.emoji;
      payload0.hot_emoji_size = Math.min(3, Math.max(1, size));
    }

    if (m.location && m.location.latitude != null && m.location.longitude != null) {
      payload0.send_type = 1;
      payload0.location_data = {
        coordinates: { latitude: m.location.latitude, longitude: m.location.longitude },
        is_current_location: !!m.location.current,
        is_live_location: !!m.location.live
      };
    }

    if (replyToMessage) {
      payload0.reply_metadata = { reply_source_id: replyToMessage, reply_source_type: 1, reply_type: 0 };
    }

    if (m.attachment) {
      payload0.send_type = 3;
      if (payload0.text === "") payload0.text = null;
      payload0.attachment_fbids = [];
      let list = m.attachment;
      if (getType(list) !== "Array") list = [list];
      const idsFromPairs = [];
      const streams = [];
      for (const it of list) {
        if (Array.isArray(it) && typeof it[0] === "string") {
          idsFromPairs.push(String(it[1]));
        } else if (isReadableStream(it)) {
          streams.push(it);
        }
      }
      if (idsFromPairs.length) payload0.attachment_fbids.push(...idsFromPairs);
      if (streams.length) {
        try {
          const files = await uploadAttachment(streams);
          for (const file of files) {
            const id = file.video_id || file.image_id || file.audio_id || file.file_id || file.gif_id || file.fbid || file.id || file.upload_id;
            if (id) payload0.attachment_fbids.push(String(id));
          }
        } catch (err) {
          log.error("uploadAttachment", err);
          callback(err);
          throw err;
        }
      }
    }

    const content = {
      app_id: "2220391788200892",
      payload: {
        tasks: [
          {
            label: "46",
            payload: payload0,
            queue_name: String(threadID),
            task_id: 400,
            failure_count: null
          },
          {
            label: "21",
            payload: {
              thread_id: String(threadID),
              last_read_watermark_ts: Date.now(),
              sync_group: 1
            },
            queue_name: String(threadID),
            task_id: 401,
            failure_count: null
          }
        ],
        epoch_id: epoch,
        version_id: "24804310205905615",
        data_trace_id: "#" + Buffer.from(String(Math.random())).toString("base64").replace(/=+$/g, "")
      },
      request_id: reqID,
      type: 3
    };
    content.payload.tasks.forEach(t => (t.payload = JSON.stringify(t.payload)));
    content.payload = JSON.stringify(content.payload);
    checkConnection(); // uploads may finish after a socket has been replaced
    if (typingEnabled) {
      try { Promise.resolve(sendTyping(threadID, true, { duration: typingDuration, autoStop: true })).catch(() => {}); } catch (_) {}
    }
    return publishWithAck(content, baseBody, reqID, callback);
  };
};

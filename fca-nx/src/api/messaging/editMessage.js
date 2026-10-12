"use strict";
const { request } = require("../../utils/mqttRequest");

function generateOfflineThreadingId() {
  const now = Date.now();
  const rand = Math.floor(Math.random() * 4294967295);
  return String((BigInt(now) << BigInt(22)) | BigInt(rand & 0x3FFFFF));
}

module.exports = function (defaultFuncs, api, ctx) {
  return function editMessage(text, messageID, callback) {
    if (!messageID || !text) {
      const err = Object.assign(new Error("messageID and text are required"), {code:"INVALID_ARGUMENT"});
      if (typeof callback === "function") { try { callback(err); } catch (_) {} }
      const failed = Promise.reject(err);
      if (typeof callback === "function") failed.catch(() => {});
      return failed;
    }

    ctx.wsReqNumber = (ctx.wsReqNumber || 0) + 1;
    ctx.wsTaskNumber = (ctx.wsTaskNumber || 0) + 1;

    const reqID = ctx.wsReqNumber;

    const context = {
      app_id: "2220391788200892",
      payload: JSON.stringify({
        data_trace_id: null,
        epoch_id: parseInt(generateOfflineThreadingId()),
        tasks: [
          {
            failure_count: null,
            label: "742",
            payload: JSON.stringify({
              message_id: messageID,
              text: text,
            }),
            queue_name: "edit_message",
            task_id: ctx.wsTaskNumber,
          },
        ],
        version_id: "6903494529735864",
      }),
      request_id: reqID,
      type: 3,
    };

    return request(ctx, context, callback, { messageID, body: text });
  };
};

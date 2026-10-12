"use strict";

function connectionError(ctx, client) {
  if (!client || ctx.mqttClient !== client || client.connected !== true ||
      client.disconnecting || ctx._mqttReady === false || ctx._ending || ctx.loggedIn === false) {
    return Object.assign(new Error("Messenger connection unavailable; action was not queued"), { code: "MQTT_NOT_READY" });
  }
  return null;
}

// One request belongs to one socket. Never queue UI actions across a reconnect.
function request(ctx, form, callback, result, timeoutMs = 10000) {
  const client = ctx.mqttClient;
  const promise = new Promise((resolve, reject) => {
    let settled = false, timer;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (client) {
        client.removeListener("message", response);
        for (const name of ["close", "offline", "disconnect", "chia:retired"]) client.removeListener(name, closed);
      }
      try { if (typeof callback === "function") callback(err, value); } catch (_) {}
      if (err) reject(err); else resolve(value);
    };
    const closed = () => finish(Object.assign(new Error("Connection closed; pending action cancelled"), {code:"MQTT_DISCONNECTED"}));
    const response = (topic, data) => {
      if (settled || topic !== "/ls_resp" || ctx.mqttClient !== client) return;
      let message;
      try {
        message = JSON.parse(data.toString());
        if (String(message.request_id) !== String(form.request_id)) return;
        if (typeof message.payload === "string") message.payload = JSON.parse(message.payload);
      } catch (_) { return; }
      if (!message.payload || typeof message.payload !== "object") return;
      if (message.error || message.payload.error || message.payload.errorCode) {
        return finish(Object.assign(new Error("Messenger rejected the action"), {code:"MQTT_ACTION_REJECTED"}));
      }
      finish(null, result);
    };
    const err = connectionError(ctx, client);
    if (err) return finish(err);
    client.on("message", response);
    for (const name of ["close", "offline", "disconnect", "chia:retired"]) client.once(name, closed);
    timer = setTimeout(() => finish(Object.assign(new Error("Action acknowledgement timed out; no automatic resend"), {code:"MQTT_ACK_TIMEOUT"})), timeoutMs);
    try {
      client.publish("/ls_req", JSON.stringify(form), {qos:0, retain:false}, error => { if (error) finish(error); });
    } catch (error) { finish(error); }
  });
  // Callback-only callers may ignore the return value; still return the original
  // rejectable promise for callers that also await it.
  if (typeof callback === "function") promise.catch(() => {});
  return promise;
}

module.exports = { request, connectionError };

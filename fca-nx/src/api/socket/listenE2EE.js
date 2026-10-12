"use strict";

var logger = require("../../utils/logger");
var EventEmitter = require("events");

/**
 * listenE2EE — merges E2EE messages into the same event stream as MQTT.
 *
 * Usage (identical to api.listen):
 *   api.listenE2EE(callback)   // Node-style callback(err, event)
 *   api.listenE2EE()           // returns MessageEmitter
 *
 * Combines:
 *   - Regular MQTT messages    (from api.listenMqtt)
 *   - E2EE encrypted messages  (received via FCA-NX native Noise WebSocket)
 *
 * All events share the same shape (type, senderID, threadID, body, etc.),
 * with E2EE events carrying `isE2EE: true`.
 */
module.exports = function (defaultFuncs, api, ctx) {
    return function listenE2EE(callback) {
        class CombinedEmitter extends EventEmitter {
            stopListening(cb) {
                if (api._mqttEmitter && typeof api._mqttEmitter.stopListening === "function") {
                    api._mqttEmitter.stopListening(cb);
                } else if (typeof cb === "function") {
                    cb([]);
                }
                if (ctx.e2ee && ctx.e2ee.connected) {
                    ctx.e2ee.disconnect().catch(() => {});
                }
            }
            stopListeningAsync() {
                return new Promise(res => this.stopListening(res));
            }
        }

        var emitter = new CombinedEmitter();

        var isCallbackMode = typeof callback === "function";
        var globalCallback = isCallbackMode ? callback : function (err, event) {
            if (err) return emitter.emit("error", err);
            emitter.emit("message", event);
        };

// Start regular MQTT listener
        var mqttEmitter = (api._listenMqttRaw || api.listenMqtt)(globalCallback);
        api._mqttEmitter = mqttEmitter;

// [Fixed by xalman] Hook E2EE incoming messages (FCA-NX native Noise WebSocket).
// onMessage() only registers a callback reference - it doesn't require an
// active connection - so this is safe to call even while E2EE is still
// connecting in the background. If we skip it here just because
// isConnected() is momentarily false, the hook never gets attached and
// E2EE (inbox) messages go unheard for the lifetime of this listener.
        var e2ee = api.e2ee || ctx.e2ee;
        if (!e2ee) {
            logger.warn(
                "listenE2EE",
                "E2EE bridge not available. E2EE messages will not be received."
            );
        } else {
            if (!e2ee.isConnected()) {
                logger.info(
                    "listenE2EE",
                    "E2EE still connecting - message hook registered, will receive events once the handshake completes."
                );
            }
            e2ee.onMessage(function (err, event) {
                if (err) return globalCallback(err, null);
                if (!event) return;

                // Filter self-messages unless selfListen is enabled
                if (!ctx.globalOptions.selfListen && event.senderID === ctx.userID) return;

                event.isE2EE = true;
                globalCallback(null, event);
            });

            logger.success("listenE2EE", "Combined MQTT + E2EE (Signal/Noise) listener active.");
        }

        return emitter;
    };
};

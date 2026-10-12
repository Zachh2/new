"use strict";
/**
 * Emits account_inactive to the global callback and cleans up MQTT/timers/scheduler.
 * Used when login is invalid, blocked, or session is lost.
 */
module.exports = function createEmitAuth({ logger }) {
  return function emitAuth(ctx, api, globalCallback, reason, detail) {
    // session-repair: stop token maintenance
    if (ctx._sessionMaintenance) ctx._sessionMaintenance.stop();
    if (ctx._dtsgRefreshInterval) { clearInterval(ctx._dtsgRefreshInterval); ctx._dtsgRefreshInterval = null; }
    // session-repair: stop session writers
    try { if (typeof api.stopSessionGuard === 'function') api.stopSessionGuard(); } catch (_) {}
    if (ctx._sessionAutoSavers instanceof Map) {
      for (const stop of Array.from(ctx._sessionAutoSavers.values())) { try { stop(); } catch (_) {} }
    }
    // Clean up all timers
    try {
      if (ctx._autoCycleTimer) {
        clearInterval(ctx._autoCycleTimer);
        ctx._autoCycleTimer = null;
      }
    } catch (_) { }
    try {
      if (ctx._reconnectTimer) {
        clearTimeout(ctx._reconnectTimer);
        ctx._reconnectTimer = null;
      }
    } catch (_) { }

    try {
      ctx._ending = true;
      ctx._cycling = false;
    } catch (_) { }

    // Clean up MQTT client
    try {
      if (ctx.mqttClient) {
        ctx._mqttReady = false;
        ctx.mqttClient.emit("chia:retired");
        ctx.mqttClient.removeAllListeners();
        ctx.mqttClient.on("error", function () {});
        ctx.mqttClient.end(true);
      }
    } catch (_) { }

    ctx.mqttClient = undefined;
    ctx.loggedIn = false;

    // Clean up timeout references
    try {
      if (ctx._rTimeout) {
        clearTimeout(ctx._rTimeout);
        ctx._rTimeout = null;
      }
    } catch (_) { }

    // Clean up tasks Map to prevent memory leak
    try {
      if (ctx.tasks && ctx.tasks instanceof Map) {
        ctx.tasks.clear();
      }
    } catch (_) { }

    // Clean up userInfo intervals
    try {
      if (ctx._userInfoIntervals && Array.isArray(ctx._userInfoIntervals)) {
        ctx._userInfoIntervals.forEach(interval => {
          try {
            clearInterval(interval);
          } catch (_) { }
        });
        ctx._userInfoIntervals = [];
      }
    } catch (_) { }

    // Clean up autoSave intervals
    try {
      if (ctx._autoSaveInterval && Array.isArray(ctx._autoSaveInterval)) {
        ctx._autoSaveInterval.forEach(interval => {
          try {
            clearInterval(interval);
          } catch (_) { }
        });
        ctx._autoSaveInterval = [];
      }
    } catch (_) { }

    // Clean up scheduler
    try {
      if (ctx._scheduler && typeof ctx._scheduler.destroy === "function") {
        ctx._scheduler.destroy();
        ctx._scheduler = undefined;
      }
    } catch (_) { }

    const msg = detail || reason;
    logger(`auth change -> ${reason}: ${msg}`, "error");

    if (typeof globalCallback === "function") {
      try {
        globalCallback({
          type: "account_inactive",
          reason,
          error: msg,
          timestamp: Date.now()
        }, null);
      } catch (cbErr) {
        logger(`emitAuth callback error: ${cbErr && cbErr.message ? cbErr.message : String(cbErr)}`, "error");
      }
    }
  };
};

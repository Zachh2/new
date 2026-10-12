'use strict';

// Session protection: retire confirmed-invalid sessions without issuing a
// Facebook logout, overwriting appstate, or repeatedly publishing old actions.
// Ordinary network failures remain eligible for the single MQTT recovery owner.
module.exports = function protectExpiredSession(api) {
  const ctx = api && api.ctx;
  if (!ctx || ctx._chiaSessionRetired) return false;
  ctx._chiaSessionRetired = true;
  ctx.loggedIn = false;
  ctx._ending = true;
  ctx._cycling = false;
  ctx._mqttReady = false;
  const safely = fn => { try { fn(); } catch (_) {} };
  safely(() => api.__stopThrottle?.());
  safely(() => api.__appStateStore?.stop?.());
  safely(() => api.stopSessionGuard?.());
  safely(() => ctx._sessionMaintenance?.stop?.());
  for (const name of ['_reconnectTimer','_rTimeout','_autoCycleTimer','_dtsgRefreshInterval']) {
    clearTimeout(ctx[name]); clearInterval(ctx[name]); ctx[name] = null;
  }
  if (ctx._sessionAutoSavers instanceof Map) for (const stop of ctx._sessionAutoSavers.values()) safely(stop);
  const socket = ctx.mqttClient;
  if (socket) {
    safely(() => socket.emit('chia:retired'));
    safely(() => socket.end(true));
  }
  return true;
};

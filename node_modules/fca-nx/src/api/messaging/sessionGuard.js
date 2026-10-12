"use strict";
const path = require("path");
const { getStore } = require("../../utils/sessionStore");
const logger = require("../../utils/logger");

module.exports = function (_defaultFuncs, api, ctx) {
  // Loading an API factory is not the same as starting its guard. loginHelper
  // loads this factory twice; both calls must return a usable initializer.
  return function sessionGuard(file, options) {
    options = options || {};
    file = path.resolve(file || process.env.FCA_APPSTATE_PATH || "appstate.json");
    if (ctx._sessionGuardControl) return ctx._sessionGuardControl;
    const interval = options.interval === undefined ? 180000 : Number(options.interval);
    const debounce = options.debounce === undefined ? 30000 : Number(options.debounce);
    if (!Number.isFinite(interval) || interval < 0 || !Number.isFinite(debounce) || debounce < 0) throw new TypeError("Invalid session save interval");
    let stopped = false, lastSave = 0, periodic = null, delayed = null;
    let originalSend, wrappedSend;
    const primaryStore = getStore(api, ctx, file);
    const store = p => p ? getStore(api, ctx, p) : primaryStore;
    function save(p) {
      if (stopped) return Promise.resolve(false);
      try { const ok = store(p).save(); if (ok) lastSave = Date.now(); return Promise.resolve(ok); }
      catch (e) { logger.error("SessionGuard", "Save failed (" + (e.code || "write_error") + ")"); return Promise.resolve(false); }
    }
    function onSuccess() { if (!stopped && Date.now() - lastSave >= debounce) void save(); }
    function hookSend() {
      if (stopped || api.sendMessage === wrappedSend || typeof api.sendMessage !== "function") return;
      originalSend = api.sendMessage;
      const send = originalSend;
      wrappedSend = function () {
        const args = Array.from(arguments);
        const cbIndex = args.findIndex(a => typeof a === "function");
        if (cbIndex >= 0) {
          const cb = args[cbIndex];
          args[cbIndex] = function (err) { if (!err) onSuccess(); return cb.apply(this, arguments); };
        }
        const result = send.apply(this, args);
        // Callback-only senders often return undefined: that is not success.
        if (result && typeof result.then === "function") result.then(onSuccess, function () {});
        return result;
      };
      api.sendMessage = wrappedSend;
    }
    function stop() {
      if (stopped) return;
      stopped = true; clearInterval(periodic); clearTimeout(delayed);
      if (api.sendMessage === wrappedSend) api.sendMessage = originalSend;
      if (ctx._sessionGuardControl === control) delete ctx._sessionGuardControl;
      ctx._sessionGuardAttached = false;
    }
    function restore(p) {
      if (stopped) return false;
      try { return store(p).restore(); } catch (_) { return false; }
    }
    const control = { save, stop, restore };
    ctx._sessionGuardControl = control;
    ctx._sessionGuardAttached = true;
    api.__sessionGuard = control;
    api.saveSession = save;
    api.stopSessionGuard = stop;
    api.restoreSessionBackup = restore;
    api.checkSessionHealth = p => {
      if (stopped) return false;
      try { return store(p).healthy() || restore(p); } catch (_) { return false; }
    };
    hookSend();
    // loginHelper replaces sendMessage later in the same synchronous turn.
    delayed = setTimeout(() => { hookSend(); if (options.saveOnLogin !== false) void save(); }, 0);
    if (delayed.unref) delayed.unref();
    if (interval > 0) {
      periodic = setInterval(() => { hookSend(); void save(); }, interval);
      if (periodic.unref) periodic.unref();
    }
    return control;
  };
};

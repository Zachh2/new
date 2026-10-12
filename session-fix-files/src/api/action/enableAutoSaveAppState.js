"use strict";
const path = require("path");
const { getStore } = require("../../utils/sessionStore");
const logger = require("../../../func/logger");

module.exports = function (_defaultFuncs, api, ctx) {
  return function enableAutoSaveAppState(options = {}) {
    const file = path.resolve(options.filePath || process.env.FCA_APPSTATE_PATH || "appstate.json");
    const interval = options.interval === undefined ? 600000 : Number(options.interval);
    if (!Number.isFinite(interval) || interval < 0) throw new TypeError("Invalid appstate save interval");
    const saves = ctx._sessionAutoSavers || (ctx._sessionAutoSavers = new Map());
    if (saves.has(file)) saves.get(file)();
    const store = getStore(api, ctx, file);
    let stopped = false, periodic = null, immediate = null;
    function save() {
      if (stopped) return;
      try { store.save(); } catch (e) { logger("Appstate save failed (" + (e.code || "write_error") + ")", "warn"); }
    }
    if (options.saveOnLogin !== false) { immediate = setTimeout(save, 2000); immediate.unref?.(); }
    if (interval > 0) {
      periodic = setInterval(save, interval); periodic.unref?.();
      (ctx._autoSaveInterval || (ctx._autoSaveInterval = [])).push(periodic);
    }
    function disable() {
      stopped = true; clearTimeout(immediate); clearInterval(periodic);
      if (ctx._autoSaveInterval) ctx._autoSaveInterval = ctx._autoSaveInterval.filter(x => x !== periodic);
      if (saves.get(file) === disable) saves.delete(file);
    }
    saves.set(file, disable);
    return disable;
  };
};

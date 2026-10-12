"use strict";
const { fetchHome, classify, stateError } = require('../../utils/sessionProbe');
const { extractTokens, applyTokens } = require('../../utils/sessionTokens');
module.exports = function (defaultFuncs, api, ctx) {
  async function refresh() {
    if (ctx._ending || ctx.loggedIn === false || ctx._sessionMaintenance?.stopped) {
      const e = new Error('Session stopped; refresh cancelled.'); e.code = 'SESSION_STOPPED'; throw e;
    }
    const generation = ctx._sessionRefreshGeneration || 0;
    const response = await fetchHome(ctx);
    if (ctx._ending || ctx.loggedIn === false || ctx._sessionMaintenance?.stopped || generation !== (ctx._sessionRefreshGeneration || 0)) {
      const e = new Error('Session changed during refresh; result discarded.'); e.code = 'SESSION_STOPPED'; throw e;
    }
    const state = classify(response, ctx.userID);
    if (state.state !== 'valid') throw stateError(state);
    const tokens = extractTokens(response.data);
    applyTokens(ctx, tokens);
    return { data: tokens, message: 'Refreshed fb_dtsg and jazoest' };
  }
  return function refreshFb_dtsg(obj, callback) {
    if (typeof obj === 'function') { callback = obj; obj = {}; }
    let promise;
    if (obj != null && (typeof obj !== 'object' || Array.isArray(obj))) {
      promise = Promise.reject(new TypeError('The first parameter must be an object or callback.'));
    } else if (obj && Object.keys(obj).length) {
      promise = Promise.resolve().then(() => {
        if (ctx._ending || ctx.loggedIn === false || ctx._sessionMaintenance?.stopped) { const e = new Error('Session stopped'); e.code='SESSION_STOPPED'; throw e; }
        const tokens = { fb_dtsg: obj.fb_dtsg || ctx.fb_dtsg, jazoest: obj.jazoest || ctx.jazoest };
        if (typeof tokens.fb_dtsg !== 'string' || typeof tokens.jazoest !== 'string' || !/^[0-9]+$/.test(tokens.jazoest)) throw new TypeError('Invalid refresh tokens');
        ctx._sessionRefreshGeneration = (ctx._sessionRefreshGeneration || 0) + 1;
        applyTokens(ctx, tokens);
        return { data: tokens, message: 'Updated session tokens' };
      });
    } else {
      if (!ctx._sessionRefreshPending) {
        ctx._sessionRefreshPending = refresh().finally(() => { ctx._sessionRefreshPending = null; });
      }
      promise = ctx._sessionRefreshPending;
    }
    if (typeof callback === 'function') promise.then(data => callback(null, data), error => callback(error)).catch(() => {});
    return promise;
  };
};

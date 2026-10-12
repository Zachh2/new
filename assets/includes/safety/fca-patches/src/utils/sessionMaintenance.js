"use strict";
const INTERVAL = 90 * 60 * 1000;
function startMaintenance(api, ctx, logger = () => {}) {
  if (ctx._sessionMaintenance && !ctx._sessionMaintenance.stopped) return ctx._sessionMaintenance;
  let timer = null;
  const control = {
    stopped: false,
    stop() {
      control.stopped = true;
      ctx._sessionRefreshGeneration = (ctx._sessionRefreshGeneration || 0) + 1;
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
  ctx._sessionMaintenance = control;
  function schedule() {
    if (control.stopped || ctx.loggedIn === false) return;
    timer = setTimeout(tick, INTERVAL);
    timer.unref?.();
  }
  async function tick() {
    timer = null;
    if (control.stopped || ctx.loggedIn === false) return control.stop();
    // A reconnect can temporarily mark the context ending. Wait for it.
    if (ctx._ending || ctx._cycling) return schedule();
    try {
      await api.refreshFb_dtsg();
      if (control.stopped || ctx._ending || ctx.loggedIn === false) return;
      if (api.__appStateStore?.save) await api.__appStateStore.save();
      else if (typeof api.saveSession === 'function') await api.saveSession();
      logger('session maintenance: verified token refresh complete', 'info');
    } catch (error) {
      if (control.stopped) return;
      const terminal = ['AUTH_REQUIRED', 'CHECKPOINT_REQUIRED', 'SESSION_ACCOUNT_MISMATCH'].includes(error.code);
      logger(terminal ? 'session maintenance: account needs verification; refresh paused' : 'session maintenance: refresh unavailable; previous state preserved', 'warn');
      if (terminal) control.stop();
    } finally { schedule(); }
  }
  schedule();
  return control;
}
module.exports = { startMaintenance };

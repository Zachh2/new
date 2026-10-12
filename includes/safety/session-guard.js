/**
 * Session guard - watches the live session and reacts BEFORE a silent logout
 * turns into a restart loop.
 *
 * Facebook logs a bot account out by sending Set-Cookie headers that BLANK
 * c_user and xs. The cookie jar follows along, and fbvibex also flips
 * ctx.loggedIn to false when a request comes back "not logged in". Neither is
 * visible until something actually makes a request, so a quiet, idle session
 * can sit there dead for hours while the MQTT socket slowly falls apart.
 *
 * This runs a light probe of the session on a timer (the same
 * "just read facebook.com like a browser tab" request the fb_dtsg refresher
 * already makes every 6 hours - not the scripted presence spam that triggered
 * checkpoints). After each probe it inspects the cookie jar and fbvibex's own
 * loggedIn flag, and if the session is really gone it:
 *
 *   1. stops the listener so nothing keeps hammering a dead session,
 *   2. preserves the last good appstate (auto-logout used to DESTROY appstate.json),
 *   3. hands control back to main.js, which tries ONE cautious password relogin
 *      (credentials.json) and only stops the bot if there's nothing to recover with.
 *
 * A single bad probe (network blip, CDN hiccup) is never enough to act on -
 * only a confirmed session death does anything.
 */

const LOG = (msg) => console.log(`[session-guard] ${msg}`);

// ---------- reading the cookie jar ------------------------------------------
function cookiesFromCtx(ctx) {
  try {
    const list = ctx.jar ? ctx.jar.getCookies('https://www.facebook.com') : [];
    const out = {};
    for (const c of list || []) {
      if (c && c.key) out[c.key] = c.value == null ? "" : String(c.value);
    }
    return out;
  } catch (e) {
    return {};
  }
}

function sessionLooksAlive(ctx, cookies) {
  if (!ctx) return false;
  if (ctx.loggedIn === false) return false;          // fbvibex already knows
  const user = cookies.c_user || cookies.i_user;
  const xs = cookies.xs;
  if (!/^\d{5,}$/.test(user || "")) return false;    // blanked or missing
  if (!xs || xs.length < 10 || /^deleted$/i.test(xs)) return false;
  return true;
}

// The one page shape that means "you are not logged in", regardless of how
// Facebook chooses to redirect an expired session.
const LOGIN_PAGE_MARKERS = [
  /id="login_form"/i,
  /id="loginbutton"/i,
  /name="login_email"/i,
  /you must log in to continue/i,
  /checkpoint\/login|checkpoint\/(\?|login)/i,
  /"session_interruption_login"/i,
];

function pageSaysLoggedOut(html) {
  return LOGIN_PAGE_MARKERS.some((re) => re.test(html));
}

/**
 * The probe itself - reuse fbvibex's own httpGet with notAPI=true, exactly like
 * refreshDtsgOnce does, so the request carries the configured browser UA and
 * the live cookie jar. No fake user-agents, no made-up endpoints.
 *
 * Returns { status } where status is:
 *   'alive'  - session is fine
 *   'dead'   - a login page / cleared cookies / loggedIn=false: Facebook ended it
 *   'unknown'- network or library failure: never treated as a logout
 */
async function probeSession(api) {
  if (!api || typeof api.httpGet !== 'function' || !api.ctx) {
    return { status: 'unknown', error: 'api not ready' };
  }

  let html;
  try {
    html = await api.httpGet('https://www.facebook.com/', {}, {}, null, true);
  } catch (e) {
    // network failure - inconclusive, never treat it as logout
    return { status: 'unknown', error: String((e && (e.error || e.message)) || e).slice(0, 120) };
  }

  const cookies = cookiesFromCtx(api.ctx);
  const alive = sessionLooksAlive(api.ctx, cookies);

  if (alive) return { status: 'alive', cookies, userID: cookies.c_user || cookies.i_user || api.ctx.userID || '' };

  const error = pageSaysLoggedOut(String(html || ''))
    ? 'facebook redirected the probe to a login page'
    : (api.ctx.loggedIn === false ? 'fbvibex flagged ctx.loggedIn false' : 'cookies cleared');
  return { status: 'dead', error, cookies, userID: cookies.c_user || cookies.i_user || api.ctx.userID || '' };
}

/**
 * Install the guard on a live api.
 *
 * opts.onDead(why) - main.js's handler: stop the listener, back up the last
 *                    good appstate, then attempt the cautious relogin.
 * opts.intervalMinutes - how often to probe. Sensible range is 10-30.
 */
module.exports = function installSessionGuard(api, opts) {
  if (!api || api.__sessionGuard) return api;
  opts = opts || {};

  const intervalMs = Math.max(5, Number(opts.intervalMinutes) || 15) * 60000;
  let consecutiveFails = 0;
  let checkedAt = 0;
  let lastResult = 'pending';
  let confirmTimer = null;

  const guard = {
    stop() {
      clearInterval(timer);
      if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null; }
      api.__sessionGuard = false;
    },
  };

  async function check(why) {
    if (global.__sessionDead) return 'dead-ignored';   // already handled elsewhere
    if (global.__sessionChecking) return 'busy';
    global.__sessionChecking = true;

    const res = await probeSession(api);
    checkedAt = Date.now();
    global.__sessionChecking = false;

    if (res.status === 'alive') {
      consecutiveFails = 0;
      lastResult = 'alive';
      return 'alive';
    }

    // a network/library hiccup is never a logout - observe it and move on
    if (res.status === 'unknown') {
      lastResult = 'unknown(' + (res.error || 'probe error') + ')';
      return 'unknown';
    }

    lastResult = 'dead(' + (res.error || 'unknown') + ')';
    consecutiveFails++;

    // One inconclusive probe is not a logout; only a confirmed run (or a
    // transient network error that also coincides with cleared cookies) counts.
    const threshold = Math.max(1, Number(opts.failAttempts) || 2);
    if (consecutiveFails < threshold) {
      LOG(`probe failed (${res.error}) - ${consecutiveFails}/${threshold}, re-checking in a moment`);
      // don't wait the whole interval to confirm a possibly-dead session
      if (!confirmTimer) {
        confirmTimer = setTimeout(() => {
          confirmTimer = null;
          check('confirm');
        }, Math.min(Number(opts.confirmDelayMs) || 60000, 5 * 60000));
        if (confirmTimer.unref) confirmTimer.unref();
      }
      return 'tentative';
    }

    LOG(`SESSION IS DEAD after ${consecutiveFails} bad probes (${res.error})`);
    guard.stop();

    // let the recovery path see the exact failure
    global.__sessionGuardResult = { at: new Date().toISOString(), error: res.error };

    if (typeof opts.onDead === 'function') {
      try {
        const done = opts.onDead(res.error);
        if (done && typeof done.then === 'function') await done;
      } catch (e) {
        LOG('onDead handler errored: ' + ((e && e.message) || e));
      }
    }
    return 'dead';
  }

  const timer = setInterval(() => check('timer'), intervalMs);
  if (timer.unref) timer.unref();

  // first probe shortly after login, so a session that is already doomed is
  // caught in minutes rather than on the next timer tick
  setTimeout(() => check('startup'), Number(opts.firstDelayMs) || 120000);

  api.__sessionGuard = guard;
  api.__sessionGuardStatus = () => ({
    intervalMs,
    checkedAt,
    lastResult,
    consecutiveFails,
  });

  LOG(`armed - probing the session every ${Math.round(intervalMs / 60000)} minutes`);
  return api;
};
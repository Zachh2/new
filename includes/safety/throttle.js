/**
 * Outgoing action throttle.
 *
 * Every command in this bot fires several requests (react ⏳, send "Working...",
 * edit, react ✅). Several people using commands at once, a scheduled
 * broadcast, or a buggy loop can push dozens of requests in a few seconds.
 * Bursts like that are the most common reason Facebook restricts a
 * bot account from sending ("You can't use this feature right now").
 *
 * This wraps the api methods that act on Facebook and routes them through a
 * paced queue with per-minute and per-hour ceilings. Callers don't need to
 * change anything - callbacks and promises behave as before.
 *
 * Settings live in config.json under "safety" (all optional).
 */

const DEFAULTS = {
  enabled: true,
  sendPerMinute: 18,      // messages
  sendPerHour: 350,
  lightPerMinute: 40,     // reactions / edits / unsends
  minGapMs: 150,          // short pause between outgoing sends
  maxGapMs: 350,
  maxQueue: 120,          // beyond this, new actions are dropped (a broadcast
                          // to every group should fit; a runaway loop should not)
  repeatLimit: 3,         // same text to same thread within 60s
  groupActionsPerMinute: 6,   // kicks / adds / renames
  groupActionsPerHour: 60,
  maxQueueAgeMs: 5000,
  restrictionPauseMs: 15 * 60 * 1000,
};

const SEND_METHODS = ["sendMessage", "forwardAttachment", "shareContact", "createPoll"];
const LIGHT_METHODS = [
  "setMessageReaction", "editMessage", "unsendMessage",
];

// Adding/kicking members and renaming groups in quick succession is one of the
// fastest ways to get an account restricted, so these get a much slower lane.
const GROUP_METHODS = [
  "addUserToGroup", "removeUserFromGroup", "changeNickname",
  "setTitle", "changeAdminStatus", "changeGroupImage", "changeThreadColor",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function makeLane(name, perMinute, perHour, gap) {
  return { name, perMinute, perHour, gap, queue: [], stamps: [], running: false };
}

function pruneAndCount(lane, now) {
  const hourAgo = now - 3600000;
  while (lane.stamps.length && lane.stamps[0] < hourAgo) lane.stamps.shift();
  const minuteAgo = now - 60000;
  let lastMinute = 0;
  for (let i = lane.stamps.length - 1; i >= 0 && lane.stamps[i] >= minuteAgo; i--) lastMinute++;
  return { lastMinute, lastHour: lane.stamps.length };
}

async function runLane(lane) {
  if (lane.running) return;
  lane.running = true;
  try {
    while (lane.queue.length && !lane.closed) {
      let now = Date.now();
      let { lastMinute, lastHour } = pruneAndCount(lane, now);

      if(lane.closed)return;
      const job = lane.queue.shift();
      if (Date.now() - job.createdAt > lane.maxAge) {
        job.reject(Object.assign(new Error('Reply expired in the outgoing queue; not replaying'), {code:'OUTGOING_EXPIRED'}));
        continue;
      }
      // Refuse promptly instead of replaying old replies 30+ seconds later.
      if ((lane.perMinute && lastMinute >= lane.perMinute) || (lane.perHour && lastHour >= lane.perHour)) {
        job.reject(Object.assign(new Error('Outgoing safety limit reached; not queued for later'), {code:'OUTGOING_RATE_LIMIT'}));
        continue;
      }
      lane.stamps.push(Date.now());
      try {
        const out = job.fn();
        Promise.resolve(out).then(job.resolve, job.reject);
      } catch (e) {
        job.reject(e);
      }

      if (lane.gap) await sleep(rand(lane.gap[0], lane.gap[1]));
    }
  } finally {
    lane.running = false;
  }
}

module.exports = function installThrottle(api) {
  if (!api || api.__throttled) return api;
  const cfg = Object.assign({}, DEFAULTS, (global.config && global.config.safety) || {});
  if (cfg.enabled === false) {
    console.log("[safety] Outgoing throttle disabled in config.");
    return api;
  }

  // Older configs set 900-2200 ms gaps. Limit those waits for normal replies;
  // the per-minute/per-hour safety caps still apply as configured.
  const minGap = Math.max(0, Math.min(Number(cfg.minGapMs) || 150, 150));
  const sendGap = [minGap, Math.max(minGap, Math.min(Number(cfg.maxGapMs) || 350, 350))];
  const sendLane = makeLane("send", cfg.sendPerMinute, cfg.sendPerHour, sendGap);
  const lightLane = makeLane("light", cfg.lightPerMinute, 0, [75, 175]);
  const groupLane = makeLane("group", cfg.groupActionsPerMinute || 6, cfg.groupActionsPerHour || 60, [3000, 6000]);
  const lanes = [sendLane, lightLane, groupLane];
  for (const lane of lanes) lane.maxAge = Math.max(100, Math.min(Number(cfg.maxQueueAgeMs) || 5000, 5000));
  let restrictedUntil = 0;
  function availabilityError() {
    if (inactive()) return stopped();
    if (restrictedUntil > Date.now()) return Object.assign(new Error('Messaging paused after a Facebook restriction'), {code:'SEND_RESTRICTED', retryAfterMs:restrictedUntil-Date.now()});
    const ctx = api.ctx;
    if (ctx && (ctx._mqttReady === false || (ctx.mqttClient && ctx.mqttClient.connected === false))) {
      return Object.assign(new Error('Messenger connection is not ready; action not queued'), {code:'MQTT_NOT_READY'});
    }
    return null;
  }
  function observeRestriction(err) {
    if (!err) return;
    const code = err.code || err.errorCode || (typeof err.error === 'number' ? err.error : '');
    const message = String(err.message || err.error || '');
    if (String(code) !== '368' && code !== 'SEND_RESTRICTED' && !/temporarily blocked|action blocked|cannot send messages|can't send messages|messaging restricted/i.test(message)) return;
    if (restrictedUntil > Date.now()) return;
    restrictedUntil = Date.now() + Math.max(60000, Number(cfg.restrictionPauseMs) || 900000);
    console.warn('[safety] Facebook messaging restriction: outgoing actions paused; no relogin or resend loop.');
    for (const lane of lanes) for (const job of lane.queue.splice(0)) job.reject(availabilityError());
  }
  let closed=false;
  const inactive=()=>closed || api.ctx?.loggedIn===false || (api.ctx?._ending===true && !api.ctx?._cycling);
  const stopped=()=>Object.assign(new Error('This session has stopped; queued action cancelled'),{code:'SESSION_STOPPED'});
  api.__stopThrottle=()=>{
    closed=true;
    for(const lane of [sendLane,lightLane,groupLane]){
      lane.closed=true;
      for(const job of lane.queue.splice(0))job.reject(stopped());
    }
  };
  const recent = new Map(); // `${threadID}|${text}` -> [timestamps]
  let lastWarn = 0;

  function isRepeat(args) {
    const msg = args[0];
    const text = typeof msg === "string" ? msg : msg && typeof msg.body === "string" ? msg.body : null;
    if (!text || text.length < 2) return false;
    const key = String(args[1]) + "|" + text;
    const now = Date.now();
    const list = (recent.get(key) || []).filter((t) => now - t < 60000);
    list.push(now);
    recent.set(key, list);
    if (recent.size > 500) recent.delete(recent.keys().next().value);
    return list.length > cfg.repeatLimit;
  }

  function wrap(method, lane, checkRepeat) {
    const original = api[method];
    if (typeof original !== "function") return;

    api[method] = function (...args) {
      const cb = args.find((a) => typeof a === "function");

      const refuse = (why) => {
        const now = Date.now();
        if (now - lastWarn > 10000) {
          console.log(`[safety] Dropped ${method}: ${why}`);
          lastWarn = now;
        }
        const err = { error: "Rate limited by bot safety: " + why };
        if (cb) { try { cb(err); } catch (e) {} return Promise.resolve(); }
        return Promise.reject(err);
      };

      if (lane.queue.length >= cfg.maxQueue) return refuse("queue full");
      if (checkRepeat && isRepeat(args)) return refuse("same message repeated too often");

      return new Promise((resolve, reject) => {
        let settled=false;
        const finish=(err,...values)=>{
          if(settled)return;settled=true;
          observeRestriction(err);
          if(cb){try{cb(err,...values);}catch(_){console.warn('[safety] Outgoing callback failed');}}
          if(err&&!cb)reject(err);else resolve(values[0]);
        };
        const forwarded=cb?args.map(arg=>arg===cb?finish:arg):args;
        const unavailable = availabilityError();
        if(unavailable){finish(unavailable);return;}
        lane.queue.push({
          createdAt: Date.now(),
          fn:()=>{const err=availabilityError();if(err){finish(err);return;}return original.apply(api,forwarded);},
          // A callback-style method may return Promise.resolve(undefined)
          // before delivery. Only its callback (or a real returned result)
          // can report success and provide the message ID for later edits.
          resolve:value=>{if(!cb||value!==undefined)finish(null,value);},
          reject:err=>finish(err)
        });
        runLane(lane);
      });
    };
  }

  SEND_METHODS.forEach((m) => wrap(m, sendLane, m === "sendMessage"));
  LIGHT_METHODS.forEach((m) => wrap(m, lightLane, false));
  GROUP_METHODS.forEach((m) => wrap(m, groupLane, false));

  api.__throttled = true;
  api.__throttleStats = () => ({
    sendQueued: sendLane.queue.length,
    sendLastHour: sendLane.stamps.length,
    lightQueued: lightLane.queue.length,
    groupQueued: groupLane.queue.length,
    restrictedUntil,
  });
  console.log(
    `[safety] Outgoing throttle on: ${cfg.sendPerMinute} msgs/min, ${cfg.sendPerHour} msgs/hr, ` +
    `${cfg.lightPerMinute} reactions+edits/min`
  );
  return api;
};

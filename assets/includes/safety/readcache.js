/**
 * Short-lived cache for read-only Facebook lookups.
 *
 * getThreadInfo / getUserInfo / getThreadList were being called over and over:
 * once per command in handleCommand, again inside individual commands, twice
 * per join in joinNoti, on every protected group event, and so on. Each one is
 * a real request to Facebook, and a high steady rate of them from a single
 * session is a strong "this is a script" signal - separate from message spam.
 *
 * Identical lookups inside the TTL now reuse the last answer, and lookups that
 * are already in flight are shared instead of duplicated. Anything that
 * changes a thread (rename, kick, add, nickname) clears the thread cache, so
 * the bot never acts on data it just made stale itself.
 */

const TTL = {
  getThreadInfo: 30000,
  getUserInfo: 10 * 60000,
  getThreadList: 90000,
  getUserID: 30 * 60000,
};

const INVALIDATORS = [
  "setTitle", "addUserToGroup", "removeUserFromGroup",
  "changeNickname", "changeAdminStatus", "changeGroupImage",
];

module.exports = function installReadCache(api) {
  if (!api || api.__readCached) return api;

  const store = new Map();   // key -> { at, value }
  const inflight = new Map(); // key -> Promise

  function flushThreads() {
    for (const key of store.keys()) {
      if (key.startsWith("getThreadInfo") || key.startsWith("getThreadList")) store.delete(key);
    }
  }

  function wrap(method, ttl) {
    const original = api[method];
    if (typeof original !== "function") return;

    api[method] = function (...args) {
      const cb = args.find((a) => typeof a === "function");
      const plain = args.filter((a) => typeof a !== "function");
      let key;
      try {
        key = method + ":" + JSON.stringify(plain);
      } catch (e) {
        return original.apply(api, args); // unserialisable args - don't cache
      }

      const hit = store.get(key);
      if (hit && Date.now() - hit.at < ttl) {
        if (cb) { setImmediate(() => { try { cb(null, hit.value); } catch (e) {} }); return Promise.resolve(hit.value); }
        return Promise.resolve(hit.value);
      }

      if (!inflight.has(key)) {
        const promise = new Promise((resolve, reject) => {
          try {
            const out = original.apply(api, plain.concat([(err, value) => {
              if (err) return reject(err);
              resolve(value);
            }]));
            // some methods return a promise and ignore the callback
            if (out && typeof out.then === "function") out.then(resolve, reject);
          } catch (e) {
            reject(e);
          }
        });
        promise.then(
          (value) => {
            if (value !== undefined && value !== null) store.set(key, { at: Date.now(), value });
            if (store.size > 400) store.delete(store.keys().next().value);
            inflight.delete(key);
          },
          () => inflight.delete(key)
        );
        inflight.set(key, promise);
      }

      const shared = inflight.get(key);
      if (cb) {
        shared.then((value) => { try { cb(null, value); } catch (e) {} },
                    (err) => { try { cb(err); } catch (e) {} });
        return shared.catch(() => undefined);
      }
      return shared;
    };
  }

  Object.keys(TTL).forEach((m) => wrap(m, TTL[m]));

  INVALIDATORS.forEach((method) => {
    const original = api[method];
    if (typeof original !== "function") return;
    api[method] = function (...args) {
      flushThreads();
      return original.apply(api, args);
    };
  });

  api.__readCached = true;
  api.__readCacheStats = () => ({ entries: store.size, inflight: inflight.size });
  console.log("[safety] Lookup cache on: thread info 30s, user info 10m, thread list 90s.");
  return api;
};

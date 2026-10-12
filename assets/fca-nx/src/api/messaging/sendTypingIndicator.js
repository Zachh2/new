"use strict";
const { connectionError } = require("../../utils/mqttRequest");

module.exports = function (defaultFuncs, api, ctx) {
  return function sendTyping(threadID, isTyping, options, callback) {
    if (typeof options === "function") { callback = options; options = {}; }
    options = options || {};
    const client = ctx.mqttClient;
    const tids = Array.isArray(threadID) ? threadID : [threadID];
    const publish = (tid, status) => new Promise((resolve, reject) => {
      const err = connectionError(ctx, client);
      if (err) return reject(err);
      ctx.wsReqNumber = (ctx.wsReqNumber || 0) + 1;
      const form = {
        app_id: "772021112871879",
        payload: JSON.stringify({
          label: "3",
          payload: JSON.stringify({thread_key:parseInt(tid), is_group_thread:1,
            is_typing:status ? 1 : 0, attribution:options.type || 0, sync_group:1, thread_type:2}),
          version: "8965252033599983"
        }),
        request_id:ctx.wsReqNumber, type:4
      };
      try { client.publish('/ls_req', JSON.stringify(form), {qos:0, retain:false}, error => error ? reject(error) : resolve(true)); }
      catch (error) { reject(error); }
    });
    const promise = (async () => {
      if (tids.some(tid => !tid || !/^\d+$/.test(String(tid)))) throw Object.assign(new Error('Valid threadID required'), {code:'INVALID_ARGUMENT'});
      await Promise.all(tids.map(tid => publish(tid, isTyping)));
      if (isTyping && options.autoStop !== false) {
        let timer;
        const cancel = () => {
          clearTimeout(timer);
          for (const name of ['close','offline','disconnect','chia:retired']) client.removeListener(name, cancel);
        };
        if (!connectionError(ctx, client)) {
          for (const name of ['close','offline','disconnect','chia:retired']) client.once(name, cancel);
          timer = setTimeout(() => {
            cancel();
            if (connectionError(ctx, client)) return;
            for (const tid of tids) publish(tid, false).catch(() => {});
          }, Math.max(100, Math.min(Number(options.duration) || 10000, 30000)));
          timer.unref?.();
        }
      }
      return true;
    })();
    if (typeof callback === 'function') {
      promise.then(value => { try { callback(null,value); } catch (_) {} }, err => { try { callback(err); } catch (_) {} });
    }
    return promise;
  };
};

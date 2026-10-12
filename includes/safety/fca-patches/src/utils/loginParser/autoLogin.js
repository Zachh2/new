"use strict";
const { probeSession, stateError } = require("../sessionProbe");

function createMaybeAutoLogin(ctx, http, helpers, emit, parseAndCheckLogin) {
  return async function maybeAutoLogin(resData, resConfig) {
    if (resConfig?._sessionRepairRetried) {
      const e = new Error("Request recovery already attempted; appstate preserved.");
      e.code = "SESSION_REPLAY_REJECTED";
      throw e;
    }
    const generation=ctx._listenGeneration||0;
    function requireActive(){
      if(ctx._ending || ctx.loggedIn===false || generation!==(ctx._listenGeneration||0)){
        const e=new Error('Session changed; request recovery cancelled.');e.code='SESSION_STOPPED';throw e;
      }
    }
    requireActive();
    const result = await probeSession(ctx);
    requireActive();
    if (result.state !== "valid") {
      const error = stateError(result);
      if (result.state === "expired") {
        // Once per context, not once per simultaneously failing command.
        if (!ctx._sessionExpiryReported) {
          ctx._sessionExpiryReported = true;
          emit("sessionExpired", {});
          emit("autoLoginFailed", { error });
        }
      } else if (result.state === "checkpoint" && !ctx._sessionCheckpointReported) {
        ctx._sessionCheckpointReported = true;
        emit("checkpoint", { type: "verification_required" });
      }
      throw error;
    }
    ctx._sessionExpiryReported = false;
    ctx._sessionCheckpointReported = false;
    const url = helpers.buildUrl(resConfig);
    const method = String(resConfig?.method || "GET").toUpperCase();
    const multipart = String(helpers.headerOf(resConfig?.headers, "content-type") || "").toLowerCase().includes("multipart/form-data");
    if (!url || method !== "GET" || multipart) {
      const e = new Error("Session remains valid; please retry the request.");
      e.code = "SESSION_REQUEST_RETRY_REQUIRED";
      throw e;
    }
    // Mutating POST operations require an explicit caller retry: blindly
    // replaying Axios-serialized data can lose the body or repeat the action.
    // Propagate the one-replay marker even through the parser's 5xx retries.
    const guarded = Object.create(http);
    for (const name of ["get", "post", "postFormData"]) {
      if (typeof http[name] !== "function") continue;
      guarded[name] = async (...args) => {
        requireActive();
        const response = await http[name](...args);
        requireActive();
        return { ...response, config: { ...response?.config, _sessionRepairRetried: true } };
      };
    }
    const response = await guarded.get(url, ctx.jar, resConfig.params || null, ctx.globalOptions, ctx);
    requireActive();
    // Preserve the original network error; it is not a logout.
    return parseAndCheckLogin(ctx, guarded)(response);
  };
}
module.exports = { createMaybeAutoLogin };

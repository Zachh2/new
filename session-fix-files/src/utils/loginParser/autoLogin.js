"use strict";
const { probeSession, stateError } = require("../sessionProbe");

function createMaybeAutoLogin(ctx, http, helpers, emit, parseAndCheckLogin) {
  return async function maybeAutoLogin(resData, resConfig) {
    if (resConfig?._sessionRepairRetried) {
      const e = new Error("Request recovery already attempted; appstate preserved.");
      e.code = "SESSION_REPLAY_REJECTED";
      throw e;
    }
    const result = await probeSession(ctx);
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
    if (!url || !["GET", "POST"].includes(method) || multipart) {
      const e = new Error("Session remains valid; please retry the request.");
      e.code = "SESSION_REQUEST_RETRY_REQUIRED";
      throw e;
    }
    // Propagate the one-replay marker even through the parser's 5xx retries.
    const guarded = Object.create(http);
    for (const name of ["get", "post", "postFormData"]) {
      if (typeof http[name] !== "function") continue;
      guarded[name] = async (...args) => {
        const response = await http[name](...args);
        return { ...response, config: { ...response?.config, _sessionRepairRetried: true } };
      };
    }
    const response = method === "GET"
      ? await guarded.get(url, ctx.jar, resConfig.params || null, ctx.globalOptions, ctx)
      : await guarded.post(url, ctx.jar, resConfig.data, ctx.globalOptions, ctx);
    // Preserve the original network error; it is not a logout.
    return parseAndCheckLogin(ctx, guarded)(response);
  };
}
module.exports = { createMaybeAutoLogin };

"use strict";
/**
 * Fetches MQTT sync sequence ID from GraphQL and starts listenMqtt.
 * Retries request failures and verifies web session before reporting expiry.
 * Fixed by Xalman: Added fb_dtsg/jazoest payload & 1357032 Object error fallback.
 */
const { getType } = require("../../../utils/format");
const { parseAndCheckLogin } = require("../../../utils/client");

const { probeSession, stateError } = require("../../../utils/sessionProbe");

module.exports = function createGetSeqID(deps) {
  const { listenMqtt, logger, emitAuth } = deps;

  return function getSeqID(defaultFuncs, api, ctx, globalCallback, form, retryCount = 0, generation = ctx._listenGeneration || 0) {
    const stale=()=>ctx._ending || ctx.loggedIn===false || (ctx._listenGeneration||0)!==generation;
    if(stale())return Promise.resolve();
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;
    ctx.t_mqttCalled = false;

    // Ensure essential tokens are injected into GraphQL Batch Payload
    if (!form) {
      form = {
        av: ctx.globalOptions.pageID || ctx.userID,
        fb_dtsg: ctx.fb_dtsg,
        jazoest: ctx.jazoest,
        queries: JSON.stringify({
          o0: {
            doc_id: "3336396659757871",
            query_params: {
              limit: 1,
              before: null,
              tags: ["INBOX", "PENDING", "OTHER"],
              includeDeliveryReceipts: false,
              includeSeqID: true
            }
          }
        })
      };
    } else {
      if (!form.fb_dtsg && ctx.fb_dtsg) form.fb_dtsg = ctx.fb_dtsg;
      if (!form.jazoest && ctx.jazoest) form.jazoest = ctx.jazoest;
    }

    return defaultFuncs
      .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
      .then(response=>stale()?undefined:parseAndCheckLogin(ctx, defaultFuncs)(response))
      .then(async resData => {
        if(stale())return;
        // Safe check for non-array responses (such as Error Objects from FB)
        if (getType(resData) !== "Array") {
          logger(`getSeqID: Response is not Array, received: ${getType(resData)}`, "warn");

          // Handle Facebook GraphQL 1357032 or transient error responses without triggering re-login
          if (resData && typeof resData === "object") {
            const errCode = resData.error || resData.errorCode;
            const errorMsg = resData.errorSummary || resData.message || "";

            if (errCode === 1357032 || /Something Went Wrong/i.test(errorMsg)) {
              logger("getSeqID: FB returned error 1357032. Using fallback seqID and continuing to MQTT.", "warn");
              ctx.lastSeqId = ctx.lastSeqId || "0";
              listenMqtt(defaultFuncs, api, ctx, globalCallback);
              return;
            }

            if (/Not logged in|blocked the login|checkpoint/i.test(errorMsg)) {
              const authError = new Error(errorMsg);
              authError.error = errorMsg;
              authError.res = resData;
              throw authError;
            }
            if (errCode) {
              throw new Error(`getSeqID: GraphQL error ${String(errCode)}: ${errorMsg}`);
            }
          }

          // Fallback if it's an unrecognized object
          ctx.lastSeqId = ctx.lastSeqId || "0";
          listenMqtt(defaultFuncs, api, ctx, globalCallback);
          return;
        }

        if (!Array.isArray(resData) || !resData.length) {
          throw new Error("getSeqID: empty GraphQL response");
        }
        const lastRes = resData[resData.length - 1];
        if (lastRes && lastRes.successful_results === 0) {
          throw new Error("getSeqID: GraphQL returned no successful results");
        }

        const syncSeqId = resData[0]?.o0?.data?.viewer?.message_threads?.sync_sequence_id;
        if (syncSeqId) {
          ctx.lastSeqId = syncSeqId;
          logger("mqtt getSeqID ok -> listenMqtt()", "info");
        } else {
          ctx.lastSeqId = ctx.lastSeqId || "0";
          logger("getSeqID: sync_sequence_id not found, fallback lastSeqId=" + ctx.lastSeqId, "warn");
        }
        listenMqtt(defaultFuncs, api, ctx, globalCallback);
      })
      .catch(async err => {
        if(stale())return;
        const detail = (err && err.detail && err.detail.message) ? ` | detail=${err.detail.message}` : "";
        const msg = ((err && err.error) || (err && err.message) || String(err || "")) + detail;

        const isAuthError = /Not logged in|blocked the login|checkpoint/i.test(msg);
        const netCode = err?.code || err?.originalError?.code || "";
        const isNetworkError = !isAuthError && (
          netCode === "SESSION_UNVERIFIED" ||
          /timeout|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network error|socket hang up/i.test(msg) ||
          /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|UND_ERR_CONNECT_TIMEOUT/.test(netCode)
        );

        if (isNetworkError) {
          if (retryCount < MAX_RETRIES) {
            const delay = RETRY_DELAY * (retryCount + 1);
            logger(`getSeqID: network error, retry ${retryCount + 1}/${MAX_RETRIES} after ${delay}ms... (${msg})`, "warn");
            await new Promise(resolve => setTimeout(resolve, delay));
            if(stale())return;
            return getSeqID(defaultFuncs, api, ctx, globalCallback, form, retryCount + 1, generation);
          }
          logger(`getSeqID: network error persisted after ${MAX_RETRIES} retries, giving up for now: ${msg}`, "error");
          // [Fixed by xalman] throw instead of silently returning undefined -
          // a bare return here made the caller think this call SUCCEEDED.
          const giveUpErr = new Error(`getSeqID network error persisted after ${MAX_RETRIES} retries: ${msg}`);
          giveUpErr.error = msg;
          giveUpErr.isNetworkError = true;
          throw giveUpErr;
        }

        if (isAuthError) {
          if (retryCount < MAX_RETRIES) {
            const delay = RETRY_DELAY * (retryCount + 1);
            logger(`getSeqID: retry ${retryCount + 1}/${MAX_RETRIES} after ${delay}ms... (error: ${msg})`, "warn");
            await new Promise(resolve => setTimeout(resolve, delay));
            if(stale())return;
            
            return getSeqID(defaultFuncs, api, ctx, globalCallback, form, retryCount + 1, generation);
          }

          // session-repair: verify before declaring expiry
          if (err?.error === "login_blocked" || /^checkpoint_(?:282|956)$/.test(err?.error || "")) {
            return emitAuth(ctx, api, globalCallback, "login_blocked", "Facebook verification required");
          }
          const status = await probeSession(ctx);
          if(stale())return;
          if (status.state === "checkpoint") {
            return emitAuth(ctx, api, globalCallback, "login_blocked", "Facebook verification required");
          }
          if (status.state === "expired") {
            return emitAuth(ctx, api, globalCallback, "not_logged_in", "Web session expired");
          }
          if (status.state !== "valid") throw stateError(status);
          // A GraphQL rejection with valid web cookies is a request failure.
          const requestError = new Error("GraphQL session request failed; web session remains valid.");
          requestError.code = "SESSION_REQUEST_RETRY_REQUIRED";
          throw requestError;
        }

        logger(`getSeqID error: ${msg}`, "error");
        // Keep the appstate and allow getSeqIDWrapper to retry with backoff.
        // HTTP/proxy failures and transient GraphQL errors are not logouts.
        throw err instanceof Error ? err : new Error(msg);
      });
  };
};

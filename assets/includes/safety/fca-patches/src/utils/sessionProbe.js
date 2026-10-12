"use strict";

// Keep uncertain HTTP results separate from an authenticated session rejection.
// No passwords, credential services, cookie replacement, or challenge bypasses.
const checks = new WeakMap();
function destinationState(value) {
  if (!value) return null;
  try {
    const u = new URL(value, "https://www.facebook.com/");
    if (u.protocol !== "https:" || !(u.hostname === "facebook.com" || u.hostname.endsWith(".facebook.com"))) return "unknown";
    if (/^\/checkpoint(?:\/|$)/i.test(u.pathname)) return "checkpoint";
    if (/^\/login(?:\.php)?(?:\/|$)/i.test(u.pathname)) return "expired";
  } catch (_) { return "unknown"; }
  return null;
}
function classify(response, expectedID) {
  if (!response || response.status !== 200) return { state: "unknown" };
  const finalURL = response.request?.res?.responseUrl || response.request?.responseURL;
  const destination = destinationState(finalURL);
  if (destination) return { state: destination };
  const html = typeof response.data === "string" ? response.data : "";
  const action = html.match(/<form\b[^>]*\baction=["']([^"']+)["']/i)?.[1];
  if (destinationState(action) === "checkpoint") return { state: "checkpoint" };
  const loginForm = /<form\b[^>]*\bid=["']login_form["']/i.test(html) && /\bname=["'](?:email|pass)["']/i.test(html);
  if (loginForm) return { state: "expired" };
  const uid = html.match(/"USER_ID"\s*:\s*"([0-9]+)"/)?.[1];
  if (!uid || /^0+$/.test(uid)) return { state: "unknown" };
  if (expectedID && uid !== String(expectedID)) return { state: "mismatch" };
  return { state: "valid" };
}
async function fetchHome(ctx) {
  const { client, proxyClient } = require("./request/client");
  const { cfg } = require("./request/config");
  const { getHeaders } = require("./headers");
  const url = "https://www.facebook.com/", options = ctx.globalOptions || {};
  // Never silently fall back to a direct connection for an invalid proxy URL.
  if (options.proxy) {
    const proxy = new URL(String(options.proxy));
    if (!["http:", "https:"].includes(proxy.protocol)) throw new Error("Unsupported proxy protocol");
  }
  return (options.proxy && proxyClient ? proxyClient : client).get(url, cfg({
    url, reqJar: ctx.jar, headers: getHeaders(url, options, ctx),
    proxyUrl: options.proxy, timeout: 12000
  }));
}
async function probeSession(ctx, fetcher = fetchHome) {
  const prior = checks.get(ctx);
  if (prior?.pending) return prior.pending;
  if (prior && prior.until > Date.now()) return prior.result;
  const record = {};
  checks.set(ctx, record);
  record.pending = (async () => {
    let result;
    try { result = classify(await Promise.resolve().then(() => fetcher(ctx)), ctx.userID); }
    catch (_) { result = { state: "unknown" }; }
    record.result = result;
    // Short backoff on uncertainty; no timer or background heartbeat traffic.
    record.until = Date.now() + (result.state === "unknown" ? 15000 : 2000);
    record.pending = null;
    return result;
  })();
  return record.pending;
}
function stateError(result) {
  const e = new Error(result.state === "expired" ? "Not logged in." :
    result.state === "checkpoint" ? "Facebook checkpoint requires verification." :
    result.state === "mismatch" ? "Session account does not match the running bot." :
    "Session verification unavailable; saved appstate preserved.");
  e.code = result.state === "expired" ? "AUTH_REQUIRED" :
    result.state === "checkpoint" ? "CHECKPOINT_REQUIRED" :
    result.state === "mismatch" ? "SESSION_ACCOUNT_MISMATCH" : "SESSION_UNVERIFIED";
  if (result.state === "expired") e.error = "Not logged in.";
  if (result.state === "checkpoint") e.error = "login_blocked";
  if (result.state === "unknown") e.isNetworkError = true;
  return e;
}
module.exports = { classify, probeSession, stateError, fetchHome };

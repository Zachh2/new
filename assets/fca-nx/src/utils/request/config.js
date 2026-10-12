"use strict";

const { URL } = require("url");
const { sanitizeHeaders } = require("./sanitize");
const { jar } = require("./client");

function proxyConfigFor(proxyUrl) {
  let u;
  try {
    u = new URL(String(proxyUrl));
  } catch (e) {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  return {
    protocol: u.protocol,
    host: u.hostname,
    port: +u.port || (u.protocol === "https:" ? 443 : 80),
    auth: u.username
      ? { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) }
      : undefined,
  };
}

// Proxied requests use the raw proxyClient, so the cookiejar wrapper cannot
// install its own agents. Attach Cookie from this session's jar; proxyClient's
// response interceptor in client.js stores Set-Cookie back into the same jar.
function cookieHeaderFor(url, activeJar) {
  try {
    if (activeJar && typeof activeJar.getCookieStringSync === "function") {
      const s = activeJar.getCookieStringSync(url);
      return s || undefined;
    }
  } catch (e) {}
  return undefined;
}

function cfg(base = {}) {
  const { reqJar, headers, params, agent, timeout, proxyUrl, url } = base;
  const activeJar = reqJar || jar;

  if (proxyUrl) {
    let proxy;
    try { proxy = proxyConfigFor(proxyUrl); } catch (_) {}
    if(!proxy){
      const e=new Error('Configured proxy is invalid or unsupported; request cancelled.');
      e.code='INVALID_PROXY_CONFIG';throw e;
    }
    if (proxy) {
      const cookieHeader = cookieHeaderFor(url, activeJar);
      const finalHeaders = sanitizeHeaders(headers);
      if (cookieHeader) finalHeaders["Cookie"] = cookieHeader;
      return {
        headers: finalHeaders,
        params,
        withCredentials: true,
        timeout: timeout || 60000,
        proxy,
        jar: null,
        _jar: activeJar,
        validateStatus: (s) => s >= 200 && s < 600,
      };
    }
  }

  // No configured proxy: classic jar + interceptor path. Agents are explicitly
  // nulled so options left on the instance defaults (e.g. by setProxy) are not
  // inherited, which would make axios-cookiejar-support throw.
  void agent;
  return {
    headers: sanitizeHeaders(headers),
    params,
    jar: activeJar,
    withCredentials: true,
    timeout: timeout || 60000,
    httpAgent: null,
    httpsAgent: null,
    proxy: false,
    validateStatus: (s) => s >= 200 && s < 600,
  };
}

module.exports = {
  cfg,
  proxyConfigFor,
};

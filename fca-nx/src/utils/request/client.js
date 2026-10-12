"use strict";

const axios = require("axios");
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");

const jar = new CookieJar();
const defaults = {
  timeout: 60000,
  validateStatus: (s) => s >= 200 && s < 600,
  maxRedirects: 5,
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
};
const client = wrapper(axios.create({ ...defaults, jar, withCredentials: true }));

// The cookiejar wrapper installs its own agents. Axios's native HTTP proxy
// cannot use those agents, so proxied requests use a separate raw instance.
// config.js supplies the Cookie header and _jar for persisting Set-Cookie.
const proxyClient = axios.create({ ...defaults });

// Persist `Set-Cookie` from responses into the request's jar. Needed for the
// native-proxy path (see ./config.js) where the axios-cookiejar-support
// interceptor is bypassed and no cookie agent is installed.
function saveResponseCookies(response) {
  try {
    const cfg = response.config || {};
    const targetJar = cfg._jar || cfg.jar;
    const url = cfg.url;
    if (targetJar && url && typeof targetJar.setCookieSync === "function") {
      const setCookie = response.headers && response.headers["set-cookie"];
      const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
      for (const sc of list) {
        try {
          targetJar.setCookieSync(sc, url, { loose: true });
        } catch (e) {}
      }
    }
  } catch (e) {}
  return response;
}
for (const requester of [client, proxyClient]) {
  requester.interceptors.response.use(saveResponseCookies, (err) => Promise.reject(err));
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  jar,
  client,
  proxyClient,
  delay,
};

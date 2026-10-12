"use strict";

const dns = require("dns").promises;
const axios = require("axios");
const http = require("http");
const https = require("https");
const net = require("net");
const tls = require("tls");
const { client } = require("./client");

// External plain-text "what is my IP" endpoints, tried in order. Each is
// contacted THROUGH the proxy so the IP shown is the real exit node the
// proxy hands to Facebook.
const IP_ECHO_URLS = [
  "https://api.ipify.org",
  "http://api.ipify.org",
  "https://ifconfig.me/ip",
  "https://checkip.amazonaws.com",
];

const PROXY_BADGE = "⬡ [FCA] Proxy";

// The installed https-proxy-agent/agent-base combination does not reliably
// support wss:// with this Node version and both proxy URL schemes. Use Node's
// CONNECT request and TLS APIs so HTTP and HTTPS proxy transports are explicit.
class MqttProxyAgent extends https.Agent {
  constructor(proxyUrl) {
    super({ keepAlive: false });
    this.proxyUrl = new URL(proxyUrl);
    if (!['http:', 'https:'].includes(this.proxyUrl.protocol)) {
      throw new Error('MQTT proxy must use http: or https:');
    }
  }

  createConnection(options, callback) {
    const proxy = this.proxyUrl;
    const host = options.host || options.hostname;
    const target = `${net.isIP(host) === 6 ? `[${host}]` : host}:${options.port || 443}`;
    const headers = { Host: target, 'Proxy-Connection': 'Keep-Alive' };
    if (proxy.username || proxy.password) {
      const auth = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
      headers['Proxy-Authorization'] = `Basic ${Buffer.from(auth).toString('base64')}`;
    }

    let finished = false;
    const finish = (error, socket) => {
      if (finished) {
        socket?.destroy?.();
        return;
      }
      finished = true;
      callback(error, socket);
    };
    const transport = proxy.protocol === 'https:' ? https : http;
    const request = transport.request({
      hostname: proxy.hostname,
      port: Number(proxy.port) || (proxy.protocol === 'https:' ? 443 : 80),
      method: 'CONNECT',
      path: target,
      headers,
      agent: false,
      timeout: 10000
    });
    request.once('connect', (response, tunnel, head) => {
      if (response.statusCode !== 200) {
        tunnel.destroy();
        return finish(new Error(`MQTT proxy CONNECT failed: HTTP ${response.statusCode}`));
      }
      if (head?.length) tunnel.unshift(head);
      const secure = tls.connect({
        socket: tunnel,
        servername: options.servername || (net.isIP(host) ? undefined : host),
        rejectUnauthorized: options.rejectUnauthorized !== false,
        ALPNProtocols: ['http/1.1']
      });
      const onError = error => finish(error);
      secure.once('error', onError);
      secure.once('secureConnect', () => {
        secure.removeListener('error', onError);
        finish(null, secure);
      });
    });
    request.once('response', response => {
      response.resume();
      finish(new Error(`MQTT proxy CONNECT failed: HTTP ${response.statusCode}`));
    });
    request.once('timeout', () => request.destroy(new Error('MQTT proxy CONNECT timed out')));
    request.once('error', error => finish(error));
    request.end();
  }
}

// Per-proxy URL agent cache; each account keeps the same network path.
const agentCache = new Map();

function getAgentForProxy(proxyUrl) {
  const key = proxyUrl || "";
  if (!key) return undefined;
  if (agentCache.has(key)) return agentCache.get(key);
  const agent = new MqttProxyAgent(key);
  agentCache.set(key, agent);
  return agent;
}

// Global default proxy setter, kept for backward compatibility with
// existing callers (api.setOptions({ proxy })) and single-account use.
// NOTE: this changes the DEFAULT used only when a request doesn't specify
// its own per-session proxy (see cfg() in ./config.js, which now prefers
// ctx.globalOptions.proxy when present). In a multi-account process, each
// account's requests should carry their own ctx.globalOptions.proxy so
// calling setProxy() for one account can no longer change another running
// account's outbound IP mid-session - that accidental cross-session proxy
// change was flagged as a real risk for "abnormal session" detection.
function setProxy(proxyUrl) {
  // HTTP requests use Axios's native per-request proxy in config.js. A
  // process-wide tunneling agent is unnecessary here and can be incompatible
  // with the cookie-jar interceptor. MQTT obtains its own tunnel separately.
  void proxyUrl;
  client.defaults.httpAgent = undefined;
  client.defaults.httpsAgent = undefined;
  client.defaults.proxy = false;
}

// ---------------------------------------------------------------------------
// Proxy connection indicator.
//
// console.logs whether FCA is talking through a proxy (and the exit IP the
// proxy actually assigned) or is on a plain direct connection. Fired after a
// successful login; never blocks the login callback.
// ---------------------------------------------------------------------------
function maskAuth(u) {
  const cred = u.username ? `${u.username}${u.password ? ":***" : ""}@` : "";
  return `${u.protocol}//${cred}${u.host}`;
}

async function exitIpThrough(proxyCfg) {
  for (const url of IP_ECHO_URLS) {
    try {
      const res = await axios({
        method: "get",
        url,
        timeout: 12000,
        validateStatus: (s) => s >= 200 && s < 300,
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        proxy: proxyCfg,
      });
      const ip = String(res.data || "").trim();
      if (/^[\d.a-fA-F:]+$/.test(ip)) return ip;
    } catch (e) {
      // try the next echo endpoint
    }
  }
  return null;
}

function logProxyStatus(globalOptions) {
  const proxyUrl = (globalOptions && globalOptions.proxy) || "";
  const run = (async () => {
    if (!proxyUrl) {
      console.log(`${PROXY_BADGE} NOT connected — no proxy configured (DIRECT connection)`);
      return;
    }

    let u = null;
    try {
      u = new URL(String(proxyUrl));
    } catch (e) {
      console.log(`${PROXY_BADGE} NOT connected — invalid proxy URL (${String(proxyUrl)})`);
      return;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      console.log(`${PROXY_BADGE} NOT connected — unsupported proxy protocol (${u.protocol}//)`);
      return;
    }

    const display = maskAuth(u);

    // Real check: punch a request through the proxy and read the exit IP.
    const exitIp = await exitIpThrough({
      protocol: u.protocol,
      host: u.hostname,
      port: +u.port || (u.protocol === "https:" ? 443 : 80),
      auth: u.username
        ? { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) }
        : undefined,
    });

    if (exitIp) {
      console.log(`${PROXY_BADGE} connected ✓ ${display}  (IP: ${exitIp})`);
      return;
    }

    // Trough-proxy echo failed; at least report the proxy host's own address.
    let hostIp = "unknown";
    try {
      const lookup = await dns.lookup(u.hostname);
      if (lookup && lookup.address) hostIp = lookup.address;
    } catch (e) {}
    console.log(`${PROXY_BADGE} connected? ${display}  (host IP: ${hostIp}, exit IP could not be verified)`);
  })();

  run.catch((e) => {
    console.log(`${PROXY_BADGE} connection check failed (${(e && e.message) || String(e)})`);
  });

  return run;
}

module.exports = {
  setProxy,
  getAgentForProxy,
  logProxyStatus,
};

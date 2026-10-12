'use strict';

// Resolve the account's proxy once and reuse the same exit point for login,
// HTTP requests made by the FCA client, and Messenger's MQTT socket.
function configureProxy(options = {}, config = {}, env = process.env) {
  const result = { ...options };
  const chosen = env.FB_PROXY_URL || result.proxy || config.proxy;
  if (!chosen) return { options: result, enabled: false };
  if (typeof chosen !== 'string') throw new Error('Facebook proxy must be a URL string');
  let parsed;
  try { parsed = new URL(chosen); }
  catch (_) { throw new Error('Facebook proxy URL is invalid'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname)
    throw new Error('Facebook proxy must be an http(s) URL with a host');
  result.proxy = chosen;
  return { options: result, enabled: true };
}

module.exports = { configureProxy };

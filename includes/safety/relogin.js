/**
 * Log back in with email + password, and write a fresh appstate.json.
 *
 * Why not just use the library: fbvibex's password login scrapes
 * "#login_form" out of www.facebook.com, a page that hasn't looked like that
 * for years, and dies on a JSON blob that no longer exists. This does the
 * login itself against mbasic.facebook.com, which still serves a plain HTML
 * form, and keeps its own cookie jar so the result can be written straight out
 * as an appstate.
 *
 * It only ever runs when the cookies are already dead, and main.js limits how
 * often it may try.
 */
const axios = require("axios");

const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/140.0.0.0 Mobile Safari/537.36";

// ---------------------------------------------------------------------------
// a tiny cookie jar - enough for one login, no extra dependency
// ---------------------------------------------------------------------------
function makeJar() {
  const jar = new Map();

  return {
    absorb(headers) {
      const set = headers && (headers["set-cookie"] || headers["Set-Cookie"]);
      if (!set) return;
      for (const line of [].concat(set)) {
        const [pair] = String(line).split(";");
        const idx = pair.indexOf("=");
        if (idx < 1) continue;
        const key = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (/^deleted$/i.test(value) || value === "") jar.delete(key);
        else jar.set(key, value);
      }
    },
    header() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    get(key) { return jar.get(key); },
    size() { return jar.size; },
    /** in the shape fca expects in appstate.json */
    toAppState() {
      const now = new Date().toISOString();
      return [...jar.entries()].map(([key, value]) => ({
        key,
        value,
        domain: ".facebook.com",
        path: "/",
        hostOnly: false,
        creation: now,
        lastAccessed: now
      }));
    }
  };
}

function fields(html) {
  const out = {};
  const re = /<input[^>]+>/gi;
  let tag;
  while ((tag = re.exec(html))) {
    const name = (tag[0].match(/name="([^"]*)"/i) || [])[1];
    if (!name) continue;
    const type = (tag[0].match(/type="([^"]*)"/i) || [])[1] || "text";
    const value = (tag[0].match(/value="([^"]*)"/i) || [])[1] || "";
    if (/submit|button/i.test(type) && name !== "login") continue;
    out[name] = value;
  }
  return out;
}

function formAction(html) {
  const m = html.match(/<form[^>]+id="login_form"[^>]*action="([^"]+)"/i)
    || html.match(/<form[^>]+action="([^"]+)"[^>]*id="login_form"/i)
    || html.match(/<form[^>]+action="([^"]*login[^"]*)"/i);
  if (!m) return null;
  return m[1].replace(/&amp;/g, "&");
}

function absolute(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return "https://mbasic.facebook.com" + (url.startsWith("/") ? url : "/" + url);
}

async function step(jar, method, url, data) {
  const res = await axios({
    method,
    url,
    data,
    timeout: 30000,
    maxRedirects: 0,
    validateStatus: (s) => s >= 200 && s < 400,
    headers: {
      "user-agent": MOBILE_UA,
      "accept": "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
      "content-type": method === "post" ? "application/x-www-form-urlencoded" : undefined,
      "cookie": jar.header() || undefined,
      "origin": method === "post" ? "https://mbasic.facebook.com" : undefined,
      "referer": "https://mbasic.facebook.com/"
    }
  });
  jar.absorb(res.headers);
  return res;
}

/**
 * @returns {Promise<{ok: true, appState: object[]} | {ok: false, reason: string, detail?: string}>}
 */
async function relogin(email, password) {
  const jar = makeJar();

  // 1. the login page, for its hidden fields
  let page;
  try {
    page = await step(jar, "get", "https://mbasic.facebook.com/login.php");
  } catch (e) {
    return { ok: false, reason: "could not open the login page", detail: (e && e.message) || String(e) };
  }

  const html = String(page.data || "");
  const action = absolute(formAction(html));
  if (!action) {
    return { ok: false, reason: "login form not found on the page" };
  }

  const form = fields(html);
  form.email = email;
  form.pass = password;
  delete form.sign_up;

  // 2. submit it
  let res;
  try {
    res = await step(jar, "post", action, new URLSearchParams(form).toString());
  } catch (e) {
    return { ok: false, reason: "login request failed", detail: (e && e.message) || String(e) };
  }

  // 3. follow the redirects; the cookies land along the way
  let hops = 0;
  while (res.status >= 300 && res.status < 400 && res.headers.location && hops < 6) {
    const next = absolute(res.headers.location);
    if (/checkpoint/i.test(next)) {
      return { ok: false, reason: "checkpoint", detail: "Facebook wants you to confirm this login in a browser" };
    }
    if (/two_step_verification|login\/device|approvals/i.test(next)) {
      return { ok: false, reason: "two-factor", detail: "this account needs a verification code" };
    }
    try {
      res = await step(jar, "get", next);
    } catch (e) {
      break;
    }
    hops++;
  }

  const body = String(res.data || "");
  if (!jar.get("c_user")) {
    if (/checkpoint/i.test(body)) return { ok: false, reason: "checkpoint", detail: "confirm the login in a browser first" };
    if (/approvals_code|two-factor|login_approval/i.test(body)) return { ok: false, reason: "two-factor", detail: "a verification code is required" };
    if (/incorrect|wrong password|password you.{0,10}entered/i.test(body)) return { ok: false, reason: "wrong email or password" };
    return { ok: false, reason: "no login cookie came back", detail: `${jar.size()} cookie(s) received` };
  }

  // xs is the session secret - without it the appstate is useless
  if (!jar.get("xs")) {
    return { ok: false, reason: "logged in but no session cookie (xs) was issued" };
  }

  return { ok: true, appState: jar.toAppState(), userID: jar.get("c_user") };
}

module.exports = { relogin };

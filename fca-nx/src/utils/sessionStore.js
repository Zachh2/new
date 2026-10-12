"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const owners = new Map();
const stores = new WeakMap();

function unwrap(value) {
  return Array.isArray(value) ? value : value && Array.isArray(value.appState) ? value.appState : null;
}
function usableState(value, expectedUser) {
  const state = unwrap(value);
  if (!state || !state.length) return false;
  const auth = Object.create(null);
  for (const c of state) {
    if (!c || typeof c !== "object" || typeof c.value !== "string" || !(c.key || c.name)) return false;
    const key = c.key || c.name;
    if (!["c_user", "i_user", "xs"].includes(key)) continue;
    const domain = String(c.domain || "facebook.com").replace(/^\./, "").toLowerCase();
    if (domain !== "facebook.com" && !domain.endsWith(".facebook.com")) continue;
    const expiry = c.expires !== undefined ? c.expires : c.expirationDate;
    let expiresAt = Infinity;
    if (expiry != null && expiry !== "Infinity" && expiry !== -1) {
      expiresAt = typeof expiry === "number" ? expiry * (expiry < 1e12 ? 1000 : 1) : Date.parse(expiry);
    }
    if (!c.value || !Number.isFinite(expiresAt) && expiresAt !== Infinity || expiresAt <= Date.now()) continue;
    auth[key] = c.value;
  }
  if (!/^[1-9]\d*$/.test(auth.c_user || "") || !auth.xs) return false;
  return !expectedUser || String(auth.i_user || auth.c_user) === String(expectedUser);
}
function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + "." + process.pid + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
  let fd;
  try {
    fd = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(fd, data, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(temp, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temp); } catch (_) {}
  }
}
function getStore(api, ctx, file) {
  file = path.resolve(file);
  let byPath = stores.get(api);
  if (!byPath) { byPath = new Map(); stores.set(api, byPath); }
  if (byPath.has(file)) return byPath.get(file);
  const expected = String(typeof api.getCurrentUserID === "function" ? api.getCurrentUserID() : ctx.userID || "");
  const token = {};
  owners.set(file, token);
  const backup = file + ".bak";
  function active() { return owners.get(file) === token && ctx.loggedIn !== false && !ctx._ending; }
  function read(target) {
    try { const raw = fs.readFileSync(target, "utf8"); return { raw, state: unwrap(JSON.parse(raw)) }; }
    catch (_) { return null; }
  }
  function save() {
    if (!active()) return false;
    const state = unwrap(api.getAppState());
    if (!usableState(state, expected)) return false;
    const old = read(file), bak = read(backup);
    // A path belonging to a different account must not be silently reused.
    if (old && usableState(old.state) && !usableState(old.state, expected)) return false;
    const data = JSON.stringify(state, null, 2);
    if (old && old.raw === data && bak && usableState(bak.state, expected)) return true;
    if (old && usableState(old.state, expected)) atomicWrite(backup, JSON.stringify(old.state, null, 2));
    else if (!bak || !usableState(bak.state, expected)) atomicWrite(backup, data);
    atomicWrite(file, data);
    return true;
  }
  function restore() {
    if (!active()) return false;
    const bak = read(backup), current = read(file);
    if (current && usableState(current.state) && !usableState(current.state, expected)) return false;
    if (!bak || !usableState(bak.state, expected)) return false;
    atomicWrite(file, JSON.stringify(bak.state, null, 2));
    return true;
  }
  function healthy() { const current = read(file); return !!(current && usableState(current.state, expected)); }
  const store = { save, restore, healthy };
  byPath.set(file, store);
  return store;
}
module.exports = { getStore, usableState, unwrap };

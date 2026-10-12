'use strict';
const fs = require('fs');

function atomicWrite(file, contents) {
  const temp = file + '.' + process.pid + '.' + Math.random().toString(36).slice(2) + '.tmp';
  let fd;
  try {
    fd = fs.openSync(temp, 'w', 0o600);
    fs.writeFileSync(fd, contents);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temp, file);
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temp); } catch (_) {}
    throw error;
  }
}

function createAppStateStore(api, file, isAlive, encode = async text => text, encodeSync = text => text, decode = text => text) {
  const backup = file.replace(/\.json$/, '') + '.backup.json';
  const expectedUser = String(api.getCurrentUserID?.() || api.ctx?.userID || '');
  let lastPlain;
  let inflight = Promise.resolve();
  let generation = 0;
  let stopped = false;
  function belongsToAccount(state) {
    // FCA prefers i_user when both cookies exist; match its active identity.
    const user = state.find(c => c && (c.key === 'i_user' || c.name === 'i_user')) ||
      state.find(c => c && (c.key === 'c_user' || c.name === 'c_user'));
    return !expectedUser || (user && String(user.value) === expectedUser);
  }
  function snapshot() {
    if (stopped || api.ctx?.loggedIn === false) return null;
    try {
      const state = api.getAppState();
      if (!isAlive(state) || !belongsToAccount(state)) return null;
      return JSON.stringify(state, null, '\t');
    } catch (_) { return null; }
  }
  function validExisting(path) {
    try {
      const contents = fs.readFileSync(path, 'utf8');
      const state = JSON.parse(decode(contents));
      return isAlive(state) && belongsToAccount(state) ? contents : null;
    } catch (_) { return null; }
  }
  function writeBoth(contents) {
    // Save the previous usable session before replacing the primary file.
    // A corrupt primary must not overwrite a good backup.
    const previous = validExisting(file) || validExisting(backup);
    atomicWrite(backup, previous || contents);
    atomicWrite(file, contents);
  }
  function saveSync() {
    generation++;
    if (typeof encodeSync !== 'function') return false;
    const plain = snapshot();
    if (!plain) return false; // Never replace valid cookies with a logged-out jar.
    if (plain === lastPlain && validExisting(file) && validExisting(backup)) return true;
    try {
      writeBoth(encodeSync(plain));
      lastPlain = plain;
      return true;
    } catch (error) {
      console.error('[appstate] Save on shutdown failed:', error.message);
      return false;
    }
  }
  function save() {
    const requested = ++generation;
    const next = inflight.catch(() => {}).then(async () => {
      const plain = snapshot();
      if (!plain) return false;
      if (plain === lastPlain && validExisting(file) && validExisting(backup)) return true;
      const encoded = await encode(plain);
      if (requested !== generation || stopped || api.ctx?.loggedIn === false) return false;
      writeBoth(encoded);
      lastPlain = plain;
      return true;
    });
    inflight = next;
    return next;
  }
  function stop() { stopped = true; generation++; }
  return { save, saveSync, stop };
}

module.exports = { createAppStateStore };

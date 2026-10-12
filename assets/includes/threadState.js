'use strict';
const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'database/data/threadsData.json');
const oldPath = path.join(__dirname, 'database/data/threads.json');

function createStore(file = filePath, legacyFile = oldPath) {
  let cachedRecords;
  let cachedSignature;
  function signature() {
    try {
      const stat = fs.statSync(file);
      return `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    } catch (err) {
      if (err.code === 'ENOENT') return 'missing';
      throw err;
    }
  }
  function read() {
    const current = signature();
    if (cachedRecords && current === cachedSignature) return cachedRecords;
    try {
      const records = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!records || typeof records !== 'object' || Array.isArray(records)) throw new Error('Expected a thread-ID object');
      cachedRecords = records;
      cachedSignature = current;
      return records;
    } catch (err) {
      if (err.code === 'ENOENT') {
        cachedRecords = {};
        cachedSignature = 'missing';
        return cachedRecords;
      }
      throw new Error('Cannot read threadsData.json; existing data was preserved: ' + err.message);
    }
  }
  function oldSettings() {
    try {
      const saved = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch (err) {
      if (err.code === 'ENOENT') return {};
      throw new Error('Cannot migrate the previous group settings: ' + err.message);
    }
  }
  function normalize(value) {
    const language = ['en', 'tl', 'ilo', 'ceb', 'hil'].includes(value?.language) ? value.language : null;
    return { ...value, started: value?.started === true && !!language, language, awaitingLanguage: value?.awaitingLanguage === true };
  }
  function get(id) {
    const records = read();
    return normalize(records[String(id)]?.botSettings || {});
  }
  function write(records) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.' + process.pid + '.tmp';
    let fd;
    try {
      fd = fs.openSync(tmp, 'w', 0o600);
      fs.writeFileSync(fd, JSON.stringify(records, null, 4) + '\n');
      fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined;
      fs.renameSync(tmp, file);
      cachedRecords = records;
      cachedSignature = signature();
    } catch (err) {
      if (fd !== undefined) fs.closeSync(fd);
      try { fs.unlinkSync(tmp); } catch (_) {}
      throw err;
    }
  }
  function blankRecord(id) {
    return {
      threadInfo: { threadID: id, isGroup: true },
      createTime: { timestamp: Date.now() },
      data: { timestamp: Date.now() }
    };
  }
  function update(id, patch) {
    id = String(id);
    if (!/^\d+$/.test(id)) throw new Error('Invalid thread ID');
    const records = read();
    const record = records[id] || blankRecord(id);
    // Preserve all existing thread metadata, member lists, bans and balances.
    const current = record.botSettings || oldSettings()[id] || {};
    records[id] = { ...record, botSettings: { ...normalize(current), ...patch, updatedAt: new Date().toISOString() } };
    write(records);
    return normalize(records[id].botSettings);
  }
  function ensureGroups(ids, imported = {}) {
    const records = read();
    const previous = oldSettings();
    let changed = 0;
    for (const raw of ids) {
      const id = String(raw);
      if (!/^\d+$/.test(id)) continue;
      const record = records[id] || imported[id] || blankRecord(id);
      if (records[id]?.botSettings) continue;
      records[id] = { ...record, botSettings: {
        ...normalize(previous[id] || record.botSettings || {}),
        updatedAt: new Date().toISOString()
      } };
      changed++;
    }
    if (changed) write(records);
    return changed;
  }
  return { get, update, ensureGroups, file };
}
module.exports = createStore();
module.exports.createStore = createStore;

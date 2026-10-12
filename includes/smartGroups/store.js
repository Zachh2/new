'use strict';
const fs = require('fs');
const path = require('path');
const blank = () => ({ version: 1, messages: [], streaks: {}, mentions: [], contexts: {}, seen: {}, catchup: {}, bans: {} });
function createStore(root = path.join(__dirname, '../database/data/smartGroups'), legacyFile = path.join(__dirname, '../../usersData.json')) {
  const migrate=require('./streakLegacy').createMigration(legacyFile);
  const queues = new Map();
  function file(id) { if (!/^\d+$/.test(String(id))) throw new Error('Invalid thread ID'); return path.join(root, String(id) + '.json'); }
  async function read(id) {
    try {
      const d = JSON.parse(await fs.promises.readFile(file(id), 'utf8'));
      if (d.version !== 1 || !Array.isArray(d.messages) || !Array.isArray(d.mentions)) throw new Error('Invalid smart-group data');
      return migrate(id, { ...blank(), ...d });
    } catch (e) { if (e.code === 'ENOENT') return migrate(id, blank()); throw e; }
  }
  async function write(id, data) {
    await fs.promises.mkdir(root, { recursive: true });
    const target = file(id), temp = target + '.' + process.pid + '.tmp';
    let handle;
    try {
      handle = await fs.promises.open(temp, 'w', 0o600);
      await handle.writeFile(JSON.stringify(data)); await handle.sync(); await handle.close(); handle = null;
      await fs.promises.rename(temp, target);
    } finally {
      if (handle) await handle.close();
      try { await fs.promises.unlink(temp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
  }
  function transaction(id, update) {
    id = String(id);
    const next = (queues.get(id) || Promise.resolve()).catch(() => {}).then(async () => {
      const data = await read(id), result = await update(data);
      await write(id, data); return result;
    });
    queues.set(id, next);
    next.finally(() => { if (queues.get(id) === next) queues.delete(id); }).catch(() => {});
    return next;
  }
  async function snapshot(id) { await queues.get(String(id)); return read(id); }
  async function ids() {
    try { return (await fs.promises.readdir(root)).filter(f => /^\d+\.json$/.test(f)).map(f => f.slice(0,-5)); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  }
  return { transaction, snapshot, ids };
}
module.exports = { createStore };

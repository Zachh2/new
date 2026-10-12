/**
 * MySQL persistence for the bot's data (users, threads, and the small cache
 * files under modules/).
 *
 * How it works, and why it works this way:
 *
 * About a dozen commands (balance, daily, work, pay, rank, slot, ...) and most
 * of the dashboard routes read and write includes/database/data/*.json
 * DIRECTLY, not through Users/Threads. Swapping those files out for SQL calls
 * would mean rewriting all of them and breaking anything you add later that
 * follows the same pattern.
 *
 * So the JSON files stay as the live working copy, and this module keeps the
 * database as the durable mirror:
 *
 *   boot  - if the JSON files are missing or empty and the database has rows,
 *           the files are rebuilt from the database (this is what saves you
 *           after a panel wipe or reinstall). Otherwise the local files win and
 *           are pushed up.
 *   run   - every few seconds, changed records are upserted and deleted records
 *           removed. Only what actually changed is sent.
 *   exit  - a final flush on shutdown/restart.
 *
 * If MySQL is unreachable or not configured, the bot keeps running exactly as
 * before on JSON alone - the database is a safety net, never a dependency.
 *
 * Credentials: environment variables win over config.json, so you don't have to
 * keep the password in a file you might share.
 *   DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD
 */

const fs = require("fs-extra");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "usersData.json");
const THREADS_FILE = path.join(DATA_DIR, "threadsData.json");

let pool = null;
let timer = null;
let lastSync = 0;
let lastError = null;
const hashes = { users: new Map(), threads: new Map(), kv: new Map() };
let syncing = false;

function log(msg, level) {
  const tag = "[database]";
  if (level === "error") console.error(tag, msg);
  else console.log(tag, msg);
}

function settings() {
  const c = (global.config && global.config.database) || {};
  return {
    enabled: process.env.DB_HOST ? true : c.enabled === true,
    host: process.env.DB_HOST || c.host || "",
    port: Number(process.env.DB_PORT || c.port || 3306),
    user: process.env.DB_USER || c.user || "",
    password: process.env.DB_PASSWORD || c.password || "",
    name: process.env.DB_NAME || c.name || "",
    syncSeconds: Number(c.syncSeconds || 20),
    forceRestore: c.forceRestore === true,
    extraFiles: [...new Set([
      ...(Array.isArray(c.extraFiles) ? c.extraFiles : []),
      'modules/commands/cache/calladReplies.json'
    ])],
  };
}

function readJSON(file) {
  try {
    const raw = fs.readFileSync(file, "utf8").trim();
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch (e) {
    return null; // missing or corrupt
  }
}

function writeJSON(file, obj) {
  const tmp = file + ".tmp";
  fs.ensureDirSync(path.dirname(file));
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 4));
  fs.renameSync(tmp, file);
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_users (
      userID     VARCHAR(32)  NOT NULL PRIMARY KEY,
      name       VARCHAR(255) NULL,
      money      BIGINT       NOT NULL DEFAULT 0,
      exp        BIGINT       NOT NULL DEFAULT 0,
      banned     TINYINT(1)   NOT NULL DEFAULT 0,
      data       LONGTEXT     NOT NULL,
      updatedAt  BIGINT       NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_threads (
      threadID   VARCHAR(32)  NOT NULL PRIMARY KEY,
      threadName VARCHAR(255) NULL,
      isGroup    TINYINT(1)   NOT NULL DEFAULT 0,
      banned     TINYINT(1)   NOT NULL DEFAULT 0,
      data       LONGTEXT     NOT NULL,
      updatedAt  BIGINT       NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_files (
      path       VARCHAR(190) NOT NULL PRIMARY KEY,
      content    LONGTEXT     NOT NULL,
      updatedAt  BIGINT       NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

const str = (v) => (v === undefined || v === null ? null : String(v).slice(0, 250));

function userRow(id, rec) {
  return [
    String(id),
    str(rec.name),
    Number(rec.money) || 0,
    Number(rec.exp) || 0,
    rec.banned === true || (rec.data && rec.data.banned === true) ? 1 : 0,
    JSON.stringify(rec),
    Date.now(),
  ];
}

function threadRow(id, rec) {
  const info = rec.threadInfo || {};
  return [
    String(id),
    str(info.threadName),
    info.isGroup ? 1 : 0,
    rec.data && rec.data.banned === true ? 1 : 0,
    JSON.stringify(rec),
    Date.now(),
  ];
}

async function upsert(table, columns, rows) {
  if (!rows.length) return;
  const updates = columns.slice(1).map((c) => `\`${c}\`=VALUES(\`${c}\`)`).join(", ");
  const placeholders = "(" + columns.map(() => "?").join(",") + ")";
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const sql =
      `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(",")}) VALUES ` +
      chunk.map(() => placeholders).join(",") +
      ` ON DUPLICATE KEY UPDATE ${updates}`;
    await pool.query(sql, chunk.flat());
  }
}

async function removeRows(table, key, ids) {
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    await pool.query(
      `DELETE FROM \`${table}\` WHERE \`${key}\` IN (${chunk.map(() => "?").join(",")})`,
      chunk
    );
  }
}

/** Pull everything out of the database and rebuild the JSON files. */
async function restoreFromDatabase() {
  const [users] = await pool.query("SELECT userID, data FROM bot_users");
  const [threads] = await pool.query("SELECT threadID, data FROM bot_threads");
  const [files] = await pool.query("SELECT path, content FROM bot_files");

  const usersObj = {};
  for (const r of users) {
    try { usersObj[r.userID] = JSON.parse(r.data); } catch (e) {}
  }
  const threadsObj = {};
  for (const r of threads) {
    try { threadsObj[r.threadID] = JSON.parse(r.data); } catch (e) {}
  }

  writeJSON(USERS_FILE, usersObj);
  writeJSON(THREADS_FILE, threadsObj);

  let restoredFiles = 0;
  for (const r of files) {
    const target = path.join(ROOT, r.path);
    if (!target.startsWith(ROOT)) continue;              // never write outside the bot folder
    if (fs.existsSync(target)) continue;                 // don't clobber a live file
    try {
      fs.ensureDirSync(path.dirname(target));
      fs.writeFileSync(target, r.content);
      restoredFiles++;
    } catch (e) {}
  }

  log(`Restored ${Object.keys(usersObj).length} users, ${Object.keys(threadsObj).length} threads` +
      (restoredFiles ? `, ${restoredFiles} cache file(s)` : "") + " from the database.");
}

// Restore missing small JSON files independently of usersData/threadsData.
// A reinstall may retain those main files while losing per-GC onboarding settings.
async function restoreMissingExtraFiles() {
  const allowed = new Set(settings().extraFiles);
  if (!allowed.size) return;
  const [files] = await pool.query("SELECT path, content FROM bot_files");
  for (const row of files) {
    if (!allowed.has(row.path)) continue;
    const target = path.resolve(ROOT, row.path);
    if (!target.startsWith(ROOT + path.sep) || fs.existsSync(target)) continue;
    fs.ensureDirSync(path.dirname(target));
    fs.writeFileSync(target, row.content);
  }
}

// The local archive may contain older thread records than the MySQL mirror.
// Preserve the newer onboarding choice before the startup sync updates SQL.
async function restoreNewerGroupSettings() {
  const local = readJSON(THREADS_FILE);
  if (!local) return;
  const [rows] = await pool.query("SELECT threadID, data FROM bot_threads WHERE isGroup = 1");
  let changed = false;
  for (const row of rows) {
    let remote;
    try { remote = JSON.parse(row.data); } catch (_) { continue; }
    const incoming = remote?.botSettings;
    const record = local[row.threadID];
    if (!incoming || !record) continue;
    const current = record.botSettings;
    if (!current || Date.parse(incoming.updatedAt) > (Date.parse(current.updatedAt) || 0)) {
      local[row.threadID] = { ...record, botSettings: incoming };
      changed = true;
    }
  }
  if (changed) writeJSON(THREADS_FILE, local);
}

/** Push whatever changed since the last pass. */
async function sync(reason) {
  if (!pool || syncing) return;
  syncing = true;
  try {
    const cfg = settings();
    const users = readJSON(USERS_FILE);
    const threads = readJSON(THREADS_FILE);

    if (users && Object.keys(users).length) {
      const changed = [], seen = new Set();
      for (const [id, rec] of Object.entries(users)) {
        if (!rec || typeof rec !== "object") continue;
        seen.add(id);
        const h = JSON.stringify(rec);
        if (hashes.users.get(id) === h) continue;
        hashes.users.set(id, h);
        changed.push(userRow(id, rec));
      }
      const gone = [...hashes.users.keys()].filter((id) => !seen.has(id));
      gone.forEach((id) => hashes.users.delete(id));
      await upsert("bot_users", ["userID", "name", "money", "exp", "banned", "data", "updatedAt"], changed);
      await removeRows("bot_users", "userID", gone);
      if (changed.length || gone.length) {
        log(`users: ${changed.length} saved, ${gone.length} removed (${reason})`);
      }
    }

    if (threads && Object.keys(threads).length) {
      const changed = [], seen = new Set();
      for (const [id, rec] of Object.entries(threads)) {
        if (!rec || typeof rec !== "object") continue;
        seen.add(id);
        const h = JSON.stringify(rec);
        if (hashes.threads.get(id) === h) continue;
        hashes.threads.set(id, h);
        changed.push(threadRow(id, rec));
      }
      const gone = [...hashes.threads.keys()].filter((id) => !seen.has(id));
      gone.forEach((id) => hashes.threads.delete(id));
      await upsert("bot_threads", ["threadID", "threadName", "isGroup", "banned", "data", "updatedAt"], changed);
      await removeRows("bot_threads", "threadID", gone);
      if (changed.length || gone.length) {
        log(`threads: ${changed.length} saved, ${gone.length} removed (${reason})`);
      }
    }

    // small cache files (afk, autoreply, warns, ...) - backed up as plain text
    const fileRows = [];
    for (const rel of cfg.extraFiles) {
      const target = path.join(ROOT, rel);
      if (!target.startsWith(ROOT) || !fs.existsSync(target)) continue;
      let content;
      try { content = fs.readFileSync(target, "utf8"); } catch (e) { continue; }
      if (content.length > 4 * 1024 * 1024) continue;
      if (hashes.kv.get(rel) === content) continue;
      hashes.kv.set(rel, content);
      fileRows.push([rel, content, Date.now()]);
    }
    await upsert("bot_files", ["path", "content", "updatedAt"], fileRows);
    lastSync = Date.now();
    lastError = null;
  } catch (e) {
    lastError = e.message;
    log("sync failed: " + e.message, "error");
  } finally {
    syncing = false;
  }
}

/**
 * Status for the dashboard.
 */
async function status() {
  const cfg = settings();
  const out = {
    enabled: cfg.enabled,
    connected: !!pool,
    host: cfg.host ? `${cfg.host}:${cfg.port}` : null,
    database: cfg.name || null,
    lastSync: lastSync || null,
    lastError,
    users: null,
    threads: null,
    files: null,
  };
  if (!pool) return out;
  try {
    const [[u]] = await pool.query("SELECT COUNT(*) AS n FROM bot_users");
    const [[t]] = await pool.query("SELECT COUNT(*) AS n FROM bot_threads");
    const [[f]] = await pool.query("SELECT COUNT(*) AS n FROM bot_files");
    out.users = u.n; out.threads = t.n; out.files = f.n;
  } catch (e) {
    out.connected = false;
    out.lastError = e.message;
  }
  return out;
}

/**
 * Wipe data. Clears the JSON file(s) AND the matching database rows, so a
 * wipe can't be undone by the next sync or restore.
 *   target: "users" | "threads" | "money" | "bans" | "everything"
 */
async function wipe(target) {
  const result = { target, users: 0, threads: 0 };

  const users = readJSON(USERS_FILE) || {};
  const threads = readJSON(THREADS_FILE) || {};

  if (target === "users" || target === "everything") {
    result.users = Object.keys(users).length;
    writeJSON(USERS_FILE, {});
    hashes.users.clear();
    if (pool) await pool.query("DELETE FROM bot_users");
    if (global.data) {
      global.data.allUserID = [];
      global.data.userBanned = new Map();
    }
  } else if (target === "money") {
    for (const rec of Object.values(users)) {
      if (rec && typeof rec === "object") { rec.money = 0; rec.exp = 0; }
    }
    result.users = Object.keys(users).length;
    writeJSON(USERS_FILE, users);
    hashes.users.clear();
  } else if (target === "bans") {
    for (const rec of Object.values(users)) {
      if (!rec || typeof rec !== "object") continue;
      delete rec.banned; delete rec.banReason; delete rec.bannedAt;
      if (rec.data) { delete rec.data.banned; delete rec.data.reason; }
    }
    for (const rec of Object.values(threads)) {
      if (rec && rec.data) { delete rec.data.banned; delete rec.data.reason; }
    }
    writeJSON(USERS_FILE, users);
    writeJSON(THREADS_FILE, threads);
    hashes.users.clear();
    hashes.threads.clear();
    if (global.data) {
      global.data.userBanned = new Map();
      global.data.threadBanned = new Map();
    }
    result.users = Object.keys(users).length;
    result.threads = Object.keys(threads).length;
  }

  if (target === "threads" || target === "everything") {
    result.threads = Object.keys(threads).length;
    writeJSON(THREADS_FILE, {});
    hashes.threads.clear();
    if (pool) await pool.query("DELETE FROM bot_threads");
    if (global.data) {
      global.data.allThreadID = [];
      global.data.threadData = new Map();
      global.data.threadInfo = new Map();
      global.data.threadBanned = new Map();
    }
  }

  await sync("after wipe");
  log(`Wipe (${target}) done.`);
  return result;
}

async function init() {
  const cfg = settings();
  if (!cfg.enabled) {
    log("Not enabled - running on JSON files only. Fill in config.json -> database to use your panel's MySQL.");
    return false;
  }
  if (!cfg.host || !cfg.user || !cfg.name) {
    log("Enabled but host/user/name are missing - staying on JSON files.", "error");
    return false;
  }

  let mysql;
  try {
    mysql = require("mysql2/promise");
  } catch (e) {
    log("mysql2 is not installed. Run:  npm install mysql2   (staying on JSON files for now)", "error");
    return false;
  }

  try {
    pool = mysql.createPool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.name,
      waitForConnections: true,
      connectionLimit: 4,
      charset: "utf8mb4",
      connectTimeout: 15000,
    });
    await pool.query("SELECT 1");
    await ensureTables();
    log(`Connected to ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.name}`);
  } catch (e) {
    log("Could not connect (" + e.message + ") - staying on JSON files.", "error");
    pool = null;
    return false;
  }

  try {
    const localUsers = readJSON(USERS_FILE);
    const localThreads = readJSON(THREADS_FILE);
    const localEmpty =
      (!localUsers || Object.keys(localUsers).length === 0) &&
      (!localThreads || Object.keys(localThreads).length === 0);

    const [[{ n: dbUsers }]] = await pool.query("SELECT COUNT(*) AS n FROM bot_users");
    const [[{ n: dbThreads }]] = await pool.query("SELECT COUNT(*) AS n FROM bot_threads");

    if ((localEmpty || cfg.forceRestore) && (dbUsers > 0 || dbThreads > 0)) {
      await restoreFromDatabase();
    } else if (dbUsers === 0 && dbThreads === 0) {
      log("Database is empty - importing your current JSON data.");
    }
    await restoreMissingExtraFiles();
    await restoreNewerGroupSettings();
  } catch (e) {
    log("Restore check failed: " + e.message, "error");
  }

  await sync("startup");

  timer = setInterval(() => sync("periodic"), Math.max(5, settings().syncSeconds) * 1000);
  if (timer.unref) timer.unref();

  global.db = {
    pool,
    sync: () => sync("manual"),
    restore: restoreFromDatabase,
    status,
    wipe,
    query: (...a) => pool.query(...a),
  };
  global.dbFlush = () => sync("shutdown");
  return true;
}

module.exports = { init, sync, settings, status, wipe };

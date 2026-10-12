const path = require('path');
const fs = require('fs-extra');
const cron = require("node-cron");


function setupAPIRoutes(realApp, { global, fs, path, os, diskusage, startTime, restartBot }) {

// ===========================================================================
// CRASH GUARD
//
// An async route that threw - a Facebook call refusing, a data file half
// written, an undefined field - produced an unhandled rejection, and with a
// process-level handler that exits, one dashboard click could take the whole
// bot down. Every handler registered below is wrapped: errors become a 500
// JSON reply and a console line, and the bot keeps running.
// ===========================================================================
const app = (() => {
  const wrap = (handler) => async function (req, res, next) {
    try {
      await handler(req, res, next);
    } catch (error) {
      console.log(`[panel] ${req.method} ${req.originalUrl || req.url} failed: ${(error && error.message) || error}`);
      if (!res.headersSent) {
        try { res.status(500).json({ success: false, error: String((error && error.message) || error) }); } catch (e) {}
      }
    }
  };
  const proxy = Object.create(realApp);
  for (const method of ["get", "post", "put", "patch", "delete", "use"]) {
    if (typeof realApp[method] !== "function") continue;
    proxy[method] = (routePath, ...handlers) =>
      realApp[method](routePath, ...handlers.map(h => (typeof h === "function" ? wrap(h) : h)));
  }
  return proxy;
})();

// ===========================================================================
// CACHE LAYER
// The dashboard polls every 4s. Without this, each poll hit Facebook's API
// directly (getThreadList / getUserInfo), which was ~30 calls a minute — the
// cause of both the slow responses and the account restrictions.
// ===========================================================================
const _cache = new Map();

async function cached(key, ttlMs, producer) {
  const hit = _cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.val;
  if (hit && hit.pending) return hit.pending;          // collapse concurrent calls

  const pending = (async () => {
    try {
      const val = await producer();
      _cache.set(key, { val, at: Date.now() });
      return val;
    } catch (e) {
      if (hit) { _cache.set(key, { val: hit.val, at: now }); return hit.val; }  // serve stale
      _cache.delete(key);
      throw e;
    }
  })();

  _cache.set(key, { ...(hit || {}), pending });
  return pending;
}

function invalidate(prefix) {
  for (const k of _cache.keys()) if (k.startsWith(prefix)) _cache.delete(k);
}

// expose so other endpoints can clear after a mutation
global._apiCache = { cached, invalidate, map: _cache };

// ===========================================================================
// SAFE WRITES + DATABASE PUSH
//
// Dashboard edits used to be a plain writeFileSync: if the process died
// mid-write the whole users database became a truncated, unreadable file.
// These write to a temp file and rename (all-or-nothing), and then ask the
// MySQL mirror to push the change straight away instead of waiting for the
// next 20s sync - so money added on the website is in the database seconds
// later, not eventually.
// ===========================================================================
const DB_DIR       = path.join(__dirname, '..', 'includes', 'database', 'data');
const USERS_PATH   = path.join(DB_DIR, 'usersData.json');
const THREADS_PATH = path.join(DB_DIR, 'threadsData.json');

let _flushTimer = null;
function pushToDatabase() {
  if (_flushTimer) return;                 // a burst of edits = one push
  _flushTimer = setTimeout(async () => {
    _flushTimer = null;
    try { if (global.dbFlush) await global.dbFlush(); } catch (e) {}
  }, 1500);
  if (_flushTimer.unref) _flushTimer.unref();
}

function readDB(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return null;
  }
}

// One place that decides what counts as a stored record, so the dashboard and
// the database page can never disagree again.
function countStored() {
  const users = readDB(USERS_PATH) || {};
  const threads = readDB(THREADS_PATH) || {};
  let deleted = {};
  try {
    const raw = fs.readFileSync(path.join(DB_DIR, 'deletedThreads.json'), 'utf8').trim();
    deleted = raw ? JSON.parse(raw) : {};
  } catch (e) {}

  const threadIDs = Object.entries(threads).filter(([id, d]) =>
    !deleted[id] && d && typeof d === 'object' && d.threadInfo);

  return {
    users: Object.keys(users).length,
    threads: threadIDs.length,
    totalMoney: Object.values(users).reduce((n, u) => n + (Number(u && u.money) || 0), 0),
    banned: Object.values(users).filter(u => u && u.banned === true).length,
    usersObj: users
  };
}

function writeDB(file, obj) {
  const tmp = file + '.tmp';
  const out = JSON.stringify(obj, null, 4);
  if (!out || out.length < 2) throw new Error('refusing to write empty database');
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, file);
  pushToDatabase();
  return true;
}



app.get("/api/system/stats", async (req, res) => {
  try {
    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const freeMem = Math.round(os.freemem() / 1024 / 1024);
    const usedMem = totalMem - freeMem;
    const usagePercent = Math.round((usedMem / totalMem) * 100);

    let totalDisk = 0;
    let freeDisk = 0;
    let usedDisk = 0;

    try {
      // disk size barely changes; 60s cache instead of a stat call every poll
      const disk = await cached('disk', 60000, () => diskusage.check("/"));
      totalDisk = Math.round(disk.total / 1024 / 1024 / 1024);
      freeDisk = Math.round(disk.free / 1024 / 1024 / 1024);
      usedDisk = totalDisk - freeDisk;
    } catch (err) {
      // stay quiet — this fires every poll otherwise
    }

    let status = "good";
    if (usagePercent > 85) status = "critical";
    else if (usagePercent > 60) status = "average";

    res.json({
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usagePercent
      },
      storage: `${usedDisk} GB / ${totalDisk} GB`,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      os: `${os.type()} ${os.release()} (${os.arch()})`,
      botActive: !!(global.client && global.client.api),
      status
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get("/api/db/status", async (req, res) => {
  try {
    // Counts come from countStored() - the same function the Database page
    // uses - so the two screens always show the same numbers. "DBConnected"
    // used to mean only "the JSON files exist", which said Connected even
    // when MySQL was off; now it reflects MySQL when MySQL is switched on.
    const stored = countStored();

    let mysql = { enabled: false, connected: false };
    try {
      const sql = require("../includes/database/sql");
      mysql = await sql.status();
    } catch (e) {}

    res.json({
      totalThreads: stored.threads,
      totalUsers: stored.users,
      totalMoney: stored.totalMoney,
      banned: stored.banned,
      mysql,
      // true = data is readable; when MySQL is enabled it must also be up
      DBConnected: mysql.enabled ? !!mysql.connected : true,
      storage: mysql.enabled ? (mysql.connected ? "mysql" : "json (mysql down)") : "json",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      totalThreads: 0,
      totalUsers: 0,
      DBConnected: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

   app.get('/api/thread/list', async (req, res) => {
  try {
    const threadsDataPath = path.join(__dirname, '..', 'includes', 'database', 'data', 'threadsData.json');
    const deletedPath = path.join(__dirname, '..', 'includes', 'database', 'data', 'deletedThreads.json');

    let deletedThreads = {};

    if (fs.existsSync(deletedPath)) {
      try {
        const raw = fs.readFileSync(deletedPath, 'utf8').trim();
        deletedThreads = raw ? JSON.parse(raw) : {};
      } catch {
        deletedThreads = {};
      }
    }

    let threadsMap = new Map();
    let source = "database";

    // =========================
    // ✅ LOAD DATABASE FIRST
    // =========================
    if (fs.existsSync(threadsDataPath)) {
      try {
        const raw = fs.readFileSync(threadsDataPath, 'utf8').trim();

        if (raw) {
          const threadsData = JSON.parse(raw);

          for (const [threadID, data] of Object.entries(threadsData)) {

            if (deletedThreads[threadID]) continue;
            if (!data?.threadInfo) continue;

            threadsMap.set(threadID, {
              threadID,
              name: data.threadInfo.threadName || "Unknown",
              participants: data.threadInfo.participantIDs?.length || 0,
              isGroup: data.threadInfo.isGroup || false,
              emoji: data.threadInfo.emoji || null,
              adminCount: data.threadInfo.adminIDs?.length || 0,
              createdAt: data.createTime?.timestamp || null,
              source: "database"
            });
          }
        }
      } catch (err) {
        console.log("⚠️ JSON corrupted, skipping database");
      }
    }

    // =========================
    // ✅ FETCH LIVE (OVERRIDE DB)
    // =========================
    if (global.client?.api) {
      try {
        const api = global.client.api;
        // 90s cache: this is the single heaviest Facebook call in the panel
        const threadList = await cached('threadList', 90000,
          () => api.getThreadList(100, null, ["INBOX"]));

        for (const t of threadList) {

          if (deletedThreads[t.threadID]) continue;

          // 🔥 ALWAYS OVERRIDE (live = more accurate)
          threadsMap.set(t.threadID, {
            threadID: t.threadID,
            name: t.name || "Unknown",
            participants: t.participantIDs?.length || 0,
            isGroup: t.isGroup || false,
            emoji: t.emoji || null,
            adminCount: t.adminIDs?.length || 0,
            createdAt: t.timestamp || null,
            source: "live"
          });
        }

        source = "live+database";

      } catch (err) {
        console.log("⚠️ Live fetch failed:", err.message);
      }
    }

    const threads = Array.from(threadsMap.values());

    res.json({
      success: true,
      totalThreads: threads.length,
      threads,
      source,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("THREAD LIST ERROR:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
  app.get('/api/thread/send', async (req, res) => {
  try {
    const threadID = req.query.id;
    const message = req.query.message;

    if (!threadID) {
      return res.status(400).json({ success: false, error: "Thread ID is required" });
    }

    if (!message) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    if (!global.client?.api) {
      return res.status(503).json({ success: false, error: "Bot API not ready" });
    }

    // =========================
    // 🔥 LOAD DELETED THREADS
    // =========================
    const deletedPath = path.join(__dirname, '..', 'includes', 'database', 'data', 'deletedThreads.json');

    let deletedThreads = {};

    if (fs.existsSync(deletedPath)) {
      try {
        const raw = fs.readFileSync(deletedPath, 'utf8').trim();
        deletedThreads = raw ? JSON.parse(raw) : {};
      } catch {
        deletedThreads = {};
      }
    }

    // ❌ BLOCK deleted
    if (deletedThreads[threadID]) {
      return res.status(403).json({
        success: false,
        error: "Thread is marked as deleted"
      });
    }

    // =========================
    // 🔥 OPTIONAL LIVE CHECK (SAFE)
    // =========================
    try {
      await new Promise((resolve, reject) => {
        global.client.api.getThreadInfo(threadID, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    } catch {
      return res.status(404).json({
        success: false,
        error: "Thread not accessible / invalid"
      });
    }

    // =========================
    // 🔥 SEND MESSAGE
    // =========================
    global.client.api.sendMessage(message, threadID, (err, info) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: err.message
        });
      }

      res.json({
        success: true,
        message: "Message sent",
        threadID,
        messageID: info?.messageID || null
      });
    });

  } catch (error) {
    console.error("SEND ERROR:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
  // POST carries photos; the old GET (text only) still works
  app.post("/api/threads/announcement", (req, res) => announce(req, res));
  app.get("/api/threads/announcement", (req, res) => announce(req, res));

  async function announce(req, res) {
  try {
    const message = req.query.message || (req.body && req.body.message) || "";

    // photos arrive as [{ name, data: "<base64>" }] and get written to temp
    // files, because sendMessage attaches read streams, not buffers
    const attachmentFiles = [];
    const images = (req.body && Array.isArray(req.body.images)) ? req.body.images.slice(0, 10) : [];
    if (images.length) {
      const tmpDir = path.join(__dirname, '..', 'modules', 'commands', 'cache');
      fs.ensureDirSync(tmpDir);
      images.forEach((img, i) => {
        try {
          const raw = String(img.data || "").replace(/^data:[^,]+,/, "");
          const buf = Buffer.from(raw, "base64");
          if (buf.length < 100 || buf.length > 25 * 1024 * 1024) return;
          const ext = (String(img.name || "").match(/\.(png|jpe?g|gif|webp)$/i) || [null, "jpg"])[1];
          const file = path.join(tmpDir, `announce-${Date.now()}-${i}.${ext}`);
          fs.writeFileSync(file, buf);
          attachmentFiles.push(file);
        } catch (e) { /* skip one bad image, keep the rest */ }
      });
    }

    if (!message && !attachmentFiles.length) {
      return res.status(400).json({
        success: false,
        error: "A message or at least one photo is required"
      });
    }

    if (!global.client?.api) {
      return res.status(503).json({
        success: false,
        error: "Bot API not ready"
      });
    }

    const threadsDataPath = path.join(__dirname, '..', 'includes', 'database', 'data', 'threadsData.json');
    const deletedPath = path.join(__dirname, '..', 'includes', 'database', 'data', 'deletedThreads.json');

    let deletedThreads = {};
    let threadsSet = new Set();

    // =========================
    // 🔥 LOAD DELETED
    // =========================
    if (fs.existsSync(deletedPath)) {
      try {
        const raw = fs.readFileSync(deletedPath, 'utf8').trim();
        deletedThreads = raw ? JSON.parse(raw) : {};
      } catch {
        deletedThreads = {};
      }
    }

    // =========================
    // 🔥 LOAD JSON THREADS
    // =========================
    if (fs.existsSync(threadsDataPath)) {
      try {
        const raw = fs.readFileSync(threadsDataPath, 'utf8').trim();

        if (raw) {
          const data = JSON.parse(raw);

          for (const [id, t] of Object.entries(data)) {
            if (deletedThreads[id]) continue;
            if (!t?.threadInfo?.isGroup) continue;

            threadsSet.add(id);
          }
        }
      } catch {
        console.log("⚠️ JSON corrupted");
      }
    }

    // =========================
    // 🔥 FETCH LIVE THREADS (IMPORTANT)
    // =========================
    try {
      const threadList = await cached('threadList', 90000,
        () => global.client.api.getThreadList(100, null, ["INBOX"]));

      for (const t of threadList) {
        if (deletedThreads[t.threadID]) continue;
        if (!t.isGroup) continue;

        threadsSet.add(t.threadID);
      }

    } catch (err) {
      console.log("⚠️ Live fetch failed:", err.message);
    }

    const threadIDs = Array.from(threadsSet);

    if (!threadIDs.length) {
      return res.json({
        success: true,
        message: "No valid threads",
        totalThreads: 0
      });
    }

    // Sending is spaced out (see below), so a big list takes minutes.
    // Reply to the dashboard now and keep sending in the background.
    res.json({
      success: true,
      queued: true,
      message: "Announcement queued",
      totalThreads: threadIDs.length,
      successCount: threadIDs.length
    });

    let successCount = 0;
    let failCount = 0;
    const failedThreads = [];

    // =========================
    // 🔥 CONTROLLED SENDING
    // =========================
    for (const threadID of threadIDs) {
      try {
        // fresh streams per thread: a stream can only be read once
        const payload = attachmentFiles.length
          ? { body: message, attachment: attachmentFiles.map(f => fs.createReadStream(f)) }
          : message;

        await new Promise(resolve => {
          global.client.api.sendMessage(payload, threadID, (err) => {
            if (err) {
              failCount++;
              failedThreads.push(threadID);
            } else {
              successCount++;
            }
            resolve();
          });
        });

        // 400ms between groups looked like a spam blast. Space them out.
        const gap = ((global.config.safety || {}).announceGapMs) || 8000;
        await new Promise(r => setTimeout(r, gap + Math.floor(Math.random() * gap)));

      } catch {
        failCount++;
        failedThreads.push(threadID);
      }
    }

    attachmentFiles.forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });

    console.log(`[announce] done: ${successCount}/${threadIDs.length} sent, ${failCount} failed` +
      (failedThreads.length ? ` (${failedThreads.join(", ")})` : ""));

  } catch (error) {
    console.error("ANNOUNCE ERROR:", error);
    if (res.headersSent) return;
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
  }

   app.post('/api/thread/send', async (req, res) => {
  try {
    const { id, message } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Thread ID is required"
      });
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Message is required"
      });
    }

    if (!global.client || !global.client.api) {
      return res.status(503).json({
        success: false,
        error: "Bot API not ready"
      });
    }

    // =========================
    // 🔥 VALIDATE THREAD FROM JSON
    // =========================
    const threadsDataPath = path.join(
      __dirname,
      '..',
      'includes',
      'database',
      'data',
      'threadsData.json'
    );

    let existsInDB = false;

    if (fs.existsSync(threadsDataPath)) {
      try {
        const raw = fs.readFileSync(threadsDataPath, 'utf8').trim();

        if (raw) {
          const data = JSON.parse(raw);
          existsInDB = !!data[id];
        }
      } catch (err) {
        console.log("⚠️ JSON corrupted, skipping validation");
      }
    }

    // optional strict mode
    if (!existsInDB) {
      return res.status(404).json({
        success: false,
        error: "Thread not found in database"
      });
    }

    // =========================
    // 🔥 SEND MESSAGE
    // =========================
    global.client.api.sendMessage(message, id, (err, info) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: err.message
        });
      }

      res.json({
        success: true,
        message: "Message sent successfully",
        threadID: id,
        messageID: info?.messageID || null
      });
    });

  } catch (error) {
    console.error("POST SEND ERROR:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

    app.get("/api/system/restart", async (req, res) => {
        try {
            const action = req.query.action;
            
            if (!action) {
                return res.status(400).json({
                    success: false,
                    error: "Action is required. Use action=1 for restart or action=2 for shutdown",
                    timestamp: new Date().toISOString()
                });
            }
            
            if (action === "1") {
                global.restart = 1;
                res.json({
                    success: true,
                    message: "Bot is restarting...",
                    action: "restart",
                    timestamp: new Date().toISOString()
                });
                setTimeout(() => {
                    process.exit(1);
                }, 2000);
            } else if (action === "2") {
                global.restart = 2;
                res.json({
                    success: true,
                    message: "Bot is shutting down...",
                    action: "shutdown",
                    timestamp: new Date().toISOString()
                });
                setTimeout(() => {
                    process.exit(0);
                }, 2000);
            } else {
                res.status(400).json({
                    success: false,
                    error: "Invalid action. Use action=1 for restart or action=2 for shutdown",
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    app.delete("/api/db/user/delete", (req, res) => {
        try {
            const userID = req.query.id;
            
            if (!userID) {
                return res.status(400).json({
                    success: false,
                    error: "User ID is required",
                    timestamp: new Date().toISOString()
                });
            }
            
            const usersDataPath = path.join(__dirname, '..', 'includes/database/data/usersData.json');
            
            if (!fs.existsSync(usersDataPath)) {
                return res.status(404).json({
                    success: false,
                    error: "Users database not found",
                    timestamp: new Date().toISOString()
                });
            }
            
            const usersData = JSON.parse(fs.readFileSync(usersDataPath, 'utf8'));
            
            if (!usersData[userID]) {
                return res.status(404).json({
                    success: false,
                    error: "User not found in database",
                    timestamp: new Date().toISOString()
                });
            }
            
            delete usersData[userID];
            
            writeDB(usersDataPath, usersData);
            
            if (global.data.userBanned && global.data.userBanned.has(userID)) {
                global.data.userBanned.delete(userID);
            }
            
            res.json({
                success: true,
                message: "User deleted successfully from database",
                userID: userID,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    app.delete("/api/db/thread/delete", (req, res) => {
  try {
    const threadID = req.query.id;

    if (!threadID) {
      return res.status(400).json({
        success: false,
        error: "Thread ID is required"
      });
    }

    const basePath = path.join(__dirname, '..', 'includes', 'database', 'data');
    const threadsDataPath = path.join(basePath, 'threadsData.json');
    const deletedPath = path.join(basePath, 'deletedThreads.json');

    // =========================
    // 🔥 SAFE LOAD THREAD DATA
    // =========================
    let threadsData = {};

    if (fs.existsSync(threadsDataPath)) {
      try {
        const raw = fs.readFileSync(threadsDataPath, 'utf8').trim();
        threadsData = raw ? JSON.parse(raw) : {};
      } catch {
        threadsData = {};
      }
    }

    if (!threadsData[threadID]) {
      return res.status(404).json({
        success: false,
        error: "Thread not found in database"
      });
    }

    // =========================
    // 🔥 DELETE FROM MAIN DB
    // =========================
    delete threadsData[threadID];

    writeDB(threadsDataPath, threadsData);

    // =========================
    // 🔥 ADD TO BLOCK LIST
    // =========================
    let deletedThreads = {};

    if (fs.existsSync(deletedPath)) {
      try {
        const raw = fs.readFileSync(deletedPath, 'utf8').trim();
        deletedThreads = raw ? JSON.parse(raw) : {};
      } catch {
        deletedThreads = {};
      }
    }

    deletedThreads[threadID] = {
      deletedAt: Date.now()
    };

    fs.writeFileSync(deletedPath, JSON.stringify(deletedThreads, null, 2));

    // =========================
    // 🔥 CLEAR MEMORY
    // =========================
    global.data?.threadBanned?.delete(threadID);
    global.data?.threadInfo?.delete(threadID);
    global.data?.threadData?.delete(threadID);

    res.json({
      success: true,
      message: "Thread permanently deleted",
      threadID
    });

  } catch (error) {
    console.error("DELETE ERROR:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

   // ===========================================================================
   // USERS LIST
   // Rewritten for three reasons:
   //  1. names were never stored, so every page waited on Facebook getUserInfo
   //  2. search only ever filtered the 10 users already on screen, so anyone on
   //     another page was unfindable
   //  3. 10 per page meant 71 pages for 701 users
   // Names are now cached to disk as they are discovered, search runs across the
   // whole database server-side, and the page size is larger and configurable.
   // ===========================================================================
   const NAMES_PATH = path.join(__dirname, '..', 'includes', 'database', 'data', 'userNames.json');
   let _names = null;

   function loadNames() {
     if (_names) return _names;
     try {
       const raw = fs.readFileSync(NAMES_PATH, 'utf8').trim();
       _names = raw ? JSON.parse(raw) : {};
     } catch { _names = {}; }
     return _names;
   }

   let _namesDirty = false;
   function rememberName(id, name) {
     if (!name || name === id) return;
     const n = loadNames();
     if (n[id] === name) return;
     n[id] = name;
     _namesDirty = true;
   }
   // flush at most every 10s so a burst of lookups is one write
   setInterval(() => {
     if (!_namesDirty) return;
     _namesDirty = false;
     try {
       const tmp = NAMES_PATH + '.tmp';
       fs.writeFileSync(tmp, JSON.stringify(loadNames(), null, 2));
       fs.renameSync(tmp, NAMES_PATH);
     } catch {}
   }, 10000).unref?.();

   app.get("/api/users/list", async (req, res) => {
  try {
    const usersDataPath = path.join(__dirname, '..', 'includes', 'database', 'data', 'usersData.json');

    if (!fs.existsSync(usersDataPath)) {
      return res.status(404).json({ success: false, error: "Users database not found" });
    }

    const page   = Math.max(parseInt(req.query.page) || 1, 1);
    const limit  = Math.min(Math.max(parseInt(req.query.limit) || 24, 1), 100);
    const search = String(req.query.search || '').trim().toLowerCase();

    let usersData = {};
    try {
      const raw = fs.readFileSync(usersDataPath, 'utf8').trim();
      usersData = raw ? JSON.parse(raw) : {};
    } catch {
      return res.status(500).json({ success: false, error: "Invalid usersData.json" });
    }

    const names = loadNames();
    let usersArray = Object.entries(usersData);

    // ---- search the WHOLE database, not just the current page ----
    if (search) {
      // "null" / "unknown" / "no name" lists the users whose name we never
      // managed to resolve - they were the ones impossible to find before
      const wantsUnnamed = ['null', 'unknown', 'no name', 'noname'].includes(search);

      usersArray = usersArray.filter(([userID, data]) => {
        const known = names[userID] || data.name ||
                      (global.data && global.data.userName && global.data.userName.get(String(userID))) || '';
        if (wantsUnnamed) return !known;
        return String(userID).toLowerCase().includes(search) || known.toLowerCase().includes(search);
      });
    }

    const totalUsers = usersArray.length;
    const totalPages = Math.max(Math.ceil(totalUsers / limit), 1);
    const startIndex = (Math.min(page, totalPages) - 1) * limit;
    const paginatedUsers = usersArray.slice(startIndex, startIndex + limit);

    // ---- resolve names ----
    // This used to fire one getUserInfo per unknown user - up to 100 separate
    // Facebook calls for a single page load, which is slow, looks like
    // scraping, and fell over (leaving those rows showing a raw ID) as soon as
    // one of them failed. Now every unknown id on the page goes out in ONE
    // call, with the bot's own name cache checked first.
    const unknown = paginatedUsers
      .map(([userID, data]) => (names[userID] || data.name || global.data?.userName?.get(String(userID)) ? null : userID))
      .filter(Boolean);

    let fetched = {};
    if (unknown.length && global.client && global.client.api) {
      try {
        fetched = await cached('userbatch:' + unknown.join(','), 600000,
          () => global.client.api.getUserInfo(unknown)) || {};
      } catch (e) {
        console.log('[panel] name lookup failed: ' + (e && (e.error || e.message) || e));
      }
    }

    const users = await Promise.all(
      paginatedUsers.map(async ([userID, data]) => {
        let name = names[userID] || data.name || global.data?.userName?.get(String(userID)) || null;
        let profilePicture = null;

        const info = fetched[userID];
        if (!name && info && info.name) {
          name = info.name;
          profilePicture = info.profileUrl || null;
        }
        if (name) {
          // names live in userNames.json and in memory ONLY. Writing them into
          // usersData.json changed that file's timestamp, the live-refresh
          // probe saw a change, reloaded the list, which learned more names
          // and wrote again - the Users tab refreshing over and over.
          rememberName(userID, name);
          try { global.data?.userName?.set(String(userID), name); } catch (e) {}
        }

        return {
          userID,
          // null when we genuinely don't know it - the dashboard then shows
          // the UID with a NULL tag instead of inventing a label
          name: name || null,
          displayName: name || userID,
          nameResolved: !!name,
          profilePicture,
          money: data.money || 0,
          exp: data.exp || 0,
          level: data.level || 0,
          createTime: data.createTime?.timestamp || null,
          lastUpdate: data.lastUpdate || null,
          isBanned: global.data?.userBanned?.has(userID) || false
        };
      })
    );

    res.json({
      success: true,
      totalUsers,
      currentPage: Math.min(page, totalPages),
      totalPages,
      limit,
      search: search || null,
      cachedNames: Object.keys(names).length,
      users,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("USER LIST ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
    app.get("/api/users/ban", (req, res) => {
        try {
            const userID = req.query.id;
            const reason = req.query.reason || "No reason provided";

            if (!userID) {
                return res.status(400).json({
                    success: false,
                    error: "User ID is required",
                    timestamp: new Date().toISOString()
                });
            }

            const usersDataPath = path.join(__dirname, '..', 'includes/database/data/usersData.json');

            if (!fs.existsSync(usersDataPath)) {
                return res.status(404).json({
                    success: false,
                    error: "Users database not found"
                });
            }

            const usersData = JSON.parse(fs.readFileSync(usersDataPath, 'utf8'));

            if (!usersData[userID]) {
                return res.status(404).json({
                    success: false,
                    error: "User not found"
                });
            }

            usersData[userID].banned = true;
            usersData[userID].banReason = reason;
            usersData[userID].bannedAt = Date.now();

            writeDB(usersDataPath, usersData);

            if (!global.data.userBanned) global.data.userBanned = new Map();

            global.data.userBanned.set(userID, {
                bannedAt: usersData[userID].bannedAt,
                reason
            });

            res.json({
                success: true,
                message: "User banned permanently",
                userID,
                reason
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    app.get("/api/users/unban", (req, res) => {
        try {
            const userID = req.query.id;

            if (!userID) {
                return res.status(400).json({
                    success: false,
                    error: "User ID is required"
                });
            }

            const usersDataPath = path.join(__dirname, '..', 'includes/database/data/usersData.json');

            if (!fs.existsSync(usersDataPath)) {
                return res.status(404).json({
                    success: false,
                    error: "Users database not found"
                });
            }

            let usersData = JSON.parse(fs.readFileSync(usersDataPath, 'utf8'));

            if (!usersData[userID]) {
                return res.status(404).json({
                    success: false,
                    error: "User not found"
                });
            }

            delete usersData[userID].banned;
            delete usersData[userID].banReason;
            delete usersData[userID].bannedAt;

            writeDB(usersDataPath, usersData);

            if (global.data.userBanned) {
                global.data.userBanned.delete(userID);
            }

            res.json({
                success: true,
                message: "User fully unbanned",
                userID
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    app.post("/api/users/moneyset", (req, res) => {
        try {
            const { id, amount } = req.body;
            
            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: "User ID is required",
                    timestamp: new Date().toISOString()
                });
            }
            
            if (amount === undefined || amount === null) {
                return res.status(400).json({
                    success: false,
                    error: "Amount is required",
                    timestamp: new Date().toISOString()
                });
            }
            
            const usersDataPath = path.join(__dirname, '..', 'includes/database/data/usersData.json');
            
            if (!fs.existsSync(usersDataPath)) {
                return res.status(404).json({
                    success: false,
                    error: "Users database not found",
                    timestamp: new Date().toISOString()
                });
            }
            
            const usersData = JSON.parse(fs.readFileSync(usersDataPath, 'utf8'));
            
            if (!usersData[id]) {
                return res.status(404).json({
                    success: false,
                    error: "User not found",
                    timestamp: new Date().toISOString()
                });
            }
            
            usersData[id].money = parseInt(amount);
            usersData[id].lastUpdate = Date.now();
            
            writeDB(usersDataPath, usersData);
            
            res.json({
                success: true,
                message: "Money updated successfully",
                userID: id,
                newMoney: usersData[id].money,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    app.post("/api/users/exp-set", (req, res) => {
        try {
            const { id, amount } = req.body;
            
            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: "User ID is required",
                    timestamp: new Date().toISOString()
                });
            }
            
            if (amount === undefined || amount === null) {
                return res.status(400).json({
                    success: false,
                    error: "Amount is required",
                    timestamp: new Date().toISOString()
                });
            }
            
            const usersDataPath = path.join(__dirname, '..', 'includes/database/data/usersData.json');
            
            if (!fs.existsSync(usersDataPath)) {
                return res.status(404).json({
                    success: false,
                    error: "Users database not found",
                    timestamp: new Date().toISOString()
                });
            }
            
            const usersData = JSON.parse(fs.readFileSync(usersDataPath, 'utf8'));
            
            if (!usersData[id]) {
                return res.status(404).json({
                    success: false,
                    error: "User not found",
                    timestamp: new Date().toISOString()
                });
            }
            
            usersData[id].exp = parseInt(amount);
            usersData[id].lastUpdate = Date.now();
            
            writeDB(usersDataPath, usersData);
            
            res.json({
                success: true,
                message: "Experience updated successfully",
                userID: id,
                newExp: usersData[id].exp,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    app.post("/api/users/add-money", (req, res) => {
        try {
            const { id, amount } = req.body;
            
            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: "User ID is required",
                    timestamp: new Date().toISOString()
                });
            }
            
            if (!amount || isNaN(parseInt(amount))) {
                return res.status(400).json({
                    success: false,
                    error: "Valid amount is required",
                    timestamp: new Date().toISOString()
                });
            }
            
            const usersDataPath = path.join(__dirname, '..', 'includes/database/data/usersData.json');
            
            if (!fs.existsSync(usersDataPath)) {
                return res.status(404).json({
                    success: false,
                    error: "Users database not found",
                    timestamp: new Date().toISOString()
                });
            }
            
            const usersData = JSON.parse(fs.readFileSync(usersDataPath, 'utf8'));
            
            if (!usersData[id]) {
                return res.status(404).json({
                    success: false,
                    error: "User not found",
                    timestamp: new Date().toISOString()
                });
            }
            
            usersData[id].money = (usersData[id].money || 0) + parseInt(amount);
            usersData[id].lastUpdate = Date.now();
            
            writeDB(usersDataPath, usersData);
            
            res.json({
                success: true,
                message: `Added ${amount} money to user`,
                userID: id,
                newMoney: usersData[id].money,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    app.post("/api/users/add-exp", (req, res) => {
        try {
            const { id, amount } = req.body;
            
            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: "User ID is required",
                    timestamp: new Date().toISOString()
                });
            }
            
            if (!amount || isNaN(parseInt(amount))) {
                return res.status(400).json({
                    success: false,
                    error: "Valid amount is required",
                    timestamp: new Date().toISOString()
                });
            }
            
            const usersDataPath = path.join(__dirname, '..', 'includes/database/data/usersData.json');
            
            if (!fs.existsSync(usersDataPath)) {
                return res.status(404).json({
                    success: false,
                    error: "Users database not found",
                    timestamp: new Date().toISOString()
                });
            }
            
            const usersData = JSON.parse(fs.readFileSync(usersDataPath, 'utf8'));
            
            if (!usersData[id]) {
                return res.status(404).json({
                    success: false,
                    error: "User not found",
                    timestamp: new Date().toISOString()
                });
            }
            
            usersData[id].exp = (usersData[id].exp || 0) + parseInt(amount);
            usersData[id].lastUpdate = Date.now();
            
            writeDB(usersDataPath, usersData);
            
            res.json({
                success: true,
                message: `Added ${amount} experience to user`,
                userID: id,
                newExp: usersData[id].exp,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    app.get("/api/users/currencies", (req, res) => {
        try {
            const userID = req.query.id;
            const usersDataPath = path.join(__dirname, '..', 'includes/database/data/usersData.json');
            
            if (!fs.existsSync(usersDataPath)) {
                return res.status(404).json({
                    success: false,
                    error: "Users database not found",
                    timestamp: new Date().toISOString()
                });
            }
            
            const usersData = JSON.parse(fs.readFileSync(usersDataPath, 'utf8'));
            
            if (userID) {
                const user = usersData[userID];
                if (!user) {
                    return res.status(404).json({
                        success: false,
                        error: "User not found",
                        timestamp: new Date().toISOString()
                    });
                }
                
                res.json({
                    success: true,
                    userID: userID,
                    money: user.money || 0,
                    exp: user.exp || 0,
                    createTime: user.createTime?.timestamp || null,
                    lastUpdate: user.lastUpdate || null,
                    timestamp: new Date().toISOString()
                });
            } else {
                const users = [];
                for (const [id, data] of Object.entries(usersData)) {
                    users.push({
                        userID: id,
                        money: data.money || 0,
                        exp: data.exp || 0
                    });
                }
                
                res.json({
                    success: true,
                    totalUsers: users.length,
                    users: users,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    app.get("/api/thread/ban", async (req, res) => {
        try {
            const threadID = req.query.id;
            const reason = req.query.reason || "No reason provided";
            
            if (!threadID) {
                return res.status(400).json({
                    success: false,
                    error: "Thread ID is required",
                    timestamp: new Date().toISOString()
                });
            }
            
            if (!global.data.threadBanned) {
                global.data.threadBanned = new Map();
            }
            
            global.data.threadBanned.set(threadID, {
                bannedAt: Date.now(),
                reason: reason
            });
            
            res.json({
                success: true,
                message: "Thread banned successfully",
                threadID: threadID,
                reason: reason,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    app.get("/api/thread/unban", async (req, res) => {
        try {
            const threadID = req.query.id;
            
            if (!threadID) {
                return res.status(400).json({
                    success: false,
                    error: "Thread ID is required",
                    timestamp: new Date().toISOString()
                });
            }
            
            if (!global.data.threadBanned || !global.data.threadBanned.has(threadID)) {
                return res.status(404).json({
                    success: false,
                    error: "Thread is not banned",
                    timestamp: new Date().toISOString()
                });
            }
            
            global.data.threadBanned.delete(threadID);
            
            res.json({
                success: true,
                message: "Thread unbanned successfully",
                threadID: threadID,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    app.get("/api/thread/leave", async (req, res) => {
        try {
            const threadID = req.query.id;
            
            if (!threadID) {
                return res.status(400).json({
                    success: false,
                    error: "Thread ID is required",
                    timestamp: new Date().toISOString()
                });
            }
            
            if (!global.client || !global.client.api) {
                return res.status(503).json({
                    success: false,
                    error: "Bot API not initialized yet",
                    timestamp: new Date().toISOString()
                });
            }
            
            global.client.api.sendMessage("Bot is leaving this group. Goodbye! 👋", threadID, (err) => {
                if (err) {
                    return res.status(500).json({
                        success: false,
                        error: err.message,
                        timestamp: new Date().toISOString()
                    });
                }
                
                setTimeout(() => {
                    global.client.api.removeUserFromGroup(global.client.api.getCurrentUserID(), threadID, (leaveErr) => {
                        if (leaveErr) {
                            return res.status(500).json({
                                success: false,
                                error: leaveErr.message,
                                timestamp: new Date().toISOString()
                            });
                        }
                        
                        res.json({
                            success: true,
                            message: "Bot left the thread successfully",
                            threadID: threadID,
                            timestamp: new Date().toISOString()
                        });
                    });
                }, 2000);
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    // =======================================================================
    // PENDING / MESSAGE REQUESTS
    // Same list the -pending command works with (OTHER + PENDING folders),
    // approved or rejected from the dashboard instead of by replying to a
    // numbered message in chat.
    // =======================================================================
    app.get("/api/pending/list", async (req, res) => {
        try {
            if (!global.client || !global.client.api) {
                return res.status(503).json({ success: false, error: "Bot is not logged in" });
            }
            const api = global.client.api;

            const [spam, pending] = await Promise.all([
                cached("pending:other", 30000, () => api.getThreadList(100, null, ["OTHER"])).catch(() => []),
                cached("pending:pending", 30000, () => api.getThreadList(100, null, ["PENDING"])).catch(() => [])
            ]);

            const list = [...(spam || []), ...(pending || [])]
                .filter(t => t && t.isSubscribed && t.isGroup)
                .map(t => ({
                    threadID: t.threadID,
                    name: t.name || null,
                    participants: (t.participantIDs || []).length,
                    folder: (pending || []).some(p => p.threadID === t.threadID) ? "pending" : "spam"
                }));

            // one entry per thread - a thread can appear in both folders
            const seen = new Set();
            const unique = list.filter(t => (seen.has(t.threadID) ? false : seen.add(t.threadID)));

            res.json({ success: true, total: unique.length, threads: unique });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post("/api/pending/action", async (req, res) => {
        try {
            if (!global.client || !global.client.api) {
                return res.status(503).json({ success: false, error: "Bot is not logged in" });
            }
            const api = global.client.api;

            const approve = req.body.action !== "reject";
            const ids = (Array.isArray(req.body.threadIDs) ? req.body.threadIDs : [req.body.threadID])
                .filter(Boolean).map(String);
            if (!ids.length) return res.status(400).json({ success: false, error: "No threads given" });

            const note = typeof req.body.message === "string" && req.body.message.trim()
                ? req.body.message.trim()
                : null;

            const done = [], failed = [];
            for (const threadID of ids) {
                try {
                    if (approve) {
                        await require("../includes/onboarding").approve(api, threadID, note);
                    } else {
                        if (typeof api.handleMessageRequest === "function") await api.handleMessageRequest(threadID, false);
                        if (typeof api.removeUserFromGroup === "function") await api.removeUserFromGroup(api.getCurrentUserID(), threadID);
                    }
                    done.push(threadID);
                } catch (e) {
                    failed.push({ threadID, error: (e && (e.error || e.message)) || String(e) });
                }
            }

            invalidate("pending:");
            invalidate("threadList");
            res.json({ success: true, action: approve ? "approved" : "rejected", done: done.length, failed });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // =======================================================================
    // DATABASE PANEL  (/database)
    // Status, manual sync, record view/edit, and wipes.
    // =======================================================================
    function sqlModule() {
        try { return require("../includes/database/sql"); } catch (e) { return null; }
    }

    app.get("/api/db/health", async (req, res) => {
        try {
            const sql = sqlModule();
            const status = sql ? await sql.status() : { enabled: false, connected: false };
            const stored = countStored();

            // how many groups the bot is actually in right now (cached 90s)
            let live = null;
            try {
                if (global.client && global.client.api) {
                    const list = await cached('threadList', 90000,
                        () => global.client.api.getThreadList(100, null, ["INBOX"]));
                    live = list.filter(t => t.isGroup).length;
                }
            } catch (e) {}

            res.json({
                success: true,
                db: status,
                local: {
                    users: stored.users,
                    threads: stored.threads,
                    liveThreads: live,
                    totalMoney: stored.totalMoney,
                    banned: stored.banned
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Very cheap "has anything changed?" probe: two stat() calls, no parsing,
    // no Facebook. The Database page polls this every few seconds and only
    // re-draws the table when the data files actually changed - so cash a
    // command just gave someone shows up on the website on its own.
    app.get("/api/db/pulse", (req, res) => {
        try {
            const stamp = (file) => {
                try { return Math.round(fs.statSync(file).mtimeMs); } catch (e) { return 0; }
            };
            res.json({
                success: true,
                v: stamp(USERS_PATH) + ":" + stamp(THREADS_PATH),
                now: Date.now()
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post("/api/db/sync", async (req, res) => {
        try {
            if (!global.dbFlush) {
                return res.status(400).json({ success: false, error: "Database is not connected" });
            }
            await global.dbFlush();
            res.json({ success: true, message: "Synced" });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // read one raw record
    app.get("/api/db/record", (req, res) => {
        try {
            const type = req.query.type === "thread" ? "thread" : "user";
            const id = String(req.query.id || "").trim();
            if (!id) return res.status(400).json({ success: false, error: "ID is required" });

            const store = readDB(type === "thread" ? THREADS_PATH : USERS_PATH);
            if (!store) return res.status(500).json({ success: false, error: "Database file unreadable" });
            if (!store[id]) return res.status(404).json({ success: false, error: `${type} ${id} not found` });

            res.json({ success: true, type, id, record: store[id] });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // save an edited record (the whole record is replaced by what you send)
    app.post("/api/db/record", (req, res) => {
        try {
            const type = req.body.type === "thread" ? "thread" : "user";
            const id = String(req.body.id || "").trim();
            let record = req.body.record;

            if (!id) return res.status(400).json({ success: false, error: "ID is required" });
            if (typeof record === "string") {
                try { record = JSON.parse(record); }
                catch (e) { return res.status(400).json({ success: false, error: "That isn't valid JSON: " + e.message }); }
            }
            if (!record || typeof record !== "object" || Array.isArray(record)) {
                return res.status(400).json({ success: false, error: "A record must be a JSON object" });
            }

            const file = type === "thread" ? THREADS_PATH : USERS_PATH;
            const store = readDB(file);
            if (!store) return res.status(500).json({ success: false, error: "Database file unreadable" });

            const isNew = !store[id];
            store[id] = record;
            writeDB(file, store);

            // keep the running bot in step with what was just saved
            if (type === "user") {
                if (record.banned === true) {
                    global.data.userBanned.set(id, { reason: record.banReason || "No reason", bannedAt: record.bannedAt || Date.now() });
                } else {
                    global.data.userBanned.delete(id);
                }
                if (!global.data.allUserID.includes(id)) global.data.allUserID.push(id);
            } else {
                if (record.data && record.data.banned === true) {
                    global.data.threadBanned.set(id, { reason: record.data.reason || "", dateAdded: Date.now() });
                } else {
                    global.data.threadBanned.delete(id);
                }
                if (record.threadInfo) global.data.threadInfo.set(id, record.threadInfo);
                if (record.data) global.data.threadData.set(id, record.data);
                if (!global.data.allThreadID.includes(id)) global.data.allThreadID.push(id);
            }

            res.json({ success: true, message: isNew ? "Record created" : "Record saved", type, id, record });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // wipe. Requires confirm:"WIPE" in the body so a stray click can't fire it.
    app.post("/api/db/wipe", async (req, res) => {
        const ALLOWED = ["money", "bans", "users", "threads", "everything"];
        try {
            const target = String(req.body.target || "");
            if (!ALLOWED.includes(target)) {
                return res.status(400).json({ success: false, error: "Unknown target. Use one of: " + ALLOWED.join(", ") });
            }
            if (String(req.body.confirm || "") !== "WIPE") {
                return res.status(400).json({ success: false, error: 'Type WIPE to confirm' });
            }

            const sql = sqlModule();
            if (!sql) return res.status(500).json({ success: false, error: "Database module missing" });

            // a copy on disk before anything is destroyed
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            const backupDir = path.join(DB_DIR, "backups");
            fs.ensureDirSync(backupDir);
            for (const [name, file] of [["usersData", USERS_PATH], ["threadsData", THREADS_PATH]]) {
                if (fs.existsSync(file)) fs.copyFileSync(file, path.join(backupDir, `${name}-${stamp}.json`));
            }

            const result = await sql.wipe(target);
            invalidate("");
            console.log(`[panel] WIPE (${target}) - backup saved as ${stamp}`);

            res.json({
                success: true,
                message: `Wiped: ${target}`,
                backup: `includes/database/data/backups/*-${stamp}.json`,
                ...result
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.get("/api/files/list", (req, res) => {
        const targetPath = path.join(__dirname, '..', req.query.path || "");
        try {
            const files = fs.readdirSync(targetPath, { withFileTypes: true });
            const result = files.map(f => ({
                name: f.name,
                isDirectory: f.isDirectory()
            }));
            res.json(result);
        } catch (err) {
            res.status(500).send([]);
        }
    });

    app.get("/api/files/read", (req, res) => {
        const filePath = path.join(__dirname, '..', req.query.path);
        try {
            const content = fs.readFileSync(filePath, "utf8");
            res.json({ content });
        } catch (err) {
            res.status(500).json({ content: "" });
        }
    });

    app.post("/api/files/save", (req, res) => {
        const filePath = path.join(__dirname, '..', req.body.name);
        try {
            fs.writeFileSync(filePath, req.body.data);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false });
        }
    });

    app.post("/api/files/create", (req, res) => {
        const filePath = path.join(__dirname, '..', req.body.name);
        try {
            fs.writeFileSync(filePath, "");
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false });
        }
    });

    app.delete("/api/files/delete", (req, res) => {
        const filePath = path.join(__dirname, '..', req.query.path);
        try {
            if (fs.lstatSync(filePath).isDirectory()) {
                fs.rmSync(filePath, { recursive: true });
            } else {
                fs.unlinkSync(filePath);
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false });
        }
    });

    app.post("/api/files/rename", (req, res) => {
        const oldPath = path.join(__dirname, '..', req.body.oldPath);
        const newPath = path.join(path.dirname(oldPath), req.body.newName);
        try {
            fs.renameSync(oldPath, newPath);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false });
        }
    });
}

module.exports = { setupAPIRoutes };
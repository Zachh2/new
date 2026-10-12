/**
 * Single-instance lock.
 *
 * Two copies of the bot running at once is the quiet killer here. It happens
 * easily: the panel starts main.js while start.js also spawns one, a restart
 * leaves the old process alive, or someone hits Start twice. Both copies then
 * log in with the SAME appstate.json and hold their own chat sockets. Facebook
 * sees one account with two live sessions, kills them, and the cookies stop
 * working - the "auto logout". It also doubles every console line and every
 * reply in chat, which looks exactly like a restart loop.
 *
 * So: the first process writes its PID here, and any later one that finds a
 * LIVE pid in the file refuses to start (exit code 0, so the supervisor does
 * not try again). A stale file - the process is gone - is simply taken over.
 */
const fs = require("fs");
const path = require("path");

const LOCK = path.join(__dirname, "..", "..", "bot.lock");

function readLock() {
  try {
    const raw = fs.readFileSync(LOCK, "utf8").trim();
    const data = JSON.parse(raw);
    return data && data.pid ? data : null;
  } catch (e) {
    return null;
  }
}

/**
 * Is that pid a LIVE COPY OF THIS BOT?
 *
 * "Does a process with this pid exist" is not enough. Containers restart with
 * low pids and reuse them constantly, so the pid in an old lock file is very
 * often some unrelated process - the supervisor, a shell, npm. Treating that
 * as "already running" would stop the bot from ever starting again.
 *
 * So: the pid must exist, must not be us or our own parent, and on Linux its
 * command line must actually be node running main.js. If anything can't be
 * verified, we assume the lock is stale and take it - a rare double start is
 * recoverable, a bot that refuses to boot is not.
 */
function alive(pid) {
  if (!pid || pid === process.pid || pid === process.ppid) return false;

  try {
    process.kill(pid, 0);     // signal 0 = existence check only
  } catch (e) {
    if (e.code !== "EPERM") return false;   // no such process
  }

  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
    if (!cmdline.trim()) return false;
    const isOurBot = /node/i.test(cmdline) && /main\.js/i.test(cmdline);
    if (!isOurBot) {
      console.log(`[lock] pid ${pid} is not this bot (${cmdline.trim().slice(0, 60)}) - ignoring the old lock.`);
      return false;
    }
    return true;
  } catch (e) {
    // no /proc (not Linux) or no permission - don't block the boot over it
    return false;
  }
}

function write() {
  try {
    fs.writeFileSync(LOCK, JSON.stringify({
      pid: process.pid,
      started: new Date().toISOString(),
      supervised: process.env.BOT_SUPERVISED === "1"
    }, null, 2));
  } catch (e) {}
}

function release() {
  try {
    const current = readLock();
    if (current && current.pid === process.pid) fs.unlinkSync(LOCK);
  } catch (e) {}
}

/** Returns true if we hold the lock; false means another bot is running. */
function acquire() {
  // last resort switch, in case this ever gets it wrong:
  // "singleInstance": false in config.json
  if (global.config && global.config.singleInstance === false) {
    write();
    process.on("exit", release);
    return true;
  }

  const existing = readLock();

  if (existing && alive(existing.pid)) {
    console.log("");
    console.log("=========================================================");
    console.log(` Another copy of the bot is already running (pid ${existing.pid},`);
    console.log(` started ${existing.started}).`);
    console.log("");
    console.log(" Two copies share one appstate.json, and Facebook logs the");
    console.log(" account out when it sees two sessions. This one is stopping.");
    console.log("");
    console.log(" If that pid is wrong, delete bot.lock and start again.");
    console.log("=========================================================");
    console.log("");
    return false;
  }

  if (existing) {
    console.log(`[lock] Taking over from a dead process (pid ${existing.pid}).`);
  }

  write();
  process.on("exit", release);
  return true;
}

module.exports = { acquire, release, readLock, LOCK };

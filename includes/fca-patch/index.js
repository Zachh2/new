/**
 * Applies the fixed listenMqtt.js to node_modules/fbvibex on every boot.
 *
 * Why at boot instead of editing node_modules once: `npm install` (or the
 * package auto-updater) would silently undo a one-time edit and the logout
 * bug would come back. This runs before fbvibex is required, so the fix is
 * always in place.
 *
 * It only patches the exact version it was written for. If fbvibex updates,
 * it leaves the new version alone and prints a warning instead of risking a
 * broken bot.
 *
 * Also patches node_modules/fca-nx (the library this bot actually uses):
 *   - loginHelper.js : the E2EE second-socket auto-connect is disabled
 *   - listenMqtt.js  : the unconditional hourly reconnect is disabled
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SUPPORTED_VERSION = "4.4.5";
const MARKER = "// PATCHED by includes/fca-patch";

// fca-nx patch markers (kept separate so a node_modules refresh can't fake
// an already-patched file)
const FCA_NX_E2EE_MARKER = "// [fca-patch] E2EE auto-connect is disabled by default";
const FCA_NX_CYCLE_MARKER = "// [fca-patch] No unconditional hourly reconnect";

function sha1(buf) {
  return crypto.createHash("sha1").update(buf).digest("hex");
}

function backupOnce(file, src) {
  if (fs.existsSync(file + ".orig")) return;
  try {
    fs.writeFileSync(file + ".orig", src);
  } catch (e) {}
}

/**
 * Password login crashes on modern Facebook HTML.
 *
 * makeLogin() scrapes cookie blobs out of the page with:
 *     JSON.parse(`["${getFrom(val, "", "]")}]`)
 * The page no longer contains them in that shape, so JSON.parse throws
 *     Expected ',' or ']' after array element in JSON at position 7
 * and the whole login dies - before the password is even sent. One bad blob
 * shouldn't sink the login, so this wraps it: unreadable entries are skipped
 * and the login carries on.
 */
function patchLoginJson(pkgDir) {
  const file = path.join(pkgDir, "index.js");
  try {
    let src = fs.readFileSync(file, "utf8");
    if (src.includes("/* fca-patch: tolerant cookie parse */")) return true;

    const broken = `        jar.setCookie(
          utils.formatCookie(JSON.parse(\`["\${utils.getFrom(val, "", "]")}]\`), "facebook"),
          "https://www.facebook.com"
        );`;
    const fixed = `        /* fca-patch: tolerant cookie parse */
        try {
          jar.setCookie(
            utils.formatCookie(JSON.parse(\`["\${utils.getFrom(val, "", "]")}]\`), "facebook"),
            "https://www.facebook.com"
          );
        } catch (e) { /* page no longer carries this blob - skip it */ }`;

    if (!src.includes(broken)) {
      console.log("[fca-patch] login cookie block not found - leaving index.js alone.");
      return false;
    }

    backupOnce(file, src);
    fs.writeFileSync(file, src.replace(broken, fixed));
    console.log("[fca-patch] Applied password-login fix to fbvibex.");
    return true;
  } catch (e) {
    console.log("[fca-patch] Could not patch index.js: " + e.message);
    return false;
  }
}

/**
 * fca-nx loginHelper.js disables the E2EE / Secret-Conversation auto-connect.
 *
 * The E2EE bridge ("api.e2ee") opens a SECOND, parallel session socket (Noise
 * WebSocket + ICDC device registration) using the same cookies the main MQTT
 * socket already uses. Two active devices on one account is the textbook
 * "abnormal session" pattern that gets bot accounts force-logged-out.
 *
 * Worse: whenever that second socket couldn't authenticate, its GraphQL
 * POSTs came back "Not logged in", and fca-nx's post-guard rewrote them as
 * listener errors of type account_inactive - which made main.js stop the bot
 * dead with "facebook ended the session" while the MAIN session was fine.
 *
 * The E2EE machinery stays loaded (api.e2ee, api.listenE2EE); only the
 * background auto-connect is skipped. Secret Conversations are opt-in:
 * FCA_E2EE=1 or an explicit api.connectE2EE() call.
 */
function patchFcaNxLoginHelper(pkgDir) {
  const file = path.join(pkgDir, "module", "loginHelper.js");
  try {
    let src = fs.readFileSync(file, "utf8");
    if (src.includes(FCA_NX_E2EE_MARKER)) return true;

    const target = `          const connectE2EEWithRetry = async (attempt = 0) => {
            try {
              await api.connectE2EE();
              logger("E2EE auto-connected and merged into api.listen()/api.listenMqtt()");
            } catch (e) {
              const msg = e && e.message ? e.message : String(e);
              if (attempt < 3) {
                const delayMs = 5000 * Math.pow(3, attempt); // 5s, 15s, 45s
                logger(\`E2EE auto-connect failed (attempt \${attempt + 1}/4): \${msg} - retrying in \${Math.round(delayMs / 1000)}s\`, "warn");
                setTimeout(() => connectE2EEWithRetry(attempt + 1), delayMs);
              } else {
                logger(\`E2EE auto-connect failed after 4 attempts (non-fatal, continuing without E2EE): \${msg}\`, "warn");
              }
            }
          };
          connectE2EEWithRetry();`;

    const fixed = `          // [fca-patch] E2EE auto-connect is disabled by default.
          //
          // Auto-connecting E2EE opens a SECOND, parallel session socket
          // (Noise WebSocket + ICDC device registration) on the same cookies
          // the main MQTT socket already uses. Two active devices on one
          // account = the "abnormal session" pattern Facebook force-logs out,
          // and its failed auth POSTs came back "Not logged in", which the
          // post-guard turned into listener errors that stopped the whole bot
          // on an otherwise healthy session.
          //
          // Secret Conversations are opt-in: enable per-boot with FCA_E2EE=1,
          // or call api.connectE2EE() from the bot's own code.
          const connectE2EEWithRetry = async (attempt = 0) => {
            try {
              await api.connectE2EE();
              logger("E2EE auto-connected and merged into api.listen()/api.listenMqtt()");
            } catch (e) {
              const msg = e && e.message ? e.message : String(e);
              if (attempt < 3) {
                const delayMs = 5000 * Math.pow(3, attempt); // 5s, 15s, 45s
                logger(\`E2EE auto-connect failed (attempt \${attempt + 1}/4): \${msg} - retrying in \${Math.round(delayMs / 1000)}s\`, "warn");
                setTimeout(() => connectE2EEWithRetry(attempt + 1), delayMs);
              } else {
                logger(\`E2EE auto-connect failed after 4 attempts (non-fatal, continuing without E2EE): \${msg}\`, "warn");
              }
            }
          };
          if (process.env.FCA_E2EE === "1") {
            connectE2EEWithRetry();
          } else {
            logger("fca-patch: E2EE auto-connect disabled (second parallel socket is a forced-logout trigger). Enable with FCA_E2EE=1.", "warn");
          }`;

    if (!src.includes(target)) {
      console.log("[fca-patch] fca-nx E2EE block not found - leaving loginHelper.js alone.");
      return false;
    }

    backupOnce(file, src);
    fs.writeFileSync(file, src.replace(target, fixed));
    console.log("[fca-patch] Disabled fca-nx E2EE auto-connect (loginHelper.js).");
    return true;
  } catch (e) {
    console.log("[fca-patch] Could not patch loginHelper.js: " + (e && e.message ? e.message.split("\n")[0] : e));
    return false;
  }
}

/**
 * fca-nx listenMqtt.js disables the unconditional hourly reconnect.
 *
 * The default set a timer that force-cycled the MQTT socket every hour no
 * matter how healthy the connection was. Every forced reconnect is a fresh
 * device handshake - more traffic, another connection to flag. Cycling now
 * only happens in response to a real error or a timed-out heartbeat.
 */
function patchFcaNxListenMqtt(pkgDir) {
  const file = path.join(pkgDir, "src", "api", "socket", "listenMqtt.js");
  try {
    let src = fs.readFileSync(file, "utf8");
    if (src.includes(FCA_NX_CYCLE_MARKER)) return true;

    const target = "const CYCLE_MS_DEFAULT = 60 * 60 * 1000;";
    const fixed = `// [fca-patch] No unconditional hourly reconnect. The old default force-cycled
// the MQTT socket every hour no matter how healthy the connection was - every
// forced reconnect is a fresh device handshake and another thing to flag as
// abnormal. Cycling now happens only on a real error or a dead heartbeat.
const CYCLE_MS_DEFAULT = 0;`;

    if (!src.includes(target)) {
      console.log("[fca-patch] fca-nx cycle default not found - leaving listenMqtt.js alone.");
      return false;
    }

    backupOnce(file, src);
    fs.writeFileSync(file, src.replace(target, fixed));
    console.log("[fca-patch] Disabled fca-nx hourly MQTT force-cycle (listenMqtt.js).");
    return true;
  } catch (e) {
    console.log("[fca-patch] Could not patch fca-nx listenMqtt.js: " + (e && e.message ? e.message.split("\n")[0] : e));
    return false;
  }
}

module.exports = function applyFcaPatch() {
  let any = false;

  try {
    const pkgDir = path.dirname(require.resolve("fbvibex/package.json"));
    const version = require(path.join(pkgDir, "package.json")).version;
    const target = path.join(pkgDir, "src", "listenMqtt.js");
    const patched = fs.readFileSync(path.join(__dirname, "listenMqtt.js"));

    if (version !== SUPPORTED_VERSION) {
      console.log(
        `[fca-patch] fbvibex is ${version}, patch was written for ${SUPPORTED_VERSION}. ` +
        `Skipping - check whether the new version still has the reconnect bug.`
      );
    } else {
      const current = fs.readFileSync(target);
      if (sha1(current) === sha1(patched)) {
        patchLoginJson(pkgDir);                          // may still be missing
      } else {
        // keep one copy of the untouched original for easy rollback
        if (!fs.existsSync(target + ".orig") && !current.toString().includes(MARKER)) {
          fs.writeFileSync(target + ".orig", current);
        }
        fs.writeFileSync(target, patched);
        console.log("[fca-patch] Applied MQTT reconnect fix to fbvibex.");
        patchLoginJson(pkgDir);
      }
      any = true;
    }
  } catch (e) {
    if (/cannot find module/i.test((e && e.message) || "")) {
      console.log("[fca-patch] fbvibex is not installed - skipping its patches (fca-nx is the active library).");
    } else {
      console.log("[fca-patch] Could not patch fbvibex: " + String(e && e.message ? e.message.split("\n")[0] : e));
    }
  }

  const fcaNxDir = path.resolve(__dirname, "..", "..", "node_modules", "fca-nx");
  if (fs.existsSync(path.join(fcaNxDir, "package.json"))) {
    any = patchFcaNxLoginHelper(fcaNxDir) || any;
    any = patchFcaNxListenMqtt(fcaNxDir) || any;
  } else {
    console.log("[fca-patch] fca-nx is not installed - skipping its patches.");
  }

  return any;
};
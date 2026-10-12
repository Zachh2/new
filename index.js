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
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SUPPORTED_VERSION = "4.4.5";
const MARKER = "// PATCHED by includes/fca-patch";

function sha1(buf) {
  return crypto.createHash("sha1").update(buf).digest("hex");
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

    if (!fs.existsSync(file + ".orig")) fs.writeFileSync(file + ".orig", src);
    fs.writeFileSync(file, src.replace(broken, fixed));
    console.log("[fca-patch] Applied password-login fix to fbvibex.");
    return true;
  } catch (e) {
    console.log("[fca-patch] Could not patch index.js: " + e.message);
    return false;
  }
}

module.exports = function applyFcaPatch() {
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
      return false;
    }

    const current = fs.readFileSync(target);
    if (sha1(current) === sha1(patched)) {
      patchLoginJson(pkgDir);                          // may still be missing
      return true;
    }

    // keep one copy of the untouched original for easy rollback
    const backup = target + ".orig";
    if (!fs.existsSync(backup) && !current.toString().includes(MARKER)) {
      fs.writeFileSync(backup, current);
    }

    fs.writeFileSync(target, patched);
    console.log("[fca-patch] Applied MQTT reconnect fix to fbvibex.");
    patchLoginJson(pkgDir);
    return true;
  } catch (e) {
    console.log("[fca-patch] Could not apply patch: " + e.message);
    return false;
  }
};

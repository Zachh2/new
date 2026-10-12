'use strict';

const fs = require('fs');
const path = require('path');

const PATCHES = [
  "src/utils/accountWarning.js",
  "src/utils/loginParser/parseAndCheckLogin.js",
  "src/utils/mqttRequest.js",
  "src/api/messaging/setMessageReaction.js",
  "src/api/messaging/editMessage.js",
  "src/api/messaging/sendTypingIndicator.js",
  "src/api/messaging/sendMessage.js",
  "src/utils/sessionStore.js",
  "src/utils/sessionProbe.js",
  "src/utils/loginParser/autoLogin.js",
  "src/api/messaging/sessionGuard.js",
  "src/api/action/enableAutoSaveAppState.js",
  "src/utils/sessionTokens.js",
  "src/utils/sessionMaintenance.js",
  "src/api/action/refreshFb_dtsg.js",
  "src/api/socket/core/emitAuth.js",
  'src/utils/request/proxy.js',
  'src/utils/request/client.js',
  'src/utils/request/config.js',
  'src/utils/request/methods.js',
  'src/api/socket/listenMqtt.js',
  'src/api/socket/core/connectMqtt.js',
  'src/api/socket/core/getSeqID.js',
  'src/api/socket/core/parseDelta.js',
  'src/database/models/index.js'
];

const OPTIONAL_E2EE_WARNING = 'logger("fca-patch: E2EE auto-connect disabled (second parallel socket is a forced-logout trigger). Enable with FCA_E2EE=1.", "warn");';
const OPTIONAL_E2EE_INFO = 'logger("E2EE optional connection is off; standard Messenger listener remains active.", "info");';

module.exports = function ensureFcaPatches(packageEntry) {
  const packageRoot = path.dirname(packageEntry);
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  if (manifest.name !== 'fca-nx' || manifest.version !== '6.7.1') {
    throw new Error(`FCA patch expects fca-nx 6.7.1; installed ${manifest.name || 'unknown'} ${manifest.version || 'unknown'}`);
  }

  // Validate the complete patch bundle before mutating any installed FCA file.
  const missing=PATCHES.filter(relative=>!fs.existsSync(path.join(__dirname,'fca-patches',relative)));
  if(missing.length)throw new Error('Incomplete FCA patch bundle. Restore these files under includes/safety/fca-patches: '+missing.join(', '));
  let changed = 0;
  for (const relative of PATCHES) {
    const source = path.join(__dirname, 'fca-patches', relative);
    const destination = path.join(packageRoot, relative);
    if (!fs.existsSync(destination) && !["src/utils/accountWarning.js", "src/utils/mqttRequest.js", "src/utils/sessionStore.js", "src/utils/sessionProbe.js", "src/utils/sessionTokens.js", "src/utils/sessionMaintenance.js"].includes(relative)) throw new Error(`FCA patch target missing: ${relative}`);
    const desired = fs.readFileSync(source);
    if (fs.existsSync(destination) && fs.readFileSync(destination).equals(desired)) continue;

    // Write a complete file, then replace it before FCA is loaded.
    const temp = `${destination}.${process.pid}.patch`;
    try {
      fs.writeFileSync(temp, desired);
      fs.renameSync(temp, destination);
    } catch (error) {
      try { fs.unlinkSync(temp); } catch (_) {}
      throw new Error(`Cannot apply FCA patch ${relative}: ${error.message}`);
    }
    changed++;
  }
  function editText(relative, transform) {
    const target = path.join(packageRoot, relative);
    const original = fs.readFileSync(target, 'utf8');
    const revised = transform(original);
    if (revised !== original) {
      const temp = `${target}.${process.pid}.patch`;
      try {
        fs.writeFileSync(temp, revised);
        fs.renameSync(temp, target);
      } catch (error) {
        try { fs.unlinkSync(temp); } catch (_) {}
        throw new Error(`Cannot update FCA ${relative}: ${error.message}`);
      }
      changed++;
    }
  }
  function insert(source, anchor, addition) {
    if (source.includes(anchor + addition)) return source;
    if (!source.includes(anchor)) throw new Error('Installed FCA login code is incompatible with the managed login patch');
    return source.split(anchor).join(anchor + addition);
  }
  editText('module/loginHelper.js', source => {
    source = source.replace(OPTIONAL_E2EE_WARNING, OPTIONAL_E2EE_INFO);
    source = source.replace('if (api.refreshFb_dtsg) {',
      'if (process.env.FCA_APPSTATE_MANAGED !== "1" && api.refreshFb_dtsg) {');
    source = insert(source,
      'async function tryAutoLoginIfNeeded(currentHtml, currentCookies, globalOptions, ctxRef, hadAppStateInput = false, jar) {',
      '\n  if (process.env.FCA_MANAGED_AUTO_LOGIN === "1") { const e = new Error("Not logged in."); e.code = "AUTH_REQUIRED"; throw e; }');
    source = insert(source, 'ctxMain.performAutoLogin = async () => {',
      '\n          if (process.env.FCA_MANAGED_AUTO_LOGIN === "1") return false;');
    source = insert(source, 'ctx.bypassAutomation = async function (resp, j) {',
      '\n        return require("../src/utils/accountWarning").assertNoWarning(resp);');
    source = insert(source, 'let finalHtmlUID = getUIDFromHTML(html);',
      '\n        if (process.env.FCA_MANAGED_AUTO_LOGIN === "1" && !isValidUID(finalHtmlUID)) {' +
      '\n          const e = new Error(/name=["\\\'](?:email|pass)["\\\']/.test(html) || finalHtmlUID === "0" ? "Not logged in." : "Session verification unavailable");' +
      '\n          e.code = e.message === "Not logged in." ? "AUTH_REQUIRED" : "SESSION_UNVERIFIED"; throw e;' +
      '\n        }');
    source = insert(source, 'const defaultFuncs = makeDefaults(html, userID, ctxMain);',
      '\n        if (!api.ctx) Object.defineProperty(api, "ctx", { value: ctxMain, configurable: true });');
    source = source.replace('if (typeof api.sessionGuard === "function") {',
      'if (process.env.FCA_APPSTATE_MANAGED !== "1" && typeof api.sessionGuard === "function") {');
    return source;
  });
  editText('module/login.js', source => source.replace('if (config && config.autoUpdate) {',
    'if (config && config.autoUpdate && process.env.FCA_MANAGED_AUTO_LOGIN !== "1") {'));
  console.log(`[fca-patch] ${changed} file(s) applied to ${packageRoot}`);
};

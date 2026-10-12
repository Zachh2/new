const fs = require("fs-extra");
const path = require('path');
const { execSync, spawn } = require('child_process');
const config = require("./config.json");
const { join } = path;
const express = require("express");
const session = require("express-session");
const WebSocket = require("ws");
const os = require("os");

const listPackage = JSON.parse(fs.readFileSync('./package.json')).dependencies;
// The bot owns password recovery and appstate persistence for this process.
process.env.FCA_MANAGED_AUTO_LOGIN = '1';
process.env.FCA_APPSTATE_MANAGED = '1';
require("./includes/fca-patch")();
// The host may reinstall node_modules on each boot. Apply the FCA fixes to
// the package Node will actually load, after the existing installer runs.
require("./includes/safety/ensure-fca-patches")(require.resolve("fca-nx"));
const login = require("fca-nx");
const installThrottle = require("./includes/safety/throttle");
const installReadCache = require("./includes/safety/readcache");
const moment = require("moment-timezone");
const logger = require("./utils/log.js");
const chalk = require("chalk");
const pkg = require('./package.json');
const { setupAPIRoutes } = require("./utils/apis.js");

const app = express();
const PORT = process.env.PORT || 5005;
const startTime = Date.now();

const boot = require("./utils/boot.js");
boot.banner("ZACH CORE", pkg.version);
boot.box("system", [
  ["Node", process.version],
  ["Platform", process.platform + " " + process.arch],
  ["Process", "pid " + process.pid],
  ["Started", new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })],
]);
global.boot = boot;

global.utils = require("./utils");
global.loading = require("./utils/log.js");
global.nodemodule = new Object();
global.config = new Object();
global.configModule = new Object();
global.moduleData = new Array();
global.language = new Object();
global.account = new Object();

process.noDeprecation = true;

const _fsBoot = require("fs");
const CRASH_LOG = __dirname + "/crash.log";
let _exitReason = null;

global.stopBot = function (code, reason) {
  _exitReason = reason || "no reason given";
  process.exit(code);
};

function noteExit(line) {
  try {
    _fsBoot.appendFileSync(CRASH_LOG, `[${new Date().toISOString()}] ${line}\n`);
    const kept = _fsBoot.readFileSync(CRASH_LOG, "utf8").split("\n").slice(-200).join("\n");
    _fsBoot.writeFileSync(CRASH_LOG, kept);
  } catch (e) {}
}

process.on("exit", (code) => {
  const why = _exitReason || (code === 0 ? "clean shutdown" : "unexpected exit");
  process.stdout.write("\n===================== BOT STOPPED =====================\n");
  process.stdout.write(`[exit] code ${code} - ${why}\n`);
  process.stdout.write(code === 0
    ? "[exit] Exit code 0 means ON PURPOSE - nothing will restart it.\n"
    : "[exit] Non-zero code - the supervisor will start it again.\n");
  process.stdout.write("=======================================================\n");
  noteExit(`exit ${code} - ${why}`);
});

try {
  const lines = _fsBoot.readFileSync(CRASH_LOG, "utf8").trim().split("\n").filter(Boolean);
  const recent = lines.slice(-5);
  if (recent.length) {
    console.log("[boot] how the last runs ended:");
    recent.forEach(l => console.log("        " + l));
    const lastFive = lines.slice(-5).map(l => Date.parse(l.slice(1, 25))).filter(n => !isNaN(n));
    if (lastFive.length === 5 && (Date.now() - lastFive[0]) < 10 * 60000) {
      console.log("[boot] WARNING: five stops in the last 10 minutes - this is a loop.");
    }
  }
} catch (e) {}

if (!require("./includes/safety/instance-lock").acquire()) {
  _exitReason = "another instance is already running";
  process.exit(0);
}

process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning') return;
  console.log(`[warning] ${warning.name}: ${warning.message}`);
});

process.on('unhandledRejection', (reason) => {
  const msg = (reason && (reason.error || reason.message)) || String(reason);
  if (global.config && global.config.DeveloperMode === true && reason && reason.stack) {
    console.error('[unhandledRejection]', reason.stack);
  } else {
    console.error('[unhandledRejection]', msg);
  }
});

process.on('uncaughtException', (err) => {
  const msg = (err && err.message) || String(err);
  console.error('[uncaughtException]', err && err.stack ? err.stack : msg);
  const FATAL = ['EADDRINUSE'];
  if (FATAL.some(f => msg.includes(f) || err.code === f)) {
    console.error('Unrecoverable — exiting so the panel can restart.');
    global.stopBot(1, 'fatal: ' + msg.slice(0, 120));
  }
  console.error('Recovered — the bot is still running.');
});

global.client = new Object({
  commands: new Map(),
  events: new Map(),
  cooldowns: new Map(),
  eventRegistered: new Array(),
  handleSchedule: new Array(),
  handleReaction: new Array(),
  handleReply: new Array(),
  mainPath: process.cwd(),
  configPath: new String(),
  getTime: function(option) {
    switch (option) {
      case "seconds": return `${moment.tz("Asia/Manila").format("ss")}`;
      case "minutes": return `${moment.tz("Asia/Manila").format("mm")}`;
      case "hours": return `${moment.tz("Asia/Manila").format("HH")}`;
      case "date": return `${moment.tz("Asia/Manila").format("DD")}`;
      case "month": return `${moment.tz("Asia/Manila").format("MM")}`;
      case "year": return `${moment.tz("Asia/Manila").format("YYYY")}`;
      case "fullHour": return `${moment.tz("Asia/Manila").format("HH:mm:ss")}`;
      case "fullYear": return `${moment.tz("Asia/Manila").format("DD/MM/YYYY")}`;
      case "fullTime": return `${moment.tz("Asia/Manila").format("HH:mm:ss DD/MM/YYYY")}`;
    }
  },
  timeStart: Date.now()
});

global.data = new Object({
  threadInfo: new Map(),
  threadData: new Map(),
  userName: new Map(),
  userBanned: new Map(),
  threadBanned: new Map(),
  commandBanned: new Map(),
  threadAllowNSFW: new Array(),
  allUserID: new Array(),
  allCurrenciesID: new Array(),
  allThreadID: new Array()
});

const { getThemeColors } = require("./utils/log");
const { html } = getThemeColors();
fs.readFile('./includes/cover/html.json', 'utf8', (err, data) => {
  if (err) return console.error(err);
  const res = JSON.parse(data);
  res.THEME_COLOR = html;
  fs.writeFile('./includes/cover/html.json', JSON.stringify(res, null, 2));
});

var configValue;
try {
  global.client.configPath = path.join(global.client.mainPath, "config.json");
  configValue = require(global.client.configPath);
  logger.loader("Found config.json file!");
} catch (e) {
  return logger.loader('"config.json" file not found."', "error");
}

try {
  for (const key in configValue) global.config[key] = configValue[key];
  logger.loader("Config Loaded!");
} catch (e) {
  return logger.loader("Can't load file config!", "error")
}

for (const property in listPackage) {
  try {
    global.nodemodule[property] = require(property)
  } catch (e) { }
}

const langFile = (fs.readFileSync(`${__dirname}/languages/${global.config.language || "en"}.lang`, {
  encoding: 'utf-8'
})).split(/\r?\n|\r/);
const langData = langFile.filter(item => item.indexOf('#') != 0 && item != '');
for (const item of langData) {
  const getSeparator = item.indexOf('=');
  const itemKey = item.slice(0, getSeparator);
  const itemValue = item.slice(getSeparator + 1, item.length);
  const head = itemKey.slice(0, itemKey.indexOf('.'));
  const key = itemKey.replace(head + '.', '');
  const value = itemValue.replace(/\\n/gi, '\n');
  if (typeof global.language[head] == "undefined") global.language[head] = new Object();
  global.language[head][key] = value;
}

global.getText = require('./includes/i18n').system;

function readSavedAppState(file) {
  const contents = fs.readFileSync(file, 'utf8');
  try { return JSON.parse(contents); }
  catch (parseError) {
    const key = process.env.REPL_OWNER || process.env.PROCESSOR_IDENTIFIER;
    if (!key || !global.config.encryptSt) throw parseError;
    return JSON.parse(global.utils.decryptState(contents, key));
  }
}

var appState;
try {
  var appStateFile = path.resolve(path.join(global.client.mainPath, config.APPSTATEPATH || "appstate.json"));
  appState = readSavedAppState(appStateFile);
  logger.loader("Found the bot's appstate.")
} catch (e) {
  logger.loader("Can't find the bot's appstate.", "error");
}

let isBotRunning = false;
let currentBotProcess = null;
let currentListenMqtt = null;

function reloadAllModules() {
  try {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('/modules/commands/') || key.includes('/modules/events/')) {
        delete require.cache[key];
      }
    });
    
    global.client.commands.clear();
    global.client.events.clear();
    global.client.eventRegistered = [];
    
    const commandsPath = `${global.client.mainPath}/modules/commands`;
    const listCommand = fs.readdirSync(commandsPath).filter(command => command.endsWith('.js') && !command.includes('example') && !global.config.commandDisabled.includes(command));
    boot.rule("modules");
    let _cmdDone = 0, _cmdFail = 0;
    for (const command of listCommand) {
      boot.progress("commands", ++_cmdDone, listCommand.length, command);
      try {
        const module = require(`${commandsPath}/${command}`);
        const { config } = module;

        if (!config?.name || !config?.commandCategory || !config?.hasOwnProperty('usePrefix')) continue;
        if (global.client.commands.has(config.name)) continue;

        const { dependencies, envConfig } = config;
        if (dependencies) {
          Object.entries(dependencies).forEach(([reqDependency]) => {
            if (listPackage[reqDependency]) return;
            try {
              execSync(`npm --package-lock false --save install ${reqDependency}`, {
                stdio: 'inherit',
                env: process.env,
                shell: true,
                cwd: join(__dirname, 'node_modules')
              });
              require.cache = {};
            } catch (error) {
              global.loading.err(`[PACKAGE] Failed to install package ${reqDependency}`, 'LOADED');
            }
          });
        }

        if (envConfig) {
          const moduleName = config.name;
          global.configModule[moduleName] = global.configModule[moduleName] || {};
          global.config[moduleName] = global.config[moduleName] || {};
          for (const envConfigKey in envConfig) {
            global.configModule[moduleName][envConfigKey] = global.config[moduleName][envConfigKey] ?? envConfig[envConfigKey];
            global.config[moduleName][envConfigKey] = global.config[moduleName][envConfigKey] ?? envConfig[envConfigKey];
          }
          var configPath = require('./config.json');
          configPath[moduleName] = envConfig;
          fs.writeFileSync(global.client.configPath, JSON.stringify(configPath, null, 4), 'utf-8');
        }

        if (module.onLoad) module.onLoad({ api: global.client.api });
        if (module.handleEvent) global.client.eventRegistered.push(config.name);
        global.client.commands.set(config.name, module);
      } catch (error) {
        _cmdFail++;
      }
    }
    
    const events = fs.readdirSync(path.join(global.client.mainPath, 'modules/events')).filter(ev => ev.endsWith('.js') && !global.config.eventDisabled.includes(ev));
    let _evDone = 0;
    for (const ev of events) {
      boot.progress("events", ++_evDone, events.length, ev);
      try {
        const event = require(path.join(global.client.mainPath, 'modules/events', ev));
        const { config, onLoad, run } = event;
        if (!config || !config.name || !run || global.client.events.has(config.name)) continue;
        
        if (config.dependencies) {
          const missingDeps = Object.keys(config.dependencies).filter(dep => !global.nodemodule[dep]);
          if (missingDeps.length) {
            const depsToInstall = missingDeps.map(dep => `${dep}${config.dependencies[dep] ? '@' + config.dependencies[dep] : ''}`).join(' ');
            if (depsToInstall) {
              execSync(`npm install --no-package-lock --no-save ${depsToInstall}`, {
                stdio: 'inherit',
                env: process.env,
                shell: true,
                cwd: path.join(__dirname, 'node_modules')
              });
            }
            Object.keys(require.cache).forEach(key => delete require.cache[key]);
          }
        }
        
        if (onLoad) onLoad({ api: global.client.api });
        global.client.events.set(config.name, event);
      } catch (err) {}
    }
    logger.loader(`Reloaded ${global.client.commands.size} commands and ${global.client.events.size} events successfully`);
  } catch (err) {
    logger.loader("Failed to reload modules: " + err, "error");
  }
}

let listenRetry = 0;
let listenRetryTimer = null;
let listenSerial = 0;

let listener = null;
function startListening(api) {
  if (!listener) {
    try { listener = require('./includes/listen')({ api }); }
    catch (e) {
      listener = null;
      console.error('[listener] could not initialize message handlers:', e);
    }
  }
  
  const serial = ++listenSerial;
  currentListenMqtt = api.listenMqtt(async (error, event) => {
    if (serial !== listenSerial || global.client.api !== api) return;
    if (error) {
      // A confirmed auth failure is different from a temporary socket error.
      if (error.type === 'account_inactive') {
        require('./includes/safety/anti-logout')(api);
        global.__sessionDead = true;
        global.__mqttDown = false;
        if (listenRetryTimer) { clearTimeout(listenRetryTimer); listenRetryTimer = null; }
        if (error.reason === 'not_logged_in' && typeof global.recoverLogin === 'function') {
          await global.recoverLogin('not_logged_in');
        } else {
          global.pauseAutoLogin?.();
          console.error('[session] Facebook requires account verification. Complete login in Facebook, then update appstate and restart.');
        }
        return;
      }

      global.__mqttDown = true;
      if (!global.__mqttDownSince) global.__mqttDownSince = Date.now();
      // FCA already reconnects with backoff. A second loop races its socket.
      if (api.ctx?.globalOptions?.autoReconnect !== false) {
        if (!global.__mqttRecoveryNoted) console.warn('[mqtt] connection interrupted; FCA will reconnect using the same session.');
        global.__mqttRecoveryNoted = true;
        return;
      }
      console.warn('[mqtt] listener error; retrying without clearing appstate');
      if (listenRetryTimer) return;
      listenRetry++;
      const wait = Math.min(15000 * listenRetry, 5 * 60 * 1000);
      const recover = () => {
        listenRetryTimer = null;
        if (serial !== listenSerial || global.client.api !== api) return;
        if (api.ctx?.mqttClient?.connected) {
          global.__mqttDown = false;
          global.__mqttDownSince = 0;
          return;
        }
        if (global.__mqttDown && !global.__sessionDead) {
          global.__mqttDown = false;
          global.__mqttDownSince = 0;
          refreshMQTT();
        }
      };
      listenRetryTimer = setTimeout(recover, wait);
      return;
    }

    global.__mqttDown = false;
    global.__mqttDownSince = 0;
    global.__mqttRecoveryNoted = false;
    if (listenRetryTimer) {
      clearTimeout(listenRetryTimer);
      listenRetryTimer = null;
    }
    listenRetry = 0;
    global.__lastEvent = Date.now();
    if (global.config.logEvents === true) console.log(event);
    if (typeof listener !== 'function') return;
    try { return await listener(event); }
    catch (e) { console.error('[listener] could not process event:', e); }
  });
  return currentListenMqtt;
}

// One owner for token maintenance: the same FCA service used by listenMqtt.
// Never extract an unchecked token from a login/checkpoint HTML response.
function startDtsgRefresh(api) {
  if (global.__dtsgTimer) clearInterval(global.__dtsgTimer);
  if (global.__dtsgFirstTimer) clearTimeout(global.__dtsgFirstTimer);
  global.__dtsgTimer = null;
  global.__dtsgFirstTimer = null;
  if (!api.ctx || api.ctx.loggedIn === false || api.ctx._ending) return;
  if (api.ctx._sessionMaintenance && !api.ctx._sessionMaintenance.stopped) return;
  const root = path.dirname(require.resolve("fca-nx"));
  require(path.join(root, "src/utils/sessionMaintenance")).startMaintenance(api, api.ctx, (message, level) => {
    if (level === 'warn') console.warn('[session]', message);
  });
}

function startWatchdog() {
  if (global.__watchdog) return;
  global.__lastEvent = Date.now();
  global.__watchdog = setInterval(() => {
    // No chat traffic is normal; only reconnect when MQTT actually failed.
    if (!global.__mqttDown || listenRetryTimer || global.__sessionDead ||
        global.client?.api?.ctx?.globalOptions?.autoReconnect !== false ||
        Date.now() - (global.__mqttDownSince || Date.now()) < 10 * 60 * 1000) return;
    global.__mqttDown = false;
    global.__mqttDownSince = 0;
    try { refreshMQTT(); } catch (e) {}
  }, 60 * 1000);
  if (global.__watchdog.unref) global.__watchdog.unref();
}

async function refreshMQTT() {
  if (global.__mqttRefreshing) return;
  global.__mqttRefreshing = true;
  try {
    if (global.__sessionDead || !global.client?.api) return;
    const api = global.client.api;
    listenSerial++; // invalidate old callbacks before stopping their socket
    if (listenRetryTimer) { clearTimeout(listenRetryTimer); listenRetryTimer = null; }
    if (currentListenMqtt && typeof currentListenMqtt.stopListening === 'function') {
      const previous = currentListenMqtt;
      currentListenMqtt = null;
      let timeout;
      try {
        await Promise.race([
          new Promise(resolve => previous.stopListening(resolve)),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('MQTT stop timed out')), 10000); })
        ]);
      } finally { clearTimeout(timeout); }
    }
    if (!global.__sessionDead && global.client.api === api) startListening(api);
  } catch (err) {
    console.error('[mqtt] Could not safely restart listener:', err.message);
  } finally { global.__mqttRefreshing = false; }
}

global.restart = function(type) {
  if (type === 1) {
    reloadAllModules();
    refreshMQTT();
  } else if (type === 2) {
    if (currentListenMqtt && typeof currentListenMqtt.stopListening === 'function') {
      currentListenMqtt.stopListening();
    }
    if (typeof global.saveAppStateSync === 'function') global.saveAppStateSync('shutdown');
    setTimeout(() => { global.stopBot(0, 'shutdown requested'); }, 1000);
  }
};

async function onBot() {
  if (isBotRunning) return;
  isBotRunning = true;

  let fcaOpt;
  try {
    const proxySettings = require('./includes/safety/proxy-config').configureProxy(global.config.FCAOption, global.config);
    fcaOpt = proxySettings.options;
    if (proxySettings.enabled) console.log('[connection] Using the configured proxy for Facebook login and MQTT.');
  } catch (error) {
    return global.stopBot(0, error.message);
  }
  delete fcaOpt.logLevel;

  var CRED_FILE = path.join(global.client.mainPath, "credentials.json");
  var ACCOUNT_FILE = path.join(global.client.mainPath, "account.json");
  if (global.__autoLoginTimer) { clearTimeout(global.__autoLoginTimer); global.__autoLoginTimer = null; }
  
  function normalizeAppState(raw) {
    let arr = raw;
    if (arr && !Array.isArray(arr)) {
      arr = arr.appState || arr.cookies || arr.session || arr.data || null;
    }
    if (!Array.isArray(arr)) return { error: "appstate.json is not a list of cookies" };

    const cookies = [];
    for (const c of arr) {
      if (!c || typeof c !== "object") continue;
      const key = c.key || c.name || c.Name || c.cookieName;
      const value = c.value !== undefined ? c.value : c.Value;
      if (!key || value === undefined || value === null) continue;
      cookies.push({
        key: String(key),
        value: String(value),
        domain: c.domain || ".facebook.com",
        path: c.path || "/",
        hostOnly: c.hostOnly === true,
        secure: c.secure === true,
        httpOnly: c.httpOnly === true,
        ...(c.expires ? { expires: c.expires } : {}),
        creation: c.creation || new Date().toISOString(),
        lastAccessed: c.lastAccessed || new Date().toISOString()
      });
    }

    const names = cookies.map(c => c.key);
    if (!names.includes("c_user") && !names.includes("i_user")) {
      return { error: "no c_user cookie found", found: names };
    }
    const missing = ["xs", "datr"].filter(k => !names.includes(k));
    if (!sessionLooksAlive(cookies)) return { error: 'required login cookies are missing or invalid' };
    return { cookies, missing };
  }

  let checked = normalizeAppState(appState);
  // A reconnect in the same process should read cookies saved since startup.
  try {
    const latest = readSavedAppState(appStateFile);
    const candidate = normalizeAppState(latest);
    if (!candidate.error) { appState = latest; checked = candidate; }
  } catch (_) { /* use the in-memory session or the backup below */ }

  if (checked.error) {
    const backupFile = appStateFile.replace(/\.json$/, '') + '.backup.json';
    try {
      if (fs.existsSync(backupFile)) {
        const savedBackup = readSavedAppState(backupFile);
        const backup = normalizeAppState(savedBackup);
        if (!backup.error) {
          appState = savedBackup;
          checked = backup;
        }
      }
    } catch (e) {}
  }

  function sessionLooksAlive(state) {
    if (!Array.isArray(state) || state.length < 2) return false;
    const get = (k) => {
      const hit = state.find(c => c && (c.key === k || c.name === k));
      return hit ? String(hit.value === undefined ? "" : hit.value) : "";
    };
    const user = get("c_user") || get("i_user");
    const xs = get("xs");
    if (!/^\d{5,}$/.test(user)) return false;
    if (xs.length < 10 || /^deleted$/i.test(xs)) return false;
    return true;
  }
  global.sessionLooksAlive = sessionLooksAlive;

  function credentialsFrom(obj) {
    if (!obj || typeof obj !== "object") return null;
    const email = obj.email || obj.user || obj.username || obj.phone || obj.number || obj.id;
    const password = obj.password || obj.pass;
    if (email && password) return { email: String(email).trim(), password: String(password) };
    return null;
  }

  function loadCredentials() {
    if (process.env.FB_EMAIL && process.env.FB_PASSWORD) {
      return { email: process.env.FB_EMAIL, password: process.env.FB_PASSWORD };
    }
    for (const file of [ACCOUNT_FILE, CRED_FILE, path.join(global.client.mainPath, 'fca-config.json')]) {
      try {
        const saved = JSON.parse(fs.readFileSync(file, "utf8"));
        const from = credentialsFrom(saved.credentials || saved);
        if (from) return from;
      } catch (e) {}
    }
    return null;
  }

  let directLogin;
  const facebookLogin = () => directLogin || (directLogin = require('./includes/safety/facebook-login').createFacebookLogin());
  const enabled = () => process.env.FB_AUTO_LOGIN === '1' ||
    (process.env.FB_AUTO_LOGIN !== '0' && global.config.passwordRelogin === true);

  async function stopForLogin() {
    global.__sessionDead = true;
    listenSerial++;
    if (listenRetryTimer) { clearTimeout(listenRetryTimer); listenRetryTimer = null; }
    global.client.api?.__appStateStore?.stop?.();
    const previous = currentListenMqtt;
    if (previous?.stopListening) {
      let timeout;
      try {
        await Promise.race([
          new Promise(resolve => previous.stopListening(resolve)),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('MQTT stop timed out')), 10000); })
        ]);
      } finally { clearTimeout(timeout); }
      if (currentListenMqtt === previous) currentListenMqtt = null;
    }
  }

  const automatic = require('./includes/safety/auto-login').createAutoLogin({
    enabled,
    credentials: loadCredentials,
    stateFile: path.join(global.client.mainPath, 'auto-login.state.json'),
    authenticate: async creds => {
      await stopForLogin();
      const saved = normalizeAppState(appState).cookies || [];
      const expectedUserID = saved.find(c => c.key === 'i_user')?.value || saved.find(c => c.key === 'c_user')?.value;
      return facebookLogin().login({ ...creds, options: fcaOpt, appState: saved, expectedUserID });
    },
    acceptSession: async cookies => {
      if (!sessionLooksAlive(cookies)) throw new Error('Invalid login result');
      const key = process.env.REPL_OWNER || process.env.PROCESSOR_IDENTIFIER;
      const encrypted = Boolean(key && global.config.encryptSt);
      const owner = cookies.find(c => c.key === 'i_user')?.value || cookies.find(c => c.key === 'c_user')?.value;
      const store = require('./includes/safety/appstate-store').createAppStateStore(
        { getAppState: () => cookies, getCurrentUserID: () => owner }, appStateFile, sessionLooksAlive,
        encrypted ? text => global.utils.encryptState(text, key) : text => text,
        null, encrypted ? text => global.utils.decryptState(text, key) : text => text
      );
      if (!await store.save()) throw new Error('Could not save renewed appstate');
      appState = cookies;
      await new Promise((resolve, reject) => {
        login({ appState: cookies }, { ...fcaOpt, autoReconnect: true }, async (error, api) => {
          if (error || !api) {
            const detail = String(error?.error || error?.message || '');
            const failure = new Error('Could not start renewed session');
            if (/checkpoint|two.factor|login_blocked|login approval/i.test(detail)) failure.code = 'CHECKPOINT_REQUIRED';
            else if (error?.code === 'AUTH_REQUIRED' || /not logged in/i.test(detail)) failure.code = 'INTERACTIVE_LOGIN_REQUIRED';
            else {
              // The newly verified cookies are already saved. Retry those
              // cookies instead of posting the password again after a blip.
              failure.code = 'SESSION_BOOTSTRAP_PENDING';
              isBotRunning = false;
              console.warn('[auto-login] Renewed appstate saved; retrying bot startup in one minute.');
              setTimeout(() => onBot(), 60000);
            }
            return reject(failure);
          }
          try { await onLoggedIn(api); resolve(); } catch (failure) { reject(failure); }
        });
      });
    }
  });

  global.recoverLogin = async reason => {
    const result = await automatic.run(reason);
    if (['retry_later', 'cooldown'].includes(result.status) && enabled() && !global.__autoLoginTimer) {
      const delay = Math.max(1000, result.retryAt - Date.now());
      console.warn(`[auto-login] Next permitted recovery in ${Math.ceil(delay / 60000)} minute(s).`);
      global.__autoLoginTimer = setTimeout(() => {
        global.__autoLoginTimer = null;
        global.recoverLogin(reason).catch(() => console.error('[auto-login] Recovery failed.'));
      }, delay);
      global.__autoLoginTimer.unref?.();
    }
    if (result.status === 'disabled') console.warn('[auto-login] Password recovery is off. Set FB_AUTO_LOGIN=1 to enable it.');
    return result;
  };
  global.tryPasswordRelogin = async () => (await global.recoverLogin('not_logged_in')).status === 'success';
  global.pauseAutoLogin = () => {
    if (global.__autoLoginTimer) { clearTimeout(global.__autoLoginTimer); global.__autoLoginTimer = null; }
    try { automatic.pause(); } catch (_) { console.error('[auto-login] Could not persist checkpoint status.'); }
  };

  if (checked.error) {
    await global.recoverLogin('missing_appstate');
    return;
  }

  let loginData = { appState: checked.cookies };

  const loginAttempt = (global._loginAttempt || 0) + 1;
  console.log(`[login] Starting appstate login (attempt ${loginAttempt}, proxy ${fcaOpt.proxy ? 'configured' : 'off'}).`);

  login(loginData, Object.assign(fcaOpt, {
    updatePresence: true,
    online: fcaOpt.online !== false,
    autoReconnect: true,
    autoMarkRead: fcaOpt.autoMarkRead === true,
  }), async (err, api) => {
    if (err) {
      const text = (err && (err.error || err.message)) ? String(err.error || err.message) : String(err);
      const safeText = (fcaOpt.proxy ? text.split(fcaOpt.proxy).join('[proxy]') : text)
        .replace(/https?:\/\/[^\s/]+/gi, '[url]')
        .slice(0, 350);
      const status = err?.response?.status || err?.statusCode || '';
      console.error(`[login] Failed: ${err?.code || 'unknown'}${status ? ` HTTP ${status}` : ''} - ${safeText}`);
      // A missing userID can come from a failed/empty proxy response; it does
      // not prove the appstate has expired. Stop only for an explicit auth gate.
      const NEEDS_HUMAN = /checkpoint|login approval|two.factor|incorrect password|invalid password/i.test(text);
      if (NEEDS_HUMAN) {
        global.__sessionDead = true;
        global.pauseAutoLogin();
        console.error('[session] Manual Facebook verification required. Update appstate after completing it, then restart.');
        return;
      }
      if (err?.code === 'AUTH_REQUIRED' || /not logged in|session expired|missing credentials for auto-login/i.test(text)) {
        global.__sessionDead = true;
        await global.recoverLogin('not_logged_in');
        return;
      }

      global._loginAttempt = (global._loginAttempt || 0) + 1;
      if (global._loginAttempt > 5) {
        global._loginAttempt = 0;
        isBotRunning = false;
        return setTimeout(() => onBot(), 15 * 60000);
      }
      const wait = Math.min(60000 * global._loginAttempt, 300000);
      isBotRunning = false;
      console.warn(`[login] Retrying in ${Math.round(wait / 1000)} seconds; appstate is preserved.`);
      return setTimeout(() => { try { onBot(); } catch (e) {} }, wait);
    }
    console.log('[login] Facebook login accepted; loading bot commands and MQTT.');
    return onLoggedIn(api);
  });

  async function onLoggedIn(api) {
    global._loginAttempt = 0;
    isBotRunning = true;
    if (global.__autoLoginTimer) { clearTimeout(global.__autoLoginTimer); global.__autoLoginTimer = null; }
    try { automatic.healthy(); } catch (_) { console.error('[auto-login] Could not update recovery state.'); }
    const previousApi = global.client.api;
    if (previousApi && previousApi !== api) {
      previousApi.__stopThrottle?.();
      previousApi.__appStateStore?.stop?.();
      previousApi.__sessionGuard?.stop?.();
      listenSerial++; // ignore callbacks from the previous account socket
      try { currentListenMqtt?.stopListening?.(); } catch (error) {}
      currentListenMqtt = null;
      listener = null; // handlers capture api; rebuild them for the new login
    }
    global.__sessionDead = false;
    global.__mqttDown = false;
    global.__mqttDownSince = 0;
    global.__mqttRecoveryNoted = false;
    if (listenRetryTimer) { clearTimeout(listenRetryTimer); listenRetryTimer = null; }
    listenRetry = 0;
    if (api.ctx && !api.ctx.reqCallbacks) api.ctx.reqCallbacks = {};

    let probeRunning = false;
    let lastProbe = 0;
    let lossHandled = false;
    const sessionLost = reason => {
      if (global.client.api !== api || lossHandled) return;
      lossHandled = true;
      global.__sessionDead = true;
      global.__mqttDown = false;
      listenSerial++;
      if (listenRetryTimer) { clearTimeout(listenRetryTimer); listenRetryTimer = null; }
      require('./includes/safety/anti-logout')(api);
      try { currentListenMqtt?.stopListening?.(); } catch (_) {}
      currentListenMqtt = null;
      console.error(`[session] Confirmed ${reason}; pending actions and session writers stopped. Saved appstate preserved.`);
      if (reason === 'expired') {
        Promise.resolve(global.recoverLogin?.('not_logged_in')).then(result => {
          if (result?.status === 'disabled') console.error('[session] Log in through Facebook, update appstate locally, then restart.');
        }).catch(() => console.error('[session] Recovery failed; interactive login is required.'));
      } else global.pauseAutoLogin?.();
    };
    if (typeof api.on === 'function') {
      api.on('sessionExpired', () => sessionLost('expired'));
      api.on('checkpoint', () => sessionLost('checkpoint'));
      api.on('loginBlocked', () => sessionLost('checkpoint'));
      api.on('autoLoginFailed', async () => {
        if (lossHandled || global.client.api !== api || probeRunning || Date.now() - lastProbe < 60000) return;
        probeRunning = true;
        lastProbe = Date.now();
        try {
          const status = await facebookLogin().probe(api, fcaOpt);
          if (lossHandled || global.client.api !== api) return; // A late probe belongs to the old account session.
          if (status === 'expired') sessionLost('expired');
          else if (['challenge', 'invalid_credentials'].includes(status)) sessionLost('checkpoint');
        } catch (_) { console.warn('[auto-login] Session check unavailable; keeping saved appstate.'); }
        finally { probeRunning = false; }
      });
    }

    installThrottle(api);
    installReadCache(api);
    require("./includes/i18n").installApi(api);
    try {
      const custom = require('./custom');
      if (typeof custom === 'function') custom({ api });
    } catch (e) {}

    // The optional simulator builds a second, direct HTTP cookie session.
    // Never run it beside a proxied FCA session.
    if (!fcaOpt.proxy && global.config.onlinePresence === true) {
      const startOnlinePresence = require('./utils/online');
      startOnlinePresence();
    }
    const fbstate = api.getAppState();
    api.setOptions(fcaOpt);

    const raw = { trs: {} };
    const key = process.env.REPL_OWNER || process.env.PROCESSOR_IDENTIFIER;
    const encrypted = Boolean(key && global.config.encryptSt);
    const saver = require('./includes/safety/appstate-store').createAppStateStore(
      api, appStateFile, sessionLooksAlive,
      encrypted ? text => global.utils.encryptState(text, key) : text => text,
      encrypted ? null : text => text,
      encrypted ? text => global.utils.decryptState(text, key) : text => text
    );
    api.__appStateStore = saver;
    global.saveAppState = () => saver.save();
    global.saveAppStateSync = () => saver.saveSync();
    try { await saver.save(); }
    catch (error) { console.error('[appstate] Could not save live session:', error.message); }
    if (global.__appstateSaveTimer) clearInterval(global.__appstateSaveTimer);
    global.__appstateSaveTimer = setInterval(() => {
      if (global.client.api !== api || api.ctx?.loggedIn === false) return;
      saver.save().catch(error => console.error('[appstate] Save failed:', error.message));
    }, 15 * 60 * 1000);
    global.__appstateSaveTimer.unref?.();
    
    global.account.cookie = fbstate.map(i => i.key + "=" + i.value).join(";");
    global.client.api = api;
    global.config.version = config.version;

    // --- INTEGRATED AUTO-SAVE & SESSION API COMMANDS ---
  

    
    // ---------------------------------------------------

    (async () => {
      const commandsPath = `${global.client.mainPath}/modules/commands`;
      const listCommand = fs.readdirSync(commandsPath).filter(command => command.endsWith('.js') && !command.includes('example') && !global.config.commandDisabled.includes(command));
      boot.rule("modules");
      let _bcDone = 0;
      for (const command of listCommand) {
        boot.progress("commands", ++_bcDone, listCommand.length, command);
        try {
          const module = require(`${commandsPath}/${command}`);
          const { config } = module;
          if (!config?.name || !config?.commandCategory || !config?.hasOwnProperty('usePrefix')) continue;
          if (global.client.commands.has(config.name)) continue;

          if (module.onLoad) module.onLoad({ api: api });
          if (module.handleEvent) global.client.eventRegistered.push(config.name);
          global.client.commands.set(config.name, module);
        } catch (error) {}
      }
    })();

    (async () => {
      const events = fs.readdirSync(path.join(global.client.mainPath, 'modules/events')).filter(ev => ev.endsWith('.js') && !global.config.eventDisabled.includes(ev));
      let _beDone = 0;
      for (const ev of events) {
        boot.progress("events", ++_beDone, events.length, ev);
        try {
          const event = require(path.join(global.client.mainPath, 'modules/events', ev));
          const { config, onLoad, run } = event;
          if (!config || !config.name || !run || global.client.events.has(config.name)) continue;
          if (onLoad) await onLoad({ api: api });
          global.client.events.set(config.name, event);
        } catch (err) {}
      }
    })();
    
    const _boot = global.boot || require("./utils/boot.js");
    const _mem = Math.round(process.memoryUsage().rss / 1048576);
    _boot.ready([
      ["Commands", global.client.commands.size],
      ["Events", global.client.events.size],
      ["Listeners", global.client.eventRegistered.length],
      ["Threads known", (global.data.allThreadID || []).length],
      ["Users known", (global.data.allUserID || []).length],
      ["Prefix", global.config.PREFIX],
      ["Panel", "http://localhost:" + PORT],
      ["Memory", _mem + " MB", _mem > 400 ? _boot.colors.warn : _boot.colors.ok],
      ["Boot time", ((Date.now() - global.client.timeStart) / 1000).toFixed(1) + "s"],
    ]);
    global.utils.complete({ raw });

    console.log(`Ready! Logged in as ${global.config.BOTNAME || "bot"} (${api.getCurrentUserID()})`);

    if (fs.existsSync('./threadID.json')) {
      const data = JSON.parse(fs.readFileSync('./threadID.json', 'utf8'));
      if (data.threadID) {
        api.sendMessage(({tl: "✅ Matagumpay na nag-restart ang bot!", ilo: "✅ Nasayaat a nag-restart ti bot!", ceb: "✅ Malampusong na-restart ang bot!", hil: "✅ Madalag-on nga nag-restart ang bot!", en: "✅ Bot restarted successfully!"})[require("./includes/i18n").language(data.threadID)], data.threadID, (err) => {
          if (!err) fs.unlinkSync('./threadID.json');
        });
      }
    }      

    startListening(api);
    startWatchdog();
    startDtsgRefresh(api);
  }
}

function restartBot() {
  if (typeof global.saveAppStateSync === 'function') global.saveAppStateSync('restart');
  if (process.env.BOT_SUPERVISED === '1') {
    const bye = () => global.stopBot(1, 'restart requested');
    if (global.dbFlush) return global.dbFlush().then(bye, bye);
    return setTimeout(bye, 500);
  }
  if (currentBotProcess) {
    currentBotProcess.kill();
    currentBotProcess = null;
  }
  isBotRunning = false;
  setTimeout(() => {
    currentBotProcess = spawn(process.argv[0], [__filename], {
      detached: false,
      stdio: 'inherit',
      env: process.env
    });
    currentBotProcess.on('exit', () => { currentBotProcess = null; isBotRunning = false; });
    process.exit();
  }, 1000);
}

// Commands use the same save/flush/restart path as the hosting panel.
global.restartProcess = restartBot;

const diskusage = require('diskusage');

if (!fs.existsSync("./panel.json")) {
    fs.writeFileSync("./panel.json", JSON.stringify({
        username: "admin",
        pass: "admin123"
    }, null, 4));
}

app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true }));

const sessionParser = session({
    secret: process.env.PANEL_SECRET || require("crypto").randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, sameSite: "lax", maxAge: 24 * 60 * 60 * 1000 }
});
app.use(sessionParser);

const authMiddleware = (req, res, next) => {
    const publicPaths = ["/login", "/api/auth/login"];
    if (publicPaths.includes(req.path) || req.session.authenticated) return next();
    res.redirect("/login");
};

app.use(authMiddleware);
app.use(express.static(path.join(__dirname, "public")));

app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));

app.post("/api/auth/login", (req, res) => {
    const { username, pass } = req.body;
    try {
        const configPanel = JSON.parse(fs.readFileSync("./panel.json", "utf8"));
        if (username === configPanel.username && pass === configPanel.pass) {
            req.session.authenticated = true;
            return res.json({ success: true });
        }
        res.status(401).json({ success: false });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get("/api/auth/logout", (req, res) => {
    req.session.destroy();
    res.sendStatus(200);
});

setupAPIRoutes(app, { global, fs, path, os, diskusage, startTime, restartBot });

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/filemanagement", (req, res) => res.sendFile(path.join(__dirname, "public", "filemanager.html")));
app.get("/database", (req, res) => res.sendFile(path.join(__dirname, "public", "database.html")));
app.get("/terminal", (req, res) => res.sendFile(path.join(__dirname, "public", "terminal.html")));

const server = app.listen(PORT, () => {
    console.log(`ZACH_CORE Backend running on http://localhost:${PORT}`);
});

const wss = new WebSocket.Server({
  server,
  verifyClient: (info, done) => {
    sessionParser(info.req, {}, () => {
      const ok = !!(info.req.session && info.req.session.authenticated);
      done(ok, 401, "Unauthorized");
    });
  }
});
const clients = new Set();

const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
  originalLog(...args);
  const msg = args.join(" ");
  clients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
};

console.error = (...args) => {
  originalError(...args);
  const msg = args.join(" ");
  clients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send("ERROR: " + msg); });
};

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send("🟢 Connected to bot console");

  ws.on("message", (message) => {
    const cmd = message.toString().trim();
    if (!cmd) return;
    if (cmd === "restart") {
        ws.send("Restarting bot...");
        restartBot();
        return;
    }
    const { exec } = require("child_process");
    exec(cmd, (err, stdout, stderr) => {
      if (err) return ws.send("ERROR: " + err.message);
      if (stdout) ws.send(stdout);
      if (stderr) ws.send(stderr);
    });
  });

  ws.on("close", () => clients.delete(ws));
});

(async () => {
  try {
    try {
      await require("./includes/database/sql").init();
    } catch (e) {}
    // Older groups already exist in threadsData.json but have no onboarding
    // record. Register them as inactive before listeners start accepting events.
    const legacyThreadsFile = path.join(__dirname, "includes/database/data/threadsData.json");
    const legacyGroupIDs = new Set();
    const importedRecords = {};
    if (fs.existsSync(legacyThreadsFile)) {
      const legacyThreads = JSON.parse(fs.readFileSync(legacyThreadsFile, "utf8"));
      for (const [threadID, record] of Object.entries(legacyThreads)) {
        if (record?.threadInfo?.isGroup === true) legacyGroupIDs.add(threadID);
      }
    }
    const previousSettingsFile = path.join(__dirname, "includes/database/data/threads.json");
    if (fs.existsSync(previousSettingsFile)) {
      const previousSettings = JSON.parse(fs.readFileSync(previousSettingsFile, "utf8"));
      for (const id of Object.keys(previousSettings)) legacyGroupIDs.add(id);
    }
    if (global.db?.query) {
      try {
        const [rows] = await global.db.query("SELECT threadID, data FROM bot_threads WHERE isGroup = 1");
        for (const row of rows) {
          const id = String(row.threadID);
          legacyGroupIDs.add(id);
          try { importedRecords[id] = JSON.parse(row.data); } catch (_) {}
        }
      } catch (error) { console.error("[onboarding] Could not list stored groups:", error.message); }
    }
    const added = require("./includes/threadState").ensureGroups(legacyGroupIDs, importedRecords);
    if (added && global.db?.sync) await global.db.sync();
    global.loading.log(`Connected to JSON database successfully!`, "DATABASE");
    onBot();
  } catch (error) {
    global.loading.err(`Failed to connect to the JSON database: ` + error, "DATABASE");
  }
})();

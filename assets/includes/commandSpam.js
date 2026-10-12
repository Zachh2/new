"use strict";

// Command-only, bot-wide temporary bans. Never kicks users or changes permanent bans.
const fs = require("fs");
const path = require("path");
const DEFAULTS = Object.freeze({ limit: 5, windowMs: 5000, warningMs: 600000, banMs: 7200000, noticeMs: 5000, sendFailurePauseMs: 60000 });
const COPY = {
  en: {
    cooldown: 'This command is still on cooldown. Please wait',
    warning: "SPAM WARNING", banned: "COMMAND BAN", error: "PLEASE WAIT",
    warn: (n, s) => `You sent ${n} commands within ${s} seconds.`,
    stop: "Stop spamming. Wait at least 6 seconds and respect command cooldowns. Another spam burst within 10 minutes means a 2-hour command ban.",
    reason: "Commands are temporarily blocked because of spam.", remaining: "Time remaining", auto: "You can use commands again when this time runs out.",
    storage: "Command protection cannot read or save its data. Please tell the bot owner.",
    units: ["hour", "hours", "minute", "minutes", "second", "seconds"], and: "and"
  },
  tl: {
    cooldown: 'Hindi pa tapos ang paghihintay para sa command na ito. Maghintay muna ng',
    warning: "BABALA SA SPAM", banned: "BAWAL MUNA ANG COMMAND", error: "PAKIHINTAY",
    warn: (n, s) => `Nagpadala ka ng ${n} command sa loob ng ${s} segundo.`,
    stop: "Itigil ang spam. Maghintay ng hindi bababa sa 6 segundo at sundin ang cooldown ng command. Kapag nag-spam ulit sa loob ng 10 minuto, may 2-oras na ban.",
    reason: "Pansamantalang bawal kang gumamit ng command dahil sa spam.", remaining: "Natitirang oras", auto: "Puwede ka nang gumamit ng command kapag natapos ang oras na ito.",
    storage: "Hindi mabasa o mai-save ang datos ng proteksiyon sa spam. Ipaalam sa may-ari ng bot.",
    units: ["oras", "oras", "minuto", "minuto", "segundo", "segundo"], and: "at"
  },
  ilo: {
    cooldown: 'Saan pay a nalpas ti panawen ti panaguray para iti daytoy a command. Aguray pay iti',
    warning: "PAKAAMMO ITI SPAM", banned: "MAIPARIT PAY TI COMMAND", error: "AGURAY KA PAY",
    warn: (n, s) => `Nagipatulodka iti ${n} a command iti uneg ti ${s} a segundo.`,
    stop: "Isardeng ti spam. Aguray iti saan a bumaba iti 6 a segundo ken tungpalen ti cooldown ti command. No ag-spam manen iti uneg ti 10 a minuto, maiparit ti command iti 2 nga oras.",
    reason: "Temporario a maiparit kenka ti agusar iti command gapu iti spam.", remaining: "Nabati a panawen", auto: "Mabalinmo manen nga agusar iti command no malpas daytoy a panawen.",
    storage: "Saan a mabasa wenno maidulin ti datos ti proteksion iti spam. Ibagam iti makin-akin iti bot.",
    units: ["nga oras", "nga oras", "a minuto", "a minuto", "a segundo", "a segundo"], and: "ken"
  },
  ceb: {
    cooldown: 'Wala pa mahuman ang paghulat para niining command. Paghulat pa og',
    warning: "PASIDAAN SA SPAM", banned: "DILI PA MAKAGAMIT OG COMMAND", error: "PALIHOG HULAT",
    warn: (n, s) => `Nagpadala ka og ${n} ka command sulod sa ${s} ka segundo.`,
    stop: "Hunong sa spam. Paghulat og labing menos 6 ka segundo ug sunda ang cooldown sa command. Kung mag-spam pag-usab sulod sa 10 ka minuto, adunay 2 ka oras nga pagdili.",
    reason: "Temporaryo kang dili makagamit og command tungod sa spam.", remaining: "Nahibiling oras", auto: "Makagamit ka pag-usab og command inigkahuman niining orasa.",
    storage: "Dili mabasa o matipigan ang datos sa proteksiyon batok sa spam. Pahibaloa ang tag-iya sa bot.",
    units: ["ka oras", "ka oras", "ka minuto", "ka minuto", "ka segundo", "ka segundo"], and: "ug"
  },
  hil: {
    cooldown: 'Wala pa matapos ang paghulat para sa sini nga command. Maghulat pa sang',
    warning: "PAANDAM SA SPAM", banned: "INDI PA MAKAGAMIT SANG COMMAND", error: "PALIHOG HULAT",
    warn: (n, s) => `Nagpadala ka sang ${n} ka command sa sulod sang ${s} ka segundo.`,
    stop: "Untati ang spam. Maghulat sang indi magnubo sa 6 ka segundo kag sundon ang cooldown sang command. Kon mag-spam liwat sa sulod sang 10 ka minuto, may 2 ka oras nga pagdili.",
    reason: "Temporaryo ka nga indi makagamit sang command bangod sa spam.", remaining: "Nabilin nga oras", auto: "Makagamit ka liwat sang command kon matapos ini nga tion.",
    storage: "Indi mabasa ukon matipigan ang datos sang proteksiyon batok sa spam. Ipahibalo sa tag-iya sang bot.",
    units: ["ka oras", "ka oras", "ka minuto", "ka minuto", "ka segundo", "ka segundo"], and: "kag"
  }
};

function locale(lang) {
  const aliases = { tagalog: "tl", filipino: "tl", english: "en", ilocano: "ilo", iloko: "ilo", cebuano: "ceb", bisaya: "ceb", hiligaynon: "hil", ilonggo: "hil" };
  return COPY[lang] || COPY[aliases[String(lang).toLowerCase()]] || COPY.en;
}
function duration(ms, lang) {
  const c = locale(lang);
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  const unit = (n, i) => `${n} ${c.units[i + (n === 1 ? 0 : 1)]}`;
  if (seconds < 60) return unit(seconds, 4);
  // Round up: do not tell users their ban ended while seconds remain.
  const minutes = Math.ceil(seconds / 60), hours = Math.floor(minutes / 60), rest = minutes % 60;
  return [hours && unit(hours, 0), rest && unit(rest, 2)].filter(Boolean).join(` ${c.and} `);
}
function render(result, lang) {
  const c = locale(lang);
  const title = result.kind === "warning" ? c.warning + " ⚠️" : result.kind === "storage" ? c.error + " ⚠️" : c.banned + " 🔒";
  const lines = result.kind === "warning" ? [result.cooldownMs ? `${c.cooldown} ${duration(result.cooldownMs, lang)}.` : c.warn(DEFAULTS.limit, DEFAULTS.windowMs / 1000), c.stop]
    : result.kind === "storage" ? [c.storage]
    : [c.reason, `${c.remaining}: ${duration(result.remainingMs, lang)}`, c.auto];
  return `╭┈ ❒ [ ${title} ]\n${lines.map(line => `├ ${line}`).join("\n")}\n╰┈━━━━━━━━━━━━`;
}

function isCommand(event, client, config) {
  if (!event || !["message", "message_reply"].includes(event.type) || typeof event.body !== "string") return false;
  // These replies are report conversations, even if the text starts with '-'.
  if (event.type === "message_reply" && client?.handleReply?.some(r => r.name === "callad" && String(r.messageID) === String(event.messageReply?.messageID))) return false;
  const word = event.body.trim().split(/\s+/)[0].toLowerCase();
  if (!word) return false;
  const prefix = typeof config?.PREFIX === "string" && config.PREFIX ? config.PREFIX : "-";
  if (word.startsWith(prefix.toLowerCase())) {
    const name = word.slice(prefix.length);
    return !name || /^[a-z0-9]/i.test(name);
  }
  return client?.commands?.get(word)?.config?.usePrefix === false;
}

// Mirrors the current CHIA handleCommand cooldown Map and default of one second.
function activeCooldown(event, client, config, now) {
  const prefix = typeof config?.PREFIX === "string" && config.PREFIX ? config.PREFIX : "-";
  const word = event.body.trim().split(/\s+/)[0].toLowerCase();
  const name = word.startsWith(prefix.toLowerCase()) ? word.slice(prefix.length) : word;
  const command = client?.commands?.get(name);
  if (!command?.config) return 0;
  const timestamps = client.cooldowns?.get?.(command.config.name);
  const last = timestamps?.get?.(String(event.senderID));
  if (!Number.isFinite(last)) return 0;
  const seconds = Number(command.config.cooldowns || 1);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.max(0, last + seconds * 1000 - now);
}

function createGuard({ file = path.join(__dirname, "database/data/commandSpam.json"), now = Date.now, log = console.error } = {}) {
  let state = null;
  const recent = new Map(), seen = new Map(), notices = new Map();
  let noticesPausedUntil = 0;
  let lastSweep = 0, lastError = -Infinity;
  function load() {
    if (state) return;
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { if (e.code === "ENOENT") parsed = { version: 1, users: {} }; else throw e; }
    if (parsed.version !== 1 || !parsed.users || typeof parsed.users !== "object" || Array.isArray(parsed.users)) throw new Error("Invalid anti-spam data format");
    for (const [id, r] of Object.entries(parsed.users)) {
      if (!/^\d+$/.test(id) || !r || !Number.isSafeInteger(r.warnedUntil) || !Number.isSafeInteger(r.bannedUntil) || r.warnedUntil < 0 || r.bannedUntil < 0) throw new Error("Invalid anti-spam user record");
    }
    state = parsed;
  }
  function save() {
    const t = now();
    const users = Object.fromEntries(Object.entries(state.users).filter(([, r]) => r.bannedUntil > t || r.warnedUntil > t));
    const next = { version: 1, users };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
      fs.renameSync(tmp, file);
      state = next;
    } finally { try { fs.unlinkSync(tmp); } catch (e) { if (e.code !== "ENOENT") throw e; } }
  }
  function check(event, client = global.client, config = global.config, ownID) {
    if (!isCommand(event, client, config) || String(event.senderID) === String(ownID)) return { blocked: false };
    const id = String(event.senderID), time = now();
    if (!/^\d+$/.test(id)) return { blocked: false };
    try {
      load();
      if (time - lastSweep > 60000) {
        for (const [key, value] of recent) if (!value.some(t => t >= time - DEFAULTS.windowMs)) recent.delete(key);
        for (const [key, value] of notices) if (value.at <= time - 60000) notices.delete(key);
        for (const [key, value] of seen) if (value <= time - 300000) seen.delete(key);
        lastSweep = time;
      }
      const key = event.messageID ? `${event.threadID}:${event.messageID}` : null;
      if (key && seen.has(key)) return { blocked: true, kind: "duplicate" };
      const markSeen = () => {
        if (!key) return;
        seen.set(key, time);
        if (seen.size > 10000) seen.delete(seen.keys().next().value);
      };
      let record = state.users[id];
      if (record?.bannedUntil > time) {
        markSeen();
        return { blocked: true, kind: "banned", remainingMs: record.bannedUntil - time, bannedUntil: record.bannedUntil };
      }
      if (record && record.bannedUntil > 0) {
        delete state.users[id];
        recent.delete(id);
        save();
        record = undefined;
      }
      const times = (recent.get(id) || []).filter(t => t >= time - DEFAULTS.windowMs);
      times.push(time);
      recent.set(id, times.slice(-DEFAULTS.limit));
      if (recent.size > 10000) recent.delete(recent.keys().next().value);
      // Count all attempts, including cooldown retries, but never punish one retry alone.
      if (times.length < DEFAULTS.limit) { markSeen(); return { blocked: false }; }
      if (record?.warnedUntil > time) {
        const bannedUntil = time + DEFAULTS.banMs;
        state.users[id] = { warnedUntil: 0, bannedUntil };
        save();
        recent.delete(id);
        markSeen();
        return { blocked: true, kind: "banned", remainingMs: DEFAULTS.banMs, bannedUntil, newBan: true };
      }
      state.users[id] = { warnedUntil: time + DEFAULTS.warningMs, bannedUntil: 0 };
      save();
      markSeen();
      return { blocked: true, kind: "warning" };
    } catch (e) {
      // Preserve the file on read/write errors. Block execution until storage recovers.
      state = null;
      if (time - lastError >= 60000) { log("[command-spam] Storage unavailable; commands paused:", e.code || e.name); lastError = time; }
      return { blocked: true, kind: "storage" };
    }
  }
  async function gate(api, event) {
    let ownID;
    try { ownID = api.getCurrentUserID?.(); } catch (_) { /* optional FCA helper */ }
    const result = check(event, global.client, global.config, ownID);
    if (!result.blocked) return false;
    if (result.kind === "duplicate") return true;
    // Suppress repeated notices, never the ban itself. Warning -> ban is sent immediately.
    const user = String(event.senderID), time = now(), previous = notices.get(user);
    if (time < noticesPausedUntil) return true;
    if (!result.newBan && previous?.kind === result.kind && time - previous.at < DEFAULTS.noticeMs) return true;
    notices.set(user, { kind: result.kind, at: time });
    if (notices.size > 10000) notices.delete(notices.keys().next().value);
    let lang = global.config?.language || "en";
    try { lang = require("./i18n").language(event.threadID); } catch (_) { /* optional i18n */ }
    // Recalculate after the decision, so each attempt gets the current remaining time.
    if (result.bannedUntil) result.remainingMs = Math.max(1, result.bannedUntil - now());
    await new Promise(resolve => {
      let settled = false;
      const done = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          // No automatic retries. Back off all anti-spam notices after a failed send.
          noticesPausedUntil = now() + DEFAULTS.sendFailurePauseMs;
          log("[command-spam] Notice send failed; notices paused for 60 seconds. Bans remain active.");
        }
        resolve();
      };
      const timer = setTimeout(() => done(new Error("Notice timed out")), 10000);
      try {
        const sent = api.sendMessage(render(result, lang), event.threadID, done, event.messageID);
        if (sent && typeof sent.then === "function") sent.then(() => done(), done);
      } catch (error) { done(error); }
    });
    return true;
  }
  return { check, gate };
}
let singleton;
module.exports = {
  version: 4,
  gate: (api, event) => {
    if (!singleton) {
      singleton = createGuard();
      console.log("[command-spam] v4 active: 5 commands / 5 seconds -> warning; continued spam -> 2-hour ban; saved expiry survives restarts.");
    }
    return singleton.gate(api, event);
  },
  createGuard, isCommand, activeCooldown, duration, render, DEFAULTS
};

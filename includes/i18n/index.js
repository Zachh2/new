/**
 * Language layer.
 *
 * Every message a command sends passes through here on its way to Messenger.
 * If the group picked Tagalog, the text is translated; if it picked English,
 * English goes out as-is (and any leftover Vietnamese from the original Mirai
 * command pack is translated to English).
 *
 * Doing it here instead of rewriting 80+ command files means every command is
 * covered, including ones you add later.
 *
 * What is NEVER translated:
 *   - command names ("-help", "-balance"), URLs, @mentions, numbers
 *   - the box drawing on the left of each line (╭┈ ❒ ├ ╰┈➤ │)
 *   - text inside [ BRACKETS ] titles and `backticks`
 *   - messages from commands in config.json -> i18n.skip (e.g. ai, carbon)
 *
 * Hand-written Tagalog for the common system lines is used first; everything
 * else goes through Google's free translate endpoint, cached, with a short
 * timeout - if translation is slow or down, the original is sent instead of
 * nothing.
 */
const axios = require("axios");

// ---------------------------------------------------------------------------
// hand translations for lines the bot sends constantly
// ---------------------------------------------------------------------------
const PHRASES_TL = {
  "Executing...": "Isinasagawa...",
  "please wait": "sandali lang",
  "Downloading...": "Dina-download...",
  "Searching...": "Hinahanap...",
  "Working...": "Ginagawa...",
  "Loading...": "Nilo-load...",
  "Processing...": "Pinoproseso...",
  "Done": "Tapos na",
  "Success": "Tagumpay",
  "Failed": "Bigo",
  "try again": "subukan ulit",
  "Try again": "Subukan ulit",
  "go ahead": "sige na",
  "Not enough money": "Kulang ang pera",
  "You don't have permission to use this command": "Wala kang pahintulot gamitin ang command na ito",
  "Only bot admin can use bot": "Bot admin lang ang puwedeng gumamit ng bot",
  "Type to see everything I can do": "I-type para makita lahat ng kaya ko"
};

function cfg() {
  return (global.config && global.config.i18n) || {};
}

// ---------------------------------------------------------------------------
// what must survive translation untouched
// ---------------------------------------------------------------------------
// box drawing only - "-" is NOT in here, or a line starting with "-balance"
// would lose its command name to the prefix strip
const BOX_PREFIX = /^([\s│├╭╰┈➤❒━─┃┣┗┏•·»\u2500-\u257F]*\s*)/;

function protectedPattern() {
  const prefix = String((global.config && global.config.PREFIX) || "-").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // urls, prefixed commands, @mentions, [ TITLES ], `code`, numbers with units,
  // emoji clusters, and IDs
  return new RegExp(
    [
      "https?:\\/\\/\\S+",
      prefix + "[\\w-]+",
      "@[\\w.\\-\\u00C0-\\u024F]+(?:\\s[\\w\\u00C0-\\u024F]+)?",
      "\\[[^\\]]{1,40}\\]",
      "`[^`]*`",
      "\\b\\d[\\d,.:%/]*\\w*\\b",
      "[\\p{Extended_Pictographic}\\u200d\\ufe0f]+"
    ].join("|"),
    "gu"
  );
}

/** Split a line into pieces, marking which ones may be translated. */
function segments(line) {
  const out = [];
  const re = protectedPattern();
  let last = 0, m;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), tr: true });
    out.push({ text: m[0], tr: false });
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < line.length) out.push({ text: line.slice(last), tr: true });
  return out;
}

// ---------------------------------------------------------------------------
// the translator
// ---------------------------------------------------------------------------
const cache = new Map();
const MAX_CACHE = 3000;

const VIETNAMESE = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

async function machine(texts, target) {
  // one request for all the pieces of a message, one per line
  const joined = texts.join("\n");
  const key = target + "|" + joined;
  if (cache.has(key)) return cache.get(key);

  const timeout = Number(cfg().timeoutMs) || 4000;
  const res = await axios.get("https://translate.googleapis.com/translate_a/single", {
    params: { client: "gtx", sl: "auto", tl: target, dt: "t", q: joined },
    timeout
  });

  // [[["translated", "original", ...], ...], ...]
  const out = (res.data && res.data[0] || []).map(part => part && part[0] || "").join("");
  const lines = out.split("\n");
  const result = lines.length === texts.length ? lines : null;

  if (result) {
    cache.set(key, result);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  }
  return result;
}

/**
 * Translate one message to "tl" or "en". Always resolves; on any failure it
 * resolves with the original text.
 */
async function translateText(text, target) {
  if (!text || typeof text !== "string") return text;
  if (target !== "tl" && target !== "en") return text;

  // English groups: only translate if there's Vietnamese in it
  if (target === "en" && !VIETNAMESE.test(text)) return text;

  // don't touch anything that's mostly code or a single link
  if (/^\s*https?:\/\/\S+\s*$/.test(text)) return text;
  if ((text.match(/[{};=<>]/g) || []).length > text.length / 12) return text;

  const lines = text.split("\n");
  const plan = [];       // per line: { lead, segs }
  const todo = [];       // translatable pieces, in order

  for (const line of lines) {
    const lead = (line.match(BOX_PREFIX) || ["", ""])[1];
    const body = line.slice(lead.length);

    // hand translation for a whole known line
    const known = target === "tl" ? PHRASES_TL[body.trim()] : null;
    if (known) {
      plan.push({ lead, fixed: known });
      continue;
    }

    const segs = segments(body);
    for (const s of segs) {
      // skip pieces with nothing worth translating
      if (s.tr && /[A-Za-z\u00C0-\u024F]{2,}/.test(s.text)) {
        s.slot = todo.length;
        // keep outer spaces as-is; translate the core
        const lead2 = s.text.match(/^\s*/)[0], tail = s.text.match(/\s*$/)[0];
        s.pad = [lead2, tail];
        todo.push(s.text.trim());
      }
    }
    plan.push({ lead, segs });
  }

  if (!todo.length) {
    return plan.map(p => p.lead + (p.fixed != null ? p.fixed : p.segs.map(s => s.text).join(""))).join("\n");
  }

  let translated;
  try {
    translated = await machine(todo, target);
  } catch (e) {
    return text;                       // slow or down -> send the original
  }
  if (!translated) return text;

  return plan.map(p => {
    if (p.fixed != null) return p.lead + p.fixed;
    return p.lead + p.segs.map(s =>
      s.slot === undefined ? s.text : s.pad[0] + (translated[s.slot] || s.text.trim()) + s.pad[1]
    ).join("");
  }).join("\n");
}

// ---------------------------------------------------------------------------
// wrap an api so every text it sends is translated
// ---------------------------------------------------------------------------
function shouldSkip(commandName) {
  const skip = cfg().skip || ["ai", "carbon", "npm", "eval", "shell"];
  return commandName && skip.map(s => String(s).toLowerCase()).includes(String(commandName).toLowerCase());
}

function wrap(api, language, commandName) {
  if (!api || cfg().enabled === false) return api;
  if (language !== "tl" && language !== "en") return api;
  if (shouldSkip(commandName)) return api;

  const proxy = Object.create(api);

  proxy.sendMessage = function (msg, threadID, ...rest) {
    const go = (m) => api.sendMessage(m, threadID, ...rest);

    if (typeof msg === "string") {
      return translateText(msg, language).then(go, () => go(msg));
    }
    if (msg && typeof msg === "object" && typeof msg.body === "string" && msg.body) {
      return translateText(msg.body, language).then(
        (body) => go(Object.assign({}, msg, { body })),
        () => go(msg)
      );
    }
    return go(msg);
  };

  proxy.editMessage = function (text, messageID, ...rest) {
    if (typeof text !== "string") return api.editMessage(text, messageID, ...rest);
    return translateText(text, language).then(
      (t) => api.editMessage(t, messageID, ...rest),
      () => api.editMessage(text, messageID, ...rest)
    );
  };

  return proxy;
}

/** The language a thread picked at "start bot"; English if none. */
async function threadLanguage(Threads, threadID, senderID) {
  try {
    // per-user override: -lang me tl
    const users = (global.data && global.data.userLang) || null;
    if (users && senderID && users.has(String(senderID))) return users.get(String(senderID));

    const data = await Threads.getData(threadID);
    const a = data && data.data && data.data.activation;
    if (a && (a.language === "tl" || a.language === "en")) return a.language;
  } catch (e) {}
  return cfg().defaultLanguage || "en";
}

module.exports = { translateText, wrap, threadLanguage, shouldSkip };

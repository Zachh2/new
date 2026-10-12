/**
 * Per-thread activation.
 *
 * A group must run "start bot" (no prefix) before any command works. The flow:
 *
 *   1. group is not started  -> commands reply "not started, say start bot"
 *   2. someone says "start bot" -> ask which language (Tagalog / English)
 *   3. someone replies tl / en  -> "bot is started, you can use commands now"
 *   4. from then on, commands run normally
 *
 * The state (started + language) is saved in threadsData.json under
 * data.activation, so it survives restarts. The whole thing can be turned off
 * in config.json -> activation.enabled:false, and DMs / admins are exempt so
 * you can never lock yourself out.
 */

const STAGE = { OFF: 0, PICKING: 1, ON: 2 };

// which threads are mid-"pick a language", in memory only (transient)
const picking = new Map();   // threadID -> timestamp

function cfg() {
  return (global.config && global.config.activation) || {};
}

function isEnabled() {
  return cfg().enabled !== false;
}

const START_WORDS = ["start bot", "startbot", "start", "activate bot", "simula bot"];
const TL_WORDS = ["tl", "tagalog", "tag", "1", "filipino", "fil"];
const EN_WORDS = ["en", "english", "eng", "2"];

function normalise(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Read a thread's saved activation state. */
async function getState(Threads, threadID) {
  try {
    const data = await Threads.getData(threadID);
    const a = data && data.data && data.data.activation;
    if (a && a.started) return { stage: STAGE.ON, language: a.language || "en" };
  } catch (e) {}
  if (picking.has(threadID)) return { stage: STAGE.PICKING, language: null };
  return { stage: STAGE.OFF, language: null };
}

/** Persist started + language into threadsData.json. */
async function save(Threads, threadID, language) {
  try {
    const data = await Threads.getData(threadID);
    const prev = (data && data.data) || {};
    await Threads.setData(threadID, {
      data: { ...prev, activation: { started: true, language, startedAt: Date.now() } }
    });
    return true;
  } catch (e) {
    console.log("[activation] could not save state for " + threadID + ": " + (e && e.message));
    return false;
  }
}

const TXT = {
  notStarted: {
    en: "🔒 The bot isn't started in this chat yet.\nType  start bot  (no prefix) to begin.",
    tl: "🔒 Hindi pa naka-start ang bot sa chat na ito.\nI-type ang  start bot  (walang prefix) para magsimula."
  },
  pickLang: [
    "╭┈ ❒ [ START BOT ✅ ]",
    "├ Choose a language / Pumili ng wika:",
    "├ ",
    "├  ①  Tagalog   — reply  tl",
    "├  ②  English   — reply  en",
    "╰┈➤ reply with tl or en"
  ].join("\n"),
  started: {
    en: (prefix) => [
      "╭┈ ❒ [ BOT STARTED ✅ ]",
      "├ Bot is started — you can use commands now.",
      `├ Type ${prefix}help to see everything.`,
      "╰┈➤ have fun"
    ].join("\n"),
    tl: (prefix) => [
      "╭┈ ❒ [ BOT STARTED ✅ ]",
      "├ Naka-start na ang bot — puwede mo nang gamitin ang mga command.",
      `├ I-type ang ${prefix}help para makita lahat.`,
      "╰┈➤ enjoy"
    ].join("\n")
  },
  pickAgain: "Please reply  tl  (Tagalog) or  en  (English)."
};

/**
 * Called at the very top of the command handler.
 * Returns:
 *   { handled: true }  -> the gate answered; stop, don't run a command
 *   { handled: false, language } -> let the command run
 */
async function gate({ api, event, Threads, senderID, threadID, isAdmin }) {
  if (!isEnabled()) return { handled: false, language: "en" };

  // DMs are never gated, so you always have a way back in even if a group
  // locks you out.
  if (String(senderID) === String(threadID)) return { handled: false, language: "en" };

  // Admins skip the gate by default. Set activation.includeAdmins:true in
  // config.json if you want every group - yours included - to run "start bot".
  if (isAdmin && cfg().includeAdmins !== true) {
    const st = await getState(Threads, threadID);
    return { handled: false, language: st.language || "en" };
  }

  const text = normalise(event.body);
  const state = await getState(Threads, threadID);
  const prefix = global.config.PREFIX;

  // ---- already on: let commands through ----
  if (state.stage === STAGE.ON) {
    return { handled: false, language: state.language };
  }

  // ---- waiting for a language pick ----
  if (state.stage === STAGE.PICKING) {
    if (TL_WORDS.includes(text) || EN_WORDS.includes(text)) {
      const language = TL_WORDS.includes(text) ? "tl" : "en";
      picking.delete(threadID);
      await save(Threads, threadID, language);
      api.sendMessage(TXT.started[language](prefix), threadID, () => {}, event.messageID);
      return { handled: true };
    }
    // a stray message while picking - remind once, quietly
    if (START_WORDS.includes(text)) {
      api.sendMessage(TXT.pickLang, threadID, () => {}, event.messageID);
      return { handled: true };
    }
    // anything that looks like a command attempt gets the reminder
    if (text.startsWith(prefix)) {
      api.sendMessage(TXT.pickAgain, threadID, () => {}, event.messageID);
    }
    return { handled: true };
  }

  // ---- off: only "start bot" does anything ----
  if (START_WORDS.includes(text)) {
    picking.set(threadID, Date.now());
    if (picking.size > 500) picking.delete(picking.keys().next().value);
    api.sendMessage(TXT.pickLang, threadID, () => {}, event.messageID);
    return { handled: true };
  }

  // a command attempt in an unstarted group -> tell them to start it
  if (text.startsWith(prefix)) {
    const en = TXT.notStarted.en + "\n\n" + TXT.notStarted.tl;
    api.sendMessage(en, threadID, () => {}, event.messageID);
    return { handled: true };
  }

  // ordinary chatter in an unstarted group -> ignore
  return { handled: true };
}

/** Called by joinNoti / the pending approval so a fresh group is prompted. */
function greetOnJoin(api, threadID) {
  if (!isEnabled()) return;
  const prefix = global.config.PREFIX;
  api.sendMessage(
    "👋 Hi! To use me here, someone needs to type  start bot  (no prefix).\n" +
    "Para magamit ako rito, mag-type ng  start bot  (walang prefix).",
    threadID,
    () => {}
  );
}

/**
 * Does this plain message (no prefix) need the gate?
 * "start bot" always; "tl"/"en" only while that thread is picking.
 * Everything else is ordinary chat and is left alone.
 */
function isTrigger(body, threadID) {
  if (!isEnabled()) return false;
  const text = normalise(body);
  if (!text) return false;
  if (START_WORDS.includes(text)) return true;
  if (picking.has(threadID) && (TL_WORDS.includes(text) || EN_WORDS.includes(text))) return true;
  return false;
}

module.exports = { gate, greetOnJoin, getState, isTrigger, STAGE };

const __l = require("../../includes/i18n");
const axios = require("axios");

module.exports.config = {
  name: "ai",
  version: "3.0.0",
  hasPermssion: 0,
  credits: "Zycke",
  description: "Local conversation and group assistant controls",
  usePrefix: true,
  commandCategory: "AI",
  usages: "<question>   ·   reply to the answer to keep the conversation going",
  cooldowns: 5,
  dependencies: { axios: "" }
};

// ===========================================================================
// OPTIONAL LEGACY PROVIDERS — LOCAL MODE IS THE DEFAULT
//
// The old version called one free relay (doux.gleeze.com). Free AI relays go
// down, move, or start refusing traffic constantly, and when that one was down
// the command just answered "❌" and looked broken.
//
// Only smartGroups.ai.mode="remote" enables the legacy provider bridge. It remembers
// which one worked so the next question goes there first. Extra endpoints can
// be added in config.json -> "ai".endpoints without touching this file.
// ===========================================================================

const TIMEOUT = 25000;
const MAX_LEN = 1900;
const MAX_CHUNKS = 3;

let preferred = null;          // provider that answered last
const chats = new Map();       // messageID -> conversation history

function pickText(data, depth = 0) {
  if (!data || depth > 3) return null;
  if (typeof data === "string") return data.trim() || null;
  // OpenAI-shaped: { choices: [ { message: { content } } ] }
  if (Array.isArray(data.choices) && data.choices.length) {
    const c = data.choices[0];
    const text = (c.message && c.message.content) || c.text;
    if (typeof text === "string" && text.trim()) return text.trim();
  }
  const fields = ["gpt", "answer", "response", "result", "message", "content", "text", "reply", "data"];
  for (const f of fields) {
    const v = data[f];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object") {
      const nested = pickText(v, depth + 1);
      if (nested) return nested;
    }
  }
  return null;
}

function gptiModule() {
  try { return require("gpti"); } catch (e) { return null; }
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label + " timeout")), ms);
  })]).finally(() => clearTimeout(timer));
}

/** Each provider takes (prompt, history) and returns text, or throws. */
function buildProviders(options = {}) {
  const providerTimeout = Math.max(1000, Math.min(TIMEOUT, options.timeout || TIMEOUT));
  const list = [];
  const cfg = global.config.ai || {};

  // ---- ceddsrestapi first, when it's configured -------------------------
  // The path lives in config.json -> cedds.ai so a change to the API is a
  // config edit. {prompt} is replaced with the question.
  const cedds = (global.config.cedds || {});
  if (cedds.ai !== false) {
    const base = String(cedds.base || "https://ceddsrestapi.vercel.app").replace(/\/+$/, "");
    const path = cedds.ai || "/ai/chatplus?message={prompt}&model={model}";
    const model = cedds.aiModel || "gpt-4o-mini";
    list.push({
      name: "cedds",
      run: async (prompt, history) => {
        // the endpoint takes one message, so fold the last couple of turns in
        const withContext = history && history.length
          ? history.slice(-4).map(m => `${m.role}: ${m.content}`).join("\n") + "\nuser: " + prompt
          : prompt;
        const url = (base + (path.startsWith("/") ? path : "/" + path))
          .replace("{prompt}", encodeURIComponent(withContext))
          .replace("{model}", encodeURIComponent(model));
        const res = await axios.get(url, { timeout: providerTimeout });
        return pickText(res.data);
      }
    });
  }

  // ---- Pollinations: free, no signup, no API key -------------------------
  // Two ways in: the OpenAI-compatible POST (keeps conversation history) and
  // a plain GET that returns the answer as raw text. If the first is busy the
  // second usually still answers.
  if (cfg.pollinations !== false) {
    const model = cfg.pollinationsModel || "openai";

    list.push({
      name: "pollinations",
      run: async (prompt, history) => {
        const res = await axios.post("https://text.pollinations.ai/openai", {
          model,
          messages: [...history, { role: "user", content: prompt }]
        }, { timeout: providerTimeout, headers: { "Content-Type": "application/json" } });
        return pickText(res.data);
      }
    });

    list.push({
      name: "pollinations-text",
      run: async (prompt) => {
        const res = await axios.get(
          "https://text.pollinations.ai/" + encodeURIComponent(prompt),
          { timeout: providerTimeout, params: { model } }
        );
        return typeof res.data === "string" ? res.data.trim() : pickText(res.data);
      }
    });
  }

  const gpti = gptiModule();

  if (gpti && gpti.gpt && typeof gpti.gpt.v1 === "function") {
    list.push({
      name: "gpt-4",
      run: async (prompt, history) => pickText(
        await withTimeout(gpti.gpt.v1({ messages: history, prompt, model: "gpt-4", markdown: false }), providerTimeout, "gpt-4")
      )
    });
  }
  if (gpti && typeof gpti.llama === "function") {
    list.push({
      name: "llama-3.1",
      run: async (prompt, history) => pickText(
        await withTimeout(gpti.llama({ messages: [...history, { role: "user", content: prompt }], markdown: false, stream: false }), providerTimeout, "llama")
      )
    });
  }
  if (gpti && typeof gpti.blackbox === "function") {
    list.push({
      name: "blackbox",
      run: async (prompt, history) => pickText(
        await withTimeout(gpti.blackbox({ messages: [...history, { role: "user", content: prompt }], markdown: false, stream: false }), providerTimeout, "blackbox")
      )
    });
  }

  // plain HTTP endpoints from config.json -> ai.endpoints
  // put {prompt} where the question goes
  const extra = (global.config.ai && global.config.ai.endpoints) || [];
  for (const url of extra) {
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) continue;
    list.push({
      name: url.replace(/^https?:\/\//, "").split("/")[0],
      run: async (prompt) => {
        const res = await axios.get(url.replace("{prompt}", encodeURIComponent(prompt)), { timeout: providerTimeout });
        return pickText(res.data);
      }
    });
  }

  if (preferred) {
    const i = list.findIndex(p => p.name === preferred);
    if (i > 0) list.unshift(list.splice(i, 1)[0]);
  }
  return list;
}

async function ask(prompt, history = []) {
  const providers = buildProviders();
  if (!providers.length) {
    return { error: __l.t("m57") };
  }

  const tried = [];
  for (const provider of providers) {
    try {
      const answer = await provider.run(prompt, history);
      if (answer && answer.length > 1) {
        preferred = provider.name;
        return { answer, provider: provider.name };
      }
      tried.push(provider.name + " (empty)");
    } catch (e) {
      tried.push(provider.name + " (" + ((e && (e.message || e.error)) || "failed") + ")");
    }
  }
  return { error: __l.t("m58"), tried };
}

function chunk(text) {
  const parts = [];
  let rest = String(text);
  while (rest.length > MAX_LEN && parts.length < MAX_CHUNKS - 1) {
    let cut = rest.lastIndexOf("\n", MAX_LEN);
    if (cut < MAX_LEN * 0.5) cut = rest.lastIndexOf(". ", MAX_LEN);
    if (cut < MAX_LEN * 0.5) cut = MAX_LEN;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  parts.push(rest.length > MAX_LEN ? rest.slice(0, MAX_LEN) + "…" : rest);
  return parts;
}

function box(body, footer) {
  return `╭┈ ❒ [ AI 🤖 ]\n${body}\n╰┈➤ ${footer}`;
}

async function answerQuestion(api, event, question, history) {
  const { threadID, messageID, senderID } = event;
  const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };

  react("⏳");
  const started = Date.now();
  const shared = require("../../includes/smartGroups/ai");
  const state = require("../../includes/threadState").get(threadID);
  const answer = await shared.ask({question, history, language: __l.language(threadID), personality: state.smartGroups?.personality || 'chill'});
  const result = {answer, provider: shared.remoteEnabled() ? 'assistant' : 'local'};

  if (result.error) {
    react("❌");
    const lines = [`├ ${result.error}`];
    if (result.tried) lines.push(__l.t("m60", [result.tried.join(", ")]));
    return api.sendMessage(
      box(lines.join("\n"), __l.t("m61")),
      threadID, () => {}, messageID
    );
  }

  react("✅");
  const took = ((Date.now() - started) / 1000).toFixed(1);
  const parts = chunk(result.answer);

  parts.forEach((part, i) => {
    const last = i === parts.length - 1;
    const text = last ? box(part, __l.t("m62", [result.provider, took])) : part;

    api.sendMessage(text, threadID, (err, info) => {
      if (err || !info || !last) return;
      const newHistory = [
        ...history,
        { role: "user", content: question },
        { role: "assistant", content: result.answer }
      ].slice(-8);
      chats.set(info.messageID, newHistory);
      if (!global.client.handleReply) global.client.handleReply = [];
      if (chats.size > 200) chats.delete(chats.keys().next().value);
      global.client.handleReply.push({
        name: module.exports.config.name,
        messageID: info.messageID,
        author: senderID,
        threadID: String(threadID),
        expiresAt: Date.now() + 60 * 60 * 1000
      });
    }, i === 0 ? messageID : undefined);
  });
}

/** Reply-to-an-image support, kept from the old version. */
async function describeImage(url, question) {
  const endpoint = (global.config.ai && global.config.ai.imageEndpoint) ||
    "https://doux.gleeze.com/ai/chipp?message={prompt}&url={url}";
  const res = await axios.get(
    endpoint.replace("{prompt}", encodeURIComponent(question || "what is this?")).replace("{url}", encodeURIComponent(url)),
    { timeout: TIMEOUT }
  );
  return pickText(res.data);
}

/** -ai status : try every provider with a tiny prompt and report back. */
async function providerStatus() {
  const lines = [];
  for (const provider of buildProviders()) {
    const started = Date.now();
    try {
      const out = await provider.run("Reply with the single word OK", []);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      lines.push(out && out.length > 1
        ? `├ ✅ ${provider.name} — ${secs}s`
        : __l.t("m66", [provider.name]));
    } catch (e) {
      const why = (e && (e.message || e.error)) || "failed";
      lines.push(`├ ❌ ${provider.name} — ${String(why).slice(0, 40)}`);
    }
  }
  return lines.length ? lines : [__l.t("m67")];
}

module.exports.run = async function ({ api, event, args }) {
  const question = args.join(" ").trim();
  if (/^(on|off|reset|status)$/i.test(question)) {
    return require("../../includes/smartGroups").run("assistant", { api, event, args: [question.toLowerCase()] });
  }

  const attachment = event.messageReply && event.messageReply.attachments && event.messageReply.attachments[0];

  // asking about a photo you replied to
  if (attachment && attachment.url && require("../../includes/smartGroups/ai").remoteEnabled()) {
    const react = (e) => { try { api.setMessageReaction(e, event.messageID, () => {}, true); } catch (err) {} };
    react("⏳");
    try {
      const described = await describeImage(attachment.url, require("../../includes/i18n").prompt(question || "Describe this image", event.threadID));
      if (!described) throw new Error(__l.t("m69"));
      react("✅");
      return api.sendMessage(box(described, __l.t("m70")), event.threadID, () => {}, event.messageID);
    } catch (e) {
      react("❌");
      return api.sendMessage(
        box(__l.t("m71"), __l.t("m72")),
        event.threadID, () => {}, event.messageID
      );
    }
  }

  if (!question) {
    return answerQuestion(api, event, 'what can you do', []);
  }

  return answerQuestion(api, event, question, []);
};

// Replying to an answer continues that conversation with its history.
module.exports.handleReply = async function ({ api, event, handleReply }) {
  if (String(event.senderID) !== String(handleReply.author)) return;
  if (handleReply.threadID && String(event.threadID) !== handleReply.threadID) return;
  if (handleReply.expiresAt && Date.now() > handleReply.expiresAt) return;
  const question = String(event.body || "").trim();
  if (!question) return;
  const history = chats.get(handleReply.messageID) || [];
  return answerQuestion(api, event, question, history);
};
// Reuse this command's existing providers for group AI, with a bounded attempt
// count and per-provider failure backoff. This function never sends messages.
const smartFailures = new Map();
module.exports.askForSmartGroups = async function ({ question, history = [], system = "" }) {
  const stamp = Date.now();
  const candidates = buildProviders({ timeout: 7000 }).filter(p => (smartFailures.get(p.name) || 0) <= stamp).slice(0, 2);
  for (const provider of candidates) {
    try {
      const answer = await withTimeout(provider.run(system + "\n\n" + question, history), 7500, provider.name);
      if (typeof answer !== "string" || answer.trim().length < 2 || /^\s*<(?:!doctype|html)/i.test(answer)) throw new Error("Invalid AI answer");
      preferred = provider.name; smartFailures.delete(provider.name);
      return answer.slice(0, 1800);
    } catch (_) { smartFailures.set(provider.name, Date.now() + 5 * 60000); }
  }
  const error = new Error("Existing AI providers unavailable"); error.code = "AI_UNAVAILABLE"; throw error;
};

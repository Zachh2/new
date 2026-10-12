const __l = require("../../includes/i18n");
const axios = require("axios");

module.exports.config = {
  name: "pinterest",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Zycke",
  description: "Search images on Pinterest",
  usePrefix: true,
  commandCategory: "media",
  usages: "<search words> [-number]   e.g. pinterest cat aesthetic -6",
  cooldowns: 10,
  dependencies: { axios: "" }
};

// Endpoints live in config.json -> cedds, so a change in the API is a config
// edit rather than a code edit. {query} and {limit} are filled in below.
function endpoint(name, fallback) {
  const c = (global.config && global.config.cedds) || {};
  const base = (c.base || "https://ceddsrestapi.vercel.app").replace(/\/+$/, "");
  const path = c[name] || fallback;
  return base + (path.startsWith("/") ? path : "/" + path);
}

/** These APIs all shape their replies differently - collect image links. */
function findImages(data, out = [], depth = 0) {
  if (!data || depth > 5 || out.length > 40) return out;

  if (typeof data === "string") {
    if (/^https?:\/\//.test(data) && /(\.jpe?g|\.png|\.webp|\.gif|pinimg|image)/i.test(data)) out.push(data);
    return out;
  }
  if (Array.isArray(data)) {
    data.forEach(d => findImages(d, out, depth + 1));
    return out;
  }
  if (typeof data === "object") {
    for (const key of ["images", "result", "results", "data", "urls", "image", "url", "src", "link", "orig", "original"]) {
      if (data[key] !== undefined) findImages(data[key], out, depth + 1);
    }
    Object.values(data).forEach(v => findImages(v, out, depth + 1));
    return out;
  }
  return out;
}

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };
  const send = (m) => api.sendMessage(m, threadID, () => {}, messageID);
  const box = (lines, footer) => `╭┈ ❒ [ PINTEREST 📌 ]\n${lines.map(l => `├ ${l}`).join("\n")}\n╰┈➤ ${footer}`;

  // "-6" anywhere in the words means six images
  let count = 6;
  const words = args.filter(a => {
    const m = String(a).match(/^-(\d{1,2})$/);
    if (m) { count = Math.min(Math.max(parseInt(m[1], 10), 1), 12); return false; }
    return true;
  });
  const query = words.join(" ").trim();

  if (!query) {
    return send(box([
      __l.t("m740"),
      `${global.config.PREFIX}pinterest cat aesthetic`,
      __l.t("m742", [global.config.PREFIX])
    ], __l.t("m743")));
  }

  react("⏳");
  try {
    const url = endpoint("pinterest", "/api/pinterest?q={query}&limit={limit}")
      .replace("{query}", encodeURIComponent(query))
      .replace("{limit}", String(count));

    const { data } = await axios.get(url, { timeout: 25000 });
    const images = [...new Set(findImages(data))].slice(0, count);

    if (!images.length) {
      react("❌");
      return send(box([__l.t("m744", [query])], __l.t("m675")));
    }

    // download them in parallel, attach whatever arrives
    const streams = [];
    await Promise.all(images.map(async (link, i) => {
      try {
        const res = await axios.get(link, { responseType: "stream", timeout: 20000 });
        streams[i] = res.data;
      } catch (e) { /* skip the ones that fail */ }
    }));

    const attachment = streams.filter(Boolean);
    if (!attachment.length) {
      react("❌");
      return send(box([__l.t("m745")], __l.t("m746")));
    }

    react("✅");
    return api.sendMessage(
      { body: __l.t("m747", [query, attachment.length]), attachment },
      threadID, () => {}, messageID
    );
  } catch (error) {
    react("❌");
    const why = (error.response && error.response.status)
      ? __l.t("m241", [error.response.status])
      : String((error && error.message) || error).slice(0, 90);
    return send(box([__l.t("m748", [why])], __l.t("m749")));
  }
};

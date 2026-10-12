const __l = require("../../includes/i18n");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
  name: "make",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Zycke",
  description: "Restyle a photo with AI - reply to a picture and say what to do",
  usePrefix: true,
  commandCategory: "edit-image",
  usages: "<what to do>  (reply to a photo, or paste an image link)",
  cooldowns: 15,
  dependencies: { axios: "", "fs-extra": "" }
};

const CACHE = path.join(__dirname, "cache");

// Endpoints live in config.json -> smfahim, so an API change is a config edit.
function endpoint(name, fallback) {
  const c = (global.config && global.config.smfahim) || {};
  const base = String(c.base || "https://smfahim.xyz").replace(/\/+$/, "");
  const p = c[name] || fallback;
  return base + (p.startsWith("/") ? p : "/" + p);
}

/** Some of these endpoints return the image itself, others return JSON with a
 *  link to it. Handle both, and save whatever we end up with. */
async function fetchImage(url, dest) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 60000 });
  const type = String(res.headers["content-type"] || "");

  if (/^image\//i.test(type) || /^video\//i.test(type)) {
    fs.writeFileSync(dest, Buffer.from(res.data));
    return dest;
  }

  // not binary - read it as JSON and look for a link
  let body;
  try { body = JSON.parse(Buffer.from(res.data).toString("utf8")); }
  catch (e) { throw new Error(__l.t("m232")); }

  const link = findUrl(body);
  if (!link) throw new Error((body && (body.message || body.error)) || __l.t("m233"));

  const img = await axios.get(link, { responseType: "arraybuffer", timeout: 60000 });
  fs.writeFileSync(dest, Buffer.from(img.data));
  return dest;
}

function findUrl(data, depth = 0) {
  if (!data || depth > 4) return null;
  if (typeof data === "string") return /^https?:\/\//.test(data) ? data : null;
  if (Array.isArray(data)) {
    for (const d of data) { const f = findUrl(d, depth + 1); if (f) return f; }
    return null;
  }
  if (typeof data === "object") {
    for (const k of ["url", "image", "result", "data", "link", "output", "images"]) {
      if (data[k] !== undefined) { const f = findUrl(data[k], depth + 1); if (f) return f; }
    }
    for (const v of Object.values(data)) { const f = findUrl(v, depth + 1); if (f) return f; }
  }
  return null;
}

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };
  const send = (m) => api.sendMessage(m, threadID, () => {}, messageID);
  const box = (lines, footer) => `╭┈ ❒ [ MAKE 🎨 ]\n${lines.map(l => `├ ${l}`).join("\n")}\n╰┈➤ ${footer}`;

  // an image link typed in the message counts too
  const words = [];
  let imageUrl = null;
  for (const a of args) {
    if (!imageUrl && /^https?:\/\/\S+$/i.test(a)) { imageUrl = a; continue; }
    words.push(a);
  }
  const prompt = words.join(" ").trim();

  // otherwise: a photo in this message, or in the one you replied to
  if (!imageUrl) {
    const pools = [event.attachments || [], (event.messageReply && event.messageReply.attachments) || []];
    for (const pool of pools) {
      const photo = pool.find(a => a && (a.type === "photo" || a.type === "animated_image") && (a.url || a.largePreviewUrl));
      if (photo) { imageUrl = photo.url || photo.largePreviewUrl; break; }
    }
  }

  if (!imageUrl) {
    return send(box([
      __l.t("m570"),
      __l.t("m571", [global.config.PREFIX]),
      `${global.config.PREFIX}make anime style https://example.com/pic.jpg`
    ], __l.t("m572")));
  }
  if (!prompt) {
    return send(box([__l.t("m573"), __l.t("m571", [global.config.PREFIX])], __l.t("m574")));
  }

  react("⏳");
  fs.ensureDirSync(CACHE);
  const file = path.join(CACHE, `make-${Date.now()}.png`);

  try {
    const url = endpoint("make", "/ai/deepfake/gen?prompt={prompt}&imageUrl={image}")
      .replace("{prompt}", encodeURIComponent(prompt))
      .replace("{image}", encodeURIComponent(imageUrl));

    // these take a while - give it longer than the others
    await fetchImage(url, file);
    react("✅");
    return api.sendMessage(
      { body: `🎨 ${prompt}`, attachment: fs.createReadStream(file) },
      threadID,
      () => setTimeout(() => { try { fs.unlinkSync(file); } catch (e) {} }, 5000),
      messageID
    );
  } catch (error) {
    try { fs.unlinkSync(file); } catch (e) {}
    react("❌");
    const why = (error.response && error.response.status)
      ? __l.t("m241", [error.response.status])
      : String((error && error.message) || error).slice(0, 100);
    return send(box([__l.t("m576", [why])], __l.t("m577")));
  }
};

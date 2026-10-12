const __l = require("../../includes/i18n");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
  name: "cartoon",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Zycke",
  description: "Turn a photo into a cartoon",
  usePrefix: true,
  commandCategory: "edit-image",
  usages: "reply to a photo  ·  @mention  ·  image link  ·  nothing = your avatar",
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

/** The picture to cartoonise, in the order people expect:
 *    1. a photo attached here or in the message you replied to
 *    2. an image link typed in the message
 *    3. someone you @mentioned, or whose message you replied to
 *    4. you */
async function pickImage(api, event, args) {
  const pools = [event.attachments || [], (event.messageReply && event.messageReply.attachments) || []];
  for (const pool of pools) {
    const photo = pool.find(a => a && (a.type === "photo" || a.type === "animated_image") && (a.url || a.largePreviewUrl));
    if (photo) return photo.url || photo.largePreviewUrl;
  }

  const link = args.find(a => /^https?:\/\/\S+$/i.test(a));
  if (link) return link;

  const mentions = Object.keys(event.mentions || {});
  const target = mentions[0]
    || (event.messageReply && event.messageReply.senderID)
    || args.find(a => /^\d{5,}$/.test(a))
    || event.senderID;

  // the bot's own lookup first; the plain graph URL is the fallback
  try {
    const info = await api.getUserInfo(target);
    const src = info && info[target] && info[target].thumbSrc;
    if (src && /^https?:\/\//.test(src)) return src;
  } catch (e) {}
  return `https://graph.facebook.com/${target}/picture?width=720&height=720`;
}

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };
  const send = (m) => api.sendMessage(m, threadID, () => {}, messageID);
  const box = (lines, footer) => `╭┈ ❒ [ CARTOON 🎨 ]\n${lines.map(l => `├ ${l}`).join("\n")}\n╰┈➤ ${footer}`;

  react("⏳");
  fs.ensureDirSync(CACHE);
  const file = path.join(CACHE, `cartoon-${Date.now()}.png`);

  try {
    const imageUrl = await pickImage(api, event, args);
    const url = endpoint("cartoon", "/tools/cartoonize?imageUrl={image}")
      .replace("{image}", encodeURIComponent(imageUrl));

    await fetchImage(url, file);

    if (!fs.existsSync(file) || fs.statSync(file).size < 1000) throw new Error(__l.t("m248"));

    react("✅");
    return api.sendMessage(
      { attachment: fs.createReadStream(file) },
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
    return send(box([
      __l.t("m249", [why]),
      __l.t("m250")
    ], __l.t("m251")));
  }
};

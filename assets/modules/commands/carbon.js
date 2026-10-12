const __l = require("../../includes/i18n");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
  name: "carbon",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Zycke",
  description: "Turn code into a carbon-style image",
  usePrefix: true,
  commandCategory: "media",
  usages: "<code>   ·   carbon -t 3 <code>   (theme 1-6)",
  cooldowns: 10,
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
  const box = (lines, footer) => `╭┈ ❒ [ CARBON 🖼️ ]\n${lines.map(l => `├ ${l}`).join("\n")}\n╰┈➤ ${footer}`;

  // -t 3 picks a theme; everything else is the code
  let type = 1;
  const words = [];
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "-t" || args[i] === "--type") && args[i + 1]) { type = parseInt(args[++i], 10) || 1; continue; }
    words.push(args[i]);
  }

  // code from the message, or from the message you replied to
  let code = words.join(" ").trim();
  if (!code && event.messageReply && event.messageReply.body) code = event.messageReply.body.trim();

  if (!code) {
    return send(box([
      __l.t("m235"),
      `${global.config.PREFIX}carbon console.log("hello")`,
      `${global.config.PREFIX}carbon -t 3 const x = 1;`
    ], __l.t("m238")));
  }

  react("⏳");
  fs.ensureDirSync(CACHE);
  const file = path.join(CACHE, `carbon-${Date.now()}.png`);

  try {
    const url = endpoint("carbon", "/maker/carbonify?text={text}&type={type}")
      .replace("{text}", encodeURIComponent(code))
      .replace("{type}", String(type));

    await fetchImage(url, file);
    react("✅");
    return api.sendMessage(
      { body: __l.t("m240", [type]), attachment: fs.createReadStream(file) },
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
    return send(box([__l.t("m242", [why])], __l.t("m243")));
  }
};

const __l = require("../../includes/i18n");
const axios = require("axios");

module.exports.config = {
  name: "npm",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Zycke",
  description: "Search npmjs.com for packages and show details",
  usePrefix: true,
  commandCategory: "Utility",
  usages: "[search words] | info [package] | [package]",
  cooldowns: 5,
  dependencies: { axios: "" }
};

const REGISTRY = "https://registry.npmjs.org";
const API = "https://api.npmjs.org";
const TIMEOUT = 15000;

const num = (n) => (Number(n) || 0).toLocaleString("en-US");

function ago(dateString) {
  if (!dateString) return "unknown";
  const days = Math.floor((Date.now() - new Date(dateString).getTime()) / 86400000);
  if (isNaN(days)) return "unknown";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return __l.t("m650", [days]);
  if (days < 365) return __l.t("m651", [Math.floor(days / 30)]);
  return __l.t("m652", [Math.floor(days / 365)]);
}

function box(title, lines, footer) {
  const body = lines.map(l => (l === "│" ? "│" : `├ ${l}`));
  return [`╭┈ ❒ [ NPM ${title} ]`, ...body, `╰┈➤ ${footer}`].join("\n");
}

async function weeklyDownloads(name) {
  try {
    const { data } = await axios.get(`${API}/downloads/point/last-week/${encodeURIComponent(name)}`, { timeout: TIMEOUT });
    return data && typeof data.downloads === "number" ? data.downloads : null;
  } catch (e) {
    return null;                       // scoped/unpublished packages have no stats
  }
}

/** Full details for one package. Returns a ready-to-send string, or null. */
async function details(name) {
  let data;
  try {
    const res = await axios.get(`${REGISTRY}/${encodeURIComponent(name).replace("%40", "@")}`, { timeout: TIMEOUT });
    data = res.data;
  } catch (e) {
    return null;
  }

  const latest = (data["dist-tags"] && data["dist-tags"].latest) || "";
  const version = data.versions && data.versions[latest] ? data.versions[latest] : {};
  const modified = data.time && (data.time[latest] || data.time.modified);
  const downloads = await weeklyDownloads(data.name);

  const author =
    (version.author && (version.author.name || version.author)) ||
    (data.author && (data.author.name || data.author)) ||
    (Array.isArray(data.maintainers) && data.maintainers[0] && data.maintainers[0].name) ||
    "unknown";

  const lines = [
    `📦 ${data.name}  v${latest}`,
    data.description ? `📝 ${data.description}` : __l.t("m655"),
    `👤 ${author}`,
    `⚖️ ${version.license || data.license || __l.t("m656")}`,
    downloads === null ? __l.t("m657") : __l.t("m658", [num(downloads)]),
    __l.t("m659", [ago(modified)]),
    `⬛ npm i ${data.name}`
  ];

  if (Array.isArray(data.keywords) && data.keywords.length) {
    lines.push(`🏷️ ${data.keywords.slice(0, 6).join(", ")}`);
  }

  return box("📦", lines, `https://www.npmjs.com/package/${data.name}`);
}

/** Search results. Returns { text, names } or null. */
async function search(query, limit = 5) {
  let objects;
  try {
    const { data } = await axios.get(`${REGISTRY}/-/v1/search`, {
      params: { text: query, size: limit },
      timeout: TIMEOUT
    });
    objects = (data && data.objects) || [];
  } catch (e) {
    return null;
  }

  if (!objects.length) return { text: null, names: [] };

  const names = [];
  const lines = [__l.t("m661", [query, objects.length]), "│"];

  objects.forEach((o, i) => {
    const p = o.package || {};
    names.push(p.name);
    const desc = (p.description || __l.t("m662")).replace(/\s+/g, " ").trim();
    lines.push(`${i + 1}. ${p.name}  v${p.version || "?"}`);
    lines.push(`   ${desc.length > 90 ? desc.slice(0, 87) + "..." : desc}`);
    lines.push(__l.t("m664", [ago(p.date)]));
    if (i < objects.length - 1) lines.push("│");
  });

  return {
    text: box("🔍", lines, __l.t("m665")),
    names
  };
}

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };
  const send = (msg, cb) => api.sendMessage(msg, threadID, cb, messageID);

  const query = args.join(" ").trim();
  if (!query) {
    return send(box("❓", [
      __l.t("m666"),
      __l.t("m667", [global.config.PREFIX]),
      __l.t("m668", [global.config.PREFIX])
    ], __l.t("m669")));
  }

  react("⏳");

  // "-npm info <name>" or a single word that is an exact package name
  const wantsInfo = args[0].toLowerCase() === "info";
  const target = wantsInfo ? args.slice(1).join(" ").trim() : query;

  if (wantsInfo || !target.includes(" ")) {
    const info = await details(target);
    if (info) {
      react("✅");
      return send(info);
    }
    if (wantsInfo) {
      react("❌");
      return send(box("❌", [__l.t("m670", [target])], __l.t("m671")));
    }
    // not an exact package name - fall through and search for it
  }

  const found = await search(target);
  if (!found) {
    react("❌");
    return send(box("❌", [__l.t("m672")], __l.t("m673")));
  }
  if (!found.names.length) {
    react("❌");
    return send(box("❌", [__l.t("m674", [target])], __l.t("m675")));
  }

  react("✅");
  return send(found.text, (err, info) => {
    if (err || !info) return;
    global.client.handleReply.push({
      name: module.exports.config.name,
      messageID: info.messageID,
      author: senderID,
      names: found.names
    });
  });
};

// Reply with 1-5 to open that package's details.
module.exports.handleReply = async function ({ api, event, handleReply }) {
  if (String(event.senderID) !== String(handleReply.author)) return;

  const { threadID, messageID, body } = event;
  const send = (msg) => api.sendMessage(msg, threadID, () => {}, messageID);

  const pick = parseInt(String(body).trim(), 10);
  if (isNaN(pick) || pick < 1 || pick > handleReply.names.length) {
    return send(box("❓", [__l.t("m676", [handleReply.names.length])], __l.t("m677")));
  }

  const info = await details(handleReply.names[pick - 1]);
  if (!info) return send(box("❌", [__l.t("m678")], __l.t("m673")));

  // one reply per search result list
  const index = global.client.handleReply.findIndex(e => e.messageID === handleReply.messageID);
  if (index > -1) global.client.handleReply.splice(index, 1);

  return send(info);
};

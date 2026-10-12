const __l = require("../../includes/i18n");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
  name: "delete",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Zycke",
  description: "Throw someone in the trash",
  usePrefix: true,
  commandCategory: "edit-image",
  usages: "[@mention | reply to a photo]",
  cooldowns: 5,
  dependencies: { "fs-extra": "", axios: "", "@zorner/discord-image-generation": "" }
};

// Note: no discord.js here on purpose. The usual version of this command wraps
// the result in Discord.MessageAttachment, which no longer exists in discord.js
// v14 (this bot's version) - and the image library already hands back a Buffer,
// so it was never needed.

const CACHE = path.join(__dirname, "cache");

/** The bot's own avatar lookup first, public graph URL as a fallback.
 *  (Shared app tokens hardcoded in other command packs stop working the day
 *  they get revoked.) */
async function avatar(api, userID) {
  const urls = [];
  try {
    const info = await api.getUserInfo(userID);
    const src = info && info[userID] && info[userID].thumbSrc;
    if (src && /^https?:\/\//.test(src)) urls.push(src);
  } catch (e) {}
  urls.push(`https://graph.facebook.com/${userID}/picture?width=512&height=512`);

  for (const url of urls) {
    try {
      const res = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
      const buf = Buffer.from(res.data);
      if (buf.length > 1000) return buf;
    } catch (e) {}
  }
  throw new Error(__l.t("m390"));
}

/** A photo attached here, or in the message being replied to. */
async function attachedPhoto(event) {
  const pools = [event.attachments || [], (event.messageReply && event.messageReply.attachments) || []];
  for (const pool of pools) {
    const photo = pool.find(a => a && (a.type === "photo" || a.type === "animated_image" || a.type === "sticker") && (a.url || a.largePreviewUrl));
    if (photo) {
      const res = await axios.get(photo.url || photo.largePreviewUrl, { responseType: "arraybuffer", timeout: 20000 });
      return Buffer.from(res.data);
    }
  }
  return null;
}

/** Who is this effect aimed at?
 *    1. someone you @mentioned
 *    2. the person whose message you replied to
 *    3. a raw user ID typed as an argument
 *    4. you
 *  (A photo - attached or replied to - beats all of these and is handled
 *  separately, so replying to a picture still uses the picture.) */
function targetOf(event, args) {
  const mentions = Object.keys(event.mentions || {});
  if (mentions.length) return mentions[0];

  if (event.messageReply && event.messageReply.senderID) {
    return String(event.messageReply.senderID);
  }

  const id = (args || []).find(a => /^\d{5,}$/.test(String(a)));
  if (id) return String(id);

  return event.senderID;
}

function deliver(api, event, image, ext) {
  fs.ensureDirSync(CACHE);
  const file = path.join(CACHE, `delete-${Date.now()}.${ext}`);
  fs.writeFileSync(file, image);
  api.sendMessage(
    { attachment: fs.createReadStream(file) },
    event.threadID,
    // deleted a moment later: sends are queued by the rate limiter, so the
    // upload may still be reading the file when this fires
    () => setTimeout(() => { try { fs.unlinkSync(file); } catch (e) {} }, 5000),
    event.messageID
  );
}

function fail(api, event, why) {
  try { api.setMessageReaction("❌", event.messageID, () => {}, true); } catch (e) {}
  return api.sendMessage(
    __l.t("m391", [why]),
    event.threadID, () => {}, event.messageID
  );
}

module.exports.run = async function ({ api, event, args }) {
  const react = (e) => { try { api.setMessageReaction(e, event.messageID, () => {}, true); } catch (err) {} };
  react("⏳");

  try {
    const DIG = require("@zorner/discord-image-generation");
    const target = targetOf(event, args);
    const source = (await attachedPhoto(event)) || (await avatar(api, target));

    const image = await new DIG.Delete().getImage(source);
    if (!image || !image.length) throw new Error(__l.t("m392"));

    react("✅");
    return deliver(api, event, image, "png");
  } catch (error) {
    return fail(api, event, String((error && error.message) || error).slice(0, 120));
  }
};
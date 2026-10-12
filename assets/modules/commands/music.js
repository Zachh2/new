const __l = require("../../includes/i18n");
const axios = require("axios");
if (axios && axios.defaults) axios.defaults.timeout = axios.defaults.timeout || 30000; // no request may hang forever
const yts = require("yt-search");

const fs = require("fs-extra");
const path = require("path");

const threadCooldowns = new Map();

const T_JSON = 10000;      // every request is bounded
const T_FILE = 90000;
const MAX_BYTES = 25 * 1024 * 1024;   // Messenger attachment ceiling

// Same key resolution as video.js: your own key first, shared list as fallback.
async function getRapidKey() {
  if (process.env.RAPIDAPI_KEY) return process.env.RAPIDAPI_KEY;
  try {
    const local = require(__dirname + "/video_key.json");
    if (local && local.RAPIDAPI_KEY) return local.RAPIDAPI_KEY;
  } catch (e) {}
  const res = await axios.get(
    "https://raw.githubusercontent.com/quyenkaneki/data/main/video.json",
    { timeout: T_JSON }
  );
  const list = res.data.keyVideo;
  if (!list || !list.length) throw new Error(__l.t("m603"));
  return list[Math.floor(Math.random() * list.length)].API_KEY;
}

// youtu.be/ID, watch?v=ID, embed/ID ...
function youtubeId(url) {
  const m = String(url).match(/(?:youtu\.be\/|v\/|embed\/|watch\?v=|&v=)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// YouTube itags. Muxed = video+audio in one file, which is what Messenger needs.
// Ordered smallest-first so we can walk up until we hit the size ceiling.
const MUXED = [
  { itag: "18", label: "360p" },
  { itag: "22", label: "720p" }
];
const AUDIO_ONLY = ["139", "140", "141", "249", "250", "251", "233", "234"];

// Collect every usable muxed MP4 candidate, smallest quality first.
async function resolveCandidates(url) {
  const id = youtubeId(url);
  if (!id) throw new Error(__l.t("m604"));

  const key = await getRapidKey();
  const res = (await axios.request({
    method: "GET",
    url: "https://ytstream-download-youtube-videos.p.rapidapi.com/dl",
    params: { id },
    timeout: T_JSON,
    headers: {
      "x-rapidapi-host": "ytstream-download-youtube-videos.p.rapidapi.com",
      "x-rapidapi-key": key
    }
  })).data;

  if (!res) throw new Error(__l.t("m605"));
  if (res.status === "fail") throw new Error(res.msg || __l.t("m606"));
  if (!res.link || typeof res.link !== "object") throw new Error(__l.t("m607"));

  const title = res.title || "video";
  const out = [];

  // known muxed itags first, in quality order
  for (const m of MUXED) {
    const e = res.link[m.itag];
    const link = Array.isArray(e) ? e[0] : e;
    if (link) out.push({ link, label: m.label, title });
  }

  // fall back to anything that looks like muxed mp4 and is not audio-only
  if (!out.length) {
    for (const k of Object.keys(res.link)) {
      if (AUDIO_ONLY.includes(k)) continue;
      const e = res.link[k];
      const link = Array.isArray(e) ? e[0] : e;
      const label = Array.isArray(e) && e[1] ? String(e[1]) : k;
      if (link) out.push({ link, label, title });
    }
  }

  if (!out.length) throw new Error(__l.t("m608"));
  return { title, candidates: out };
}

// Ask the CDN how big a stream is without downloading it.
async function sizeOf(url) {
  try {
    const r = await axios.head(url, { timeout: T_JSON });
    const n = parseInt(r.headers["content-length"], 10);
    return isNaN(n) ? null : n;
  } catch (e) {
    return null;   // some CDNs refuse HEAD — we guard during download instead
  }
}

// Pick the best quality that still fits under the cap.
async function pickBestFit(candidates) {
  let fallback = null;
  const sized = [];

  for (const c of candidates) {
    const size = await sizeOf(c.link);
    sized.push({ ...c, size });
    if (size === null && !fallback) fallback = c;     // unknown size, try it last
  }

  const known = sized.filter(c => c.size !== null);
  const fits = known.filter(c => c.size <= MAX_BYTES);

  if (fits.length) {
    // largest that still fits = best quality within the limit
    fits.sort((a, b) => b.size - a.size);
    return fits[0];
  }
  if (known.length) {
    // nothing fits — return the smallest so the error can state the real size
    known.sort((a, b) => a.size - b.size);
    return known[0];
  }
  return fallback || candidates[0];
}

// Stream to disk, aborting the moment the cap is exceeded so a 200MB file is
// never written just to be deleted.
async function downloadTo(url, dest, cap) {
  const res = await axios({ method: "GET", url, responseType: "stream", timeout: T_FILE });

  const limit = cap || MAX_BYTES;
  let got = 0;

  await new Promise((resolve, reject) => {
    const w = fs.createWriteStream(dest);
    let aborted = false;

    res.data.on("data", (chunk) => {
      got += chunk.length;
      if (got > limit && !aborted) {
        aborted = true;
        try { res.data.destroy(); } catch (e) {}
        try { w.destroy(); } catch (e) {}
        reject(new Error("OVER_LIMIT"));
      }
    });

    res.data.pipe(w);
    res.data.on("error", reject);
    w.on("error", reject);
    w.on("finish", resolve);
  });

  return got;
}

module.exports.config = {
    name: "music",
    version: "1.2.0",
    hasPermssion: 0,
    description: "Play and download YouTube music",
    usePrefix: true,
    hide: false,
    commandCategory: "Music",
    usages: "<song name>",
    cooldowns: 1,
    credits: "Jonell Magallanes"
};

module.exports.run = async ({ api, event, args }) => {
    let info = null;
    const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, event.threadID, (e, i) => r(e ? null : i), event.messageID));
    const react = (e) => { try { api.setMessageReaction(e, event.messageID, () => {}, true); } catch (err) {} };
    const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ MUSIC " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
    const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, event.threadID); else api.sendMessage(o, event.threadID, event.messageID); react(b ? "❌" : "✅"); };
    try {
        const threadID = event.threadID;
        
        if (threadCooldowns.has(threadID)) {
            const cooldownData = threadCooldowns.get(threadID);
            const remainingTime = Math.ceil((cooldownData.timestamp + 40000 - Date.now()) / 1000);
            
            if (remainingTime > 0) {
                const cooldownMessage = await api.sendMessage(__l.t("m612", [remainingTime]), threadID);
                
                setTimeout(async () => {
                    try {
                        await api.unsendMessage(cooldownMessage.messageID);
                    } catch (e) {}
                }, 10000);
                
                return;
            }
        }

        const query = args.join(" ");
        if (!query) return api.sendMessage(__l.t("m613"), threadID, event.messageID);

        const search = await yts(query);
        if (!search.videos.length) return api.sendMessage(__l.t("m614"), threadID, event.messageID);

        const video = search.videos[0];
        const url = video.url;

        api.setMessageReaction("⏳", event.messageID, () => {}, true);

            info = await sendWait(__l.t("m615"));

        const apiUrl = `https://ccproject.serv00.net/ytdl2.php?url=${encodeURIComponent(url)}`;
        const res = await axios.get(apiUrl);
        const { download } = res.data;

        const audioResponse = await axios({
            method: 'get',
            url: download,
            responseType: 'stream'
        });

        threadCooldowns.set(threadID, {
            timestamp: Date.now()
        });

        // Fixed: Remove the callback and handle the reply separately
        edit(__l.t("m616", [video.title, video.author.name, video.timestamp, video.url]), info);

        const musicMessage = await api.sendMessage(
            {
                body: __l.t("m617"),
                attachment: audioResponse.data
            },
            threadID
        );

        // Set reaction after sending the message
        api.setMessageReaction("✅", event.messageID, () => {}, true);

        // Store the handleReply data after successful message send
        if (musicMessage && musicMessage.messageID) {
            global.client.handleReply.push({
                name: this.config.name,
                messageID: musicMessage.messageID,
                author: event.senderID,
                downloadUrl: download,
                videoUrl: url,
                title: video.title
            });
        }

    } catch (err) {
        console.error('Music command error:', err);
        edit(__l.t("m619"), info);
    }
};

module.exports.handleReply = async ({ api, event, handleReply }) => {
    try {
        const { threadID, body, senderID } = event;
        const { author, downloadUrl, messageID } = handleReply;

        if (senderID !== author) return;

        const message = body.toLowerCase().trim();

        // ---- reply "video" -> send the same track as a YouTube video ----
        if (message === "video" || message === "vid" || message === "mp4") {
            const react = (e) => { try { api.setMessageReaction(e, event.messageID, () => {}, true); } catch (err) {} };
            const fmt = (t, ok) => /[╭╰━┈]/.test(String(t)) ? String(t)
                : "╭┈ ❒ [ MUSIC " + (ok ? "🎬" : "❌") + " ]\n" + t + "\n╰┈━━━━━━━━━━━";

            const send = (t) => global.editMsgDisabled ? Promise.resolve(null)
                : new Promise(r => api.sendMessage(t, threadID, (e, i) => r(e ? null : i), event.messageID));
            const edit = (t, ok, i) => {
                const o = fmt(t, ok);
                if (i) api.editMessage(o, i.messageID, threadID);
                else api.sendMessage(o, threadID, event.messageID);
                react(ok ? "✅" : "❌");
            };

            if (!handleReply.videoUrl) {
                return api.sendMessage(__l.t("m620"), threadID, event.messageID);
            }

            react("⏳");
            const info = await send(__l.t("m621"));

            const dest = path.join(__dirname, "cache", `ytvid_${Date.now()}.mp4`);

            try {
                const { title, candidates } = await resolveCandidates(handleReply.videoUrl);
                const name = handleReply.title || title;

                if (info) api.editMessage(
                    __l.t("m622", [name]),
                    info.messageID, threadID);

                const pick = await pickBestFit(candidates);

                // size already known and over the cap: say so without downloading
                if (pick.size && pick.size > MAX_BYTES) {
                    return edit(
                        __l.t("m623", [name, (pick.size / 1048576).toFixed(1)]),
                        false, info);
                }

                if (info) api.editMessage(
                    __l.t("m624", [name, pick.label]),
                    info.messageID, threadID);

                let bytes;
                try {
                    bytes = await downloadTo(pick.link, dest, MAX_BYTES);
                } catch (e) {
                    if (e.message === "OVER_LIMIT") {
                        // size was unknown up front; retry at the lowest quality
                        try { if (fs.existsSync(dest)) fs.unlinkSync(dest); } catch (er) {}
                        const smaller = candidates[0];
                        if (smaller && smaller.link !== pick.link) {
                            if (info) api.editMessage(
                                __l.t("m625", [name, smaller.label]),
                                info.messageID, threadID);
                            bytes = await downloadTo(smaller.link, dest, MAX_BYTES);
                            pick.label = smaller.label;
                        } else {
                            throw new Error(__l.t("m626"));
                        }
                    } else throw e;
                }

                edit(`🎬 ${name}\n${pick.label} · ${(bytes / 1048576).toFixed(1)}MB`, true, info);

                return api.sendMessage(
                    { attachment: fs.createReadStream(dest) },
                    threadID,
                    () => { try { fs.unlinkSync(dest); } catch (e) {} },
                    event.messageID
                );

            } catch (e) {
                try { if (fs.existsSync(dest)) fs.unlinkSync(dest); } catch (er) {}
                return edit(__l.t("m628") + e.message, false, info);
            }
        }

        if (message === "dl" || message === "download") {
            const downloadMessage = await api.sendMessage({
                body: __l.t("m629", [downloadUrl])
            }, threadID);
            
            setTimeout(async () => {
                try {
                    await api.unsendMessage(downloadMessage.messageID);
                    await api.unsendMessage(messageID);
                } catch (e) {}
            }, 50000);
        }
    } catch (error) {
        console.error("Handle reply error:", error);
    }
};
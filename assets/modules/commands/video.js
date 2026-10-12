"use strict";

// Mirai/FCA-style command. Reuses existing downloader files; installs nothing.
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

module.exports.config = {
  name: "video",
  version: "2.1.0",
  hasPermssion: 0, // Spelling required by Mirai.
  credits: "Original idea: D-Jukie / chinhle; rewritten with Codex",
  description: "Search YouTube and send a video attachment",
  usePrefix: true,
  commandCategory: "media",
  usages: "<keywords | YouTube URL>",
  cooldowns: 10,
  dependencies: {}
};

const SIZE_CAP = 25 * 1024 * 1024; // Command policy; adjust for your bot host.
const DOWNLOAD_MS = 180000;
const REPLY_MS = 5 * 60 * 1000;
const busy = new Set();
const ID = /^[A-Za-z0-9_-]{11}$/;
const watchURL = id => `https://www.youtube.com/watch?v=${id}`;

function publicError(message) {
  const error = new Error(message);
  error.forUser = true;
  return error;
}

function apiKey() {
  const key = process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_API ||
    (global.config && global.config.video && global.config.video.YOUTUBE_API);
  if (!key) throw publicError("Set YOUTUBE_API_KEY and enable YouTube Data API v3 first.");
  return key;
}

function videoID(input) {
  if (ID.test(input)) return input;
  let url;
  try { url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`); }
  catch (_) { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  let id;
  if (host === 'youtu.be' || host === 'www.youtu.be') id = parts[0];
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1];
  }
  return typeof id === 'string' && ID.test(id) ? id : null;
}

function titleText(value) {
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  return String(value || 'YouTube video').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (raw, code) => {
    if (code[0] !== '#') return entities[code.toLowerCase()] || raw;
    const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : raw;
  }).replace(/[\r\n\t]+/g, ' ').slice(0, 240);
}

function youtube(endpoint, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [key, value] of Object.entries({ ...params, key: apiKey() })) url.searchParams.set(key, value);
  return new Promise((resolve, reject) => {
    // Never log this URL: it contains the API key.
    const req = https.get(url, res => {
      const chunks = [];
      let length = 0;
      res.on('data', chunk => {
        length += chunk.length;
        if (length > 1024 * 1024) req.destroy(publicError('YouTube returned an unexpectedly large response.'));
        else chunks.push(chunk);
      });
      res.on('error', () => reject(publicError('YouTube connection interrupted. Try again.')));
      res.on('end', () => {
        clearTimeout(timer);
        let data;
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch (_) { return reject(publicError('YouTube returned an invalid response. Try again.')); }
        if (res.statusCode !== 200) {
          const reason = data.error && data.error.errors && data.error.errors[0] && data.error.errors[0].reason;
          const quota = ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'].includes(reason);
          return reject(publicError(quota ? 'YouTube API quota reached. Try again later.' :
            'YouTube API request failed. Check the API key, API restrictions, and that YouTube Data API v3 is enabled.'));
        }
        resolve(data);
      });
    });
    const timer = setTimeout(() => req.destroy(publicError('YouTube search/details timed out. Try again.')), 15000);
    req.on('error', error => {
      clearTimeout(timer);
      reject(error.forUser ? error : publicError('Cannot connect to YouTube. Try again later.'));
    });
  });
}

function send(api, event, message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const attachment = message && message.attachment;
    const finish = (error, info) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (attachment) attachment.removeListener('error', onError);
      error ? reject(publicError('The bot could not send the message. Try again.')) : resolve(info);
    };
    const onError = error => finish(error);
    const timer = setTimeout(() => finish(new Error('Send timeout')), 180000);
    if (attachment) attachment.once('error', onError);
    try { api.sendMessage(message, event.threadID, finish, event.messageID); }
    catch (error) { finish(error); }
  });
}

async function report(api, event, error, id) {
  const text = error.forUser ? error.message : 'Could not prepare this video. Please try another video.';
  try { await send(api, event, text + (id ? `\nWatch: ${watchURL(id)}` : '')); }
  catch (_) { console.error('[video] Could not send an error message.'); }
}

function stopProcessTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => child.kill('SIGKILL'));
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch (_) { child.kill('SIGKILL'); }
  }
}

function existingExecutable(file) {
  try {
    if (!fs.statSync(file).isFile()) return false;
    fs.accessSync(file, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch (_) { return false; }
}

function onPath(name) {
  const names = process.platform === 'win32' && !name.endsWith('.exe') ? [name + '.exe', name] : [name];
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const filename of names) {
      const candidate = path.join(dir, filename);
      if (existingExecutable(candidate)) return candidate;
    }
  }
  return null;
}

function downloaderPath() {
  const settings = (global.config && global.config.videoDownload) || {};
  const explicit = process.env.YT_DLP_PATH || settings.ytDlpPath;
  if (explicit) {
    if (existingExecutable(explicit)) return explicit;
    const executable = onPath(explicit);
    if (executable) return executable;
    throw publicError('The configured yt-dlp executable is missing or not executable. Set videoDownload.ytDlpPath to the existing binary file, not the project folder.');
  }
  const roots = [...new Set(['/home/container', process.cwd(), path.resolve(__dirname, '../..')])];
  const filename = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  for (const root of roots) {
    for (const folder of ['yt-dlp-exec', 'youtube-dl-exec', 'node_modules/yt-dlp-exec',
      'node_modules/youtube-dl-exec', 'node_modules/@borodutch-labs/yt-dlp-exec']) {
      const candidate = path.join(root, folder, 'bin', filename);
      if (existingExecutable(candidate)) return candidate;
    }
  }
  const executable = onPath('yt-dlp');
  if (executable) return executable;
  throw publicError('Cannot find an executable downloader. Check /home/container/yt-dlp-exec/bin/yt-dlp. The src/scripts folders alone are not the downloader. If your binary is elsewhere, set videoDownload.ytDlpPath to that file.');
}

function ffmpegPath() {
  const settings = (global.config && global.config.videoDownload) || {};
  const explicit = process.env.FFMPEG_PATH || settings.ffmpegPath;
  if (explicit && existingExecutable(explicit)) return explicit;
  for (const candidate of [
    '/home/container/ffmpeg-static-master/ffmpeg',
    path.join(process.cwd(), 'ffmpeg-static-master', 'ffmpeg')
  ]) {
    if (existingExecutable(candidate)) return candidate;
  }
  return onPath('ffmpeg');
}

function download(id, directory) {
  return new Promise((resolve, reject) => {
    const executable = downloaderPath();
    const ffmpeg = ffmpegPath();
    const combined = 'b[ext=mp4][vcodec^=avc1][acodec!=none][height<=360]';
    const args = [
      '--ignore-config', '--no-plugin-dirs', '--no-playlist', '--no-progress', '--no-part',
      '--socket-timeout', '15', '--retries', '1', '--fragment-retries', '1', '--abort-on-unavailable-fragments',
      '--match-filters', '!is_live', '--max-filesize', String(SIZE_CAP),
      ...(Number(process.versions.node.split('.')[0]) >= 22 ? ['--js-runtimes', `node:${process.execPath}`] : []),
      '--format', ffmpeg ? `bv[ext=mp4][vcodec^=avc1][height<=360]+ba[ext=m4a]/${combined}` : combined,
      ...(ffmpeg ? ['--ffmpeg-location', ffmpeg, '--merge-output-format', 'mp4'] : []),
      '--output', path.join(directory, 'video.%(ext)s'),
      '--', watchURL(id)
    ];
    // No shell: keywords and URLs cannot become executable commands.
    const child = spawn(executable, args, {
      windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    let failure;
    const abort = message => {
      if (failure) return;
      failure = publicError(message);
      stopProcessTree(child);
    };
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
    const timeout = setTimeout(() => abort('Video download timed out. Try a shorter video.'), DOWNLOAD_MS);
    // Allow space for audio/video inputs plus the merged output, but bound disk growth.
    const monitor = setInterval(() => {
      try {
        const bytes = fs.readdirSync(directory).reduce((sum, file) => {
          try { return sum + fs.statSync(path.join(directory, file)).size; } catch (_) { return sum; }
        }, 0);
        if (bytes > SIZE_CAP * 3) abort('This video is too large. Choose a shorter video.');
      } catch (_) { abort('The bot cannot access its temporary video folder.'); }
    }, 500);
    const clear = () => { clearTimeout(timeout); clearInterval(monitor); };
    child.once('error', () => {
      clear();
      reject(publicError('The existing yt-dlp file could not start. Check its Linux execute permission and whether its required runtime is available on this host.'));
    });
    child.once('close', code => {
      clear();
      if (failure) return reject(failure);
      if (code !== 0) {
        let message = 'YouTube could not provide a downloadable video from this server. Try another video.';
        if (!ffmpeg && /requested format.*not available/i.test(stderr)) message = 'This video has no compatible MP4 with audio already combined. Try another video, or point videoDownload.ffmpegPath to an existing FFmpeg executable.';
        else if (/no such option|unrecognized (option|argument)/i.test(stderr)) message = 'The existing yt-dlp executable does not support the options this command needs. Check its version in your hosting panel.';
        else if (/ffmpeg.*(not found|not installed)|ffprobe.*not found/i.test(stderr)) message = 'The existing FFmpeg tools could not be used. Check videoDownload.ffmpegPath and the host PATH.';
        else if (/larger than max|exceeds max|too large/i.test(stderr)) message = 'This video exceeds the 25 MB attachment cap. Choose a shorter video.';
        return reject(publicError(message));
      }
      const file = path.join(directory, 'video.mp4');
      try {
        const size = fs.statSync(file).size;
        if (size > SIZE_CAP) return reject(publicError('This video exceeds the 25 MB attachment cap. Choose a shorter video.'));
        if (size < 1000) return reject(publicError('No usable MP4 was downloaded. Try another video.'));
        resolve(file);
      } catch (_) { reject(publicError('No MP4 was downloaded. The video may be unavailable, live, or too large.')); }
    });
  });
}

async function deliver(api, event, id) {
  const user = String(event.senderID);
  if (busy.has(user)) return send(api, event, 'Your previous video is still being processed.');
  if (busy.size >= 2) return send(api, event, 'The bot is processing two videos. Please try again shortly.');
  busy.add(user);
  let directory;
  let stream;
  try {
    if (!ID.test(id)) throw publicError('Invalid YouTube video ID.');
    const data = await youtube('videos', { part: 'snippet', id });
    const item = data.items && data.items[0];
    if (!item) throw publicError('Video not found or not publicly accessible.');
    if (['live', 'upcoming'].includes(item.snippet.liveBroadcastContent)) throw publicError('Choose a finished video; live and upcoming streams are not supported.');
    await send(api, event, `Preparing: ${titleText(item.snippet.title)}\nThis can take up to 3 minutes.`);
    directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mirai-video-'));
    const file = await download(id, directory);
    stream = fs.createReadStream(file);
    await send(api, event, { body: `${titleText(item.snippet.title)}\n${watchURL(id)}`, attachment: stream });
  } catch (error) { await report(api, event, error, id); }
  finally {
    if (stream && !stream.closed) {
      await new Promise(resolve => { stream.once('close', resolve); stream.destroy(); });
    }
    if (directory) {
      // directory is generated by mkdtemp, never taken from a user or a URL.
      try { await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch (_) { console.error('[video] Could not remove a temporary download directory.'); }
    }
    busy.delete(user);
  }
}

function removeReply(record) {
  const list = global.client && global.client.handleReply;
  if (!Array.isArray(list)) return;
  const index = list.indexOf(record);
  if (index !== -1) list.splice(index, 1);
}

module.exports.run = async function ({ api, event, args }) {
  try {
    const query = (args || []).join(' ').trim();
    if (!query) return await send(api, event, 'Use: video <song/video title> or video <YouTube URL>\nReply to search results with a number.');
    if (query.length > 300) throw publicError('Please keep your search under 300 characters.');
    const id = videoID(query);
    if (id) return await deliver(api, event, id);
    if (/^(https?:\/\/|(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\/)/i.test(query)) {
      throw publicError('Please send a valid YouTube video URL, not a playlist or another website.');
    }
    if (!global.client || !Array.isArray(global.client.handleReply)) {
      throw publicError('This command needs a Mirai-style handleReply dispatcher.');
    }
    const data = await youtube('search', { part: 'snippet', type: 'video', maxResults: '6', q: query });
    const items = (data.items || []).filter(item => item.id && ID.test(item.id.videoId) &&
      item.snippet && !['live', 'upcoming'].includes(item.snippet.liveBroadcastContent));
    if (!items.length) return await send(api, event, 'No finished videos found. Try different keywords.');
    const body = items.map((item, index) => `${index + 1}. ${titleText(item.snippet.title)}\n   ${titleText(item.snippet.channelTitle)}`).join('\n\n');
    const info = await send(api, event, `YouTube results\n\n${body}\n\nReply with 1-${items.length} within 5 minutes.`);
    if (!info || !info.messageID) throw publicError('The bot did not return a search message ID. Try again.');
    const record = { name: module.exports.config.name, messageID: info.messageID, author: String(event.senderID),
      threadID: String(event.threadID), link: items.map(item => item.id.videoId), expiresAt: Date.now() + REPLY_MS, used: false };
    global.client.handleReply.push(record);
    setTimeout(() => removeReply(record), REPLY_MS).unref();
  } catch (error) { await report(api, event, error); }
};

module.exports.handleReply = async function ({ api, event, handleReply: record }) {
  if (!record || String(event.senderID) !== record.author || String(event.threadID) !== record.threadID || record.used) return;
  try {
    if (Date.now() > record.expiresAt) {
      removeReply(record);
      return await send(api, event, 'These results expired. Run the video command again.');
    }
    const input = String(event.body || '').trim();
    const choice = /^\d+$/.test(input) ? Number(input) : 0;
    if (choice < 1 || choice > record.link.length) return await send(api, event, `Reply with a number from 1 to ${record.link.length}.`);
    if (busy.has(String(event.senderID)) || busy.size >= 2) return await send(api, event, 'The bot is busy. Reply again shortly.');
    record.used = true; // Prevent duplicate replies from starting duplicate downloads.
    removeReply(record);
    await deliver(api, event, record.link[choice - 1]);
  } catch (error) { await report(api, event, error); }
};

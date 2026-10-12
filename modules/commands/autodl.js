const __l = require("../../includes/i18n");
const axios = require('axios');
if (axios && axios.defaults) axios.defaults.timeout = axios.defaults.timeout || 30000; // no request may hang forever
const fs = require('fs');
const path = require('path');
const getFBInfo = require("@xaviabot/fb-downloader");

module.exports.config = {
  name: "adown",
  version: "1.0",
  hasPermssion: 0,
  credits: "Jonell Magallanes",
  description: "Automatically download TikTok, Facebook, Instagram, and Pinterest videos",
  usePrefix: false,
  hide: true,
  commandCategory: "Media",
  usage: "[off]",
  cooldowns: 3,
};

const autodlPath = path.join(__dirname, 'autodl.json');

function loadAutodlSettings() {
  try {
    if (!fs.existsSync(autodlPath)) {
      const defaultSettings = {};
      fs.writeFileSync(autodlPath, JSON.stringify(defaultSettings, null, 2));
      return defaultSettings;
    }
    return JSON.parse(fs.readFileSync(autodlPath, 'utf8'));
  } catch (error) {
    console.error('Error loading autodl settings:', error);
    return {};
  }
}

function saveAutodlSettings(settings) {
  try {
    fs.writeFileSync(autodlPath, JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving autodl settings:', error);
    return false;
  }
}

module.exports.handleEvent = async function ({ api, event }) {
  if (event.body !== null && event.isGroup) {
    const settings = loadAutodlSettings();
    const threadId = event.threadID.toString();
    
    // Auto-download is enabled in every group unless explicitly turned off.
    if (settings[threadId] === false) return;
    
    const tiktokLinkRegex = /https:\/\/(www\.|vt\.|vm\.)?tiktok\.com\//;
    const facebookLinkRegex = /https:\/\/www\.facebook\.com\/\S+/;
    const instagramLinkRegex = /https:\/\/www\.instagram\.com\/(p|reel|stories)\/\S+/;
    const pinterestLinkRegex = /https:\/\/(www\.)?pinterest\.(com|ph)\/\S+|https:\/\/pin\.it\/\S+/;
    const link = event.body;
    
    if (tiktokLinkRegex.test(link)) {
      api.setMessageReaction("📥", event.messageID, () => { }, true);
      downloadAndSendTikTokContent(link, api, event);
    } else if (facebookLinkRegex.test(link)) {
      api.setMessageReaction("📥", event.messageID, () => { }, true);
      downloadAndSendFBContent(link, api, event);
    } else if (instagramLinkRegex.test(link)) {
      api.setMessageReaction("📥", event.messageID, () => { }, true);
      downloadAndSendInstagramContent(link, api, event);
    } else if (pinterestLinkRegex.test(link)) {
      api.setMessageReaction("📥", event.messageID, () => { }, true);
      downloadAndSendPinterestContent(link, api, event);
    }
  }
};

module.exports.run = async function ({ api, event, args }) {
  const settings = loadAutodlSettings();
  const threadId = event.threadID.toString();
  
  if (args[0] === 'off') {
    settings[threadId] = false;
    if (saveAutodlSettings(settings)) {
      return api.sendMessage(__l.t("m98"), event.threadID);
    } else {
      return api.sendMessage(__l.t("m99"), event.threadID);
    }
  } else {
    const status = settings[threadId] !== false ? __l.t("m100") : __l.t("m101");
    return api.sendMessage(__l.t("m102", [status]), event.threadID);
  }
};

const sendWait = (api, event, t) => new Promise(r => api.sendMessage(t, event.threadID, (e, i) => r(e ? null : i), event.messageID));
const edit = (api, event, t, i) => { if (i) api.editMessage(t, i.messageID, event.threadID); };

const downloadAndSendTikTokContent = async (url, api, event) => {
  const info = await sendWait(api, event, __l.t("m103"));
  try {
    const response = await axios.post(`https://www.tikwm.com/api/`, { url: url });
    const data = response.data.data;
    
    if (!data.play) {
      throw new Error(__l.t("m104"));
    }

    const videoResponse = await axios({
      method: 'get',
      url: data.play,
      responseType: 'stream'
    });

    edit(api, event, __l.t("m105", [data.title || 'No Title', data.digg_count || 0, data.author?.nickname || 'Unknown']), info);

    await api.sendMessage({
      attachment: videoResponse.data
    }, event.threadID, event.messageID);

  } catch (error) {
    console.error('TikTok API error:', error);
    edit(api, event, __l.t("m108"), info);
  }
};

const downloadAndSendFBContent = async (url, api, event) => {
  const info = await sendWait(api, event, __l.t("m103"));
  try {
    const result = await getFBInfo(url);
    
    if (!result.hd && !result.sd) {
      throw new Error(__l.t("m104"));
    }

    const videoUrl = result.hd || result.sd;
    
    const videoResponse = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream'
    });

    edit(api, event, __l.t("m109", [result.title || 'Facebook Video']), info);

    await api.sendMessage({
      attachment: videoResponse.data
    }, event.threadID, event.messageID);

  } catch (error) {
    console.error('Facebook API error:', error);
    edit(api, event, __l.t("m112"), info);

  }
};

const downloadAndSendInstagramContent = async (url, api, event) => {
  const info = await sendWait(api, event, __l.t("m103"));
  try {
    const response = await axios.get(`http://api.hutchingd.x10.mx/api/dl/insta.php?url=${encodeURIComponent(url)}`);
    const data = response.data;
    
    if (data.code !== 100000 || !data.data || !data.data.info || data.data.info.length === 0) {
      throw new Error(__l.t("m113"));
    }

    const mediaInfo = data.data.info[0];
    const videoUrl = mediaInfo.url;
    const mediaType = data.data.media_type === 'reel' ? 'Reel' : 'Post';

    if (!videoUrl) {
      throw new Error(__l.t("m104"));
    }

    const videoResponse = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream'
    });

    edit(api, event, __l.t("m114", [mediaType]), info);

    await api.sendMessage({
      attachment: videoResponse.data
    }, event.threadID, event.messageID);

  } catch (error) {
    console.error('Instagram API error:', error);
    edit(api, event, __l.t("m116"), info);
    
  }
};

const downloadAndSendPinterestContent = async (url, api, event) => {
  const info = await sendWait(api, event, __l.t("m103"));
  try {
    const response = await axios.get(`http://api.hutchingd.x10.mx/api/dl/pinterest.php?url=${encodeURIComponent(url)}`);
    const data = response.data;
    
    if (!data.download) {
      throw new Error(__l.t("m117"));
    }

    const videoResponse = await axios({
      method: 'get',
      url: data.download,
      responseType: 'stream'
    });

    edit(api, event, __l.t("m118", [data.title || 'Pinterest Video', data.size || 'Unknown']), info);

    await api.sendMessage({
      attachment: videoResponse.data
    }, event.threadID, event.messageID);

  } catch (error) {
    console.error('Pinterest API error:', error);
    edit(api, event, __l.t("m121"), info);
    
  }
};
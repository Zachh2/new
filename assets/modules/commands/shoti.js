const __l = require("../../includes/i18n");
const axios = require("axios");
if (axios && axios.defaults) axios.defaults.timeout = axios.defaults.timeout || 30000; // no request may hang forever
const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "shoti",
  version: "1.0.7",
  credits: "zycke",
  description: "Generate random tiktok girl videos",
  hasPermssion: 0,
  commandCategory: "media",
  usage: "[shoti]",
  cooldowns: 30,
  dependencies: [],
  usePrefix: true
};

module.exports.run = async function({ api, event }) {
  const cachePath = path.join(__dirname, "cache");
  const videoPath = path.join(cachePath, "shoti.mp4");

  if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(cachePath);
  }

  try {
    const loadingMsg = await api.sendMessage(__l.t("m310"), event.threadID);
    
    const res = await axios.get("https://betadash-shoti-yazky.vercel.app/shotizxx?apikey=shipazu");
    const videoUrl = res.data.shotiurl;

    if (!videoUrl) {
      return api.editMessage(__l.t("m839"), loadingMsg.messageID);
    }

    const response = await axios({
      url: videoUrl,
      method: "GET",
      responseType: "stream"
    });

    const writer = fs.createWriteStream(videoPath);
    response.data.pipe(writer);

    writer.on("finish", async () => {
      const message = {
        body: __l.t("m840", [res.data.username, res.data.nickname, res.data.region, res.data.duration]),
        attachment: fs.createReadStream(videoPath)
      };
      
      await api.sendMessage(message, event.threadID);
      api.unsendMessage(loadingMsg.messageID);
      
      fs.unlinkSync(videoPath);
    });

    writer.on("error", (err) => {
      console.error(err);
      api.editMessage(__l.t("m841"), loadingMsg.messageID);
    });

  } catch (err) {
    console.error(err);
    api.sendMessage(__l.t("m842"), event.threadID, event.messageID);
  }
};
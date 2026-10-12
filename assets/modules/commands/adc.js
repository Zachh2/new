const __l = require("../../includes/i18n");
module.exports.config = {
  name: "adc",
  version: "1.0.1",
  hasPermssion: 2,
  credits: "D-Jukie",
  description: "Apply code from buildtooldev and pastebin",
  usePrefix: true,
  commandCategory: "Admin",
  usages: "[reply or text]",
  cooldowns: 0,
  dependencies: {

  }
};
// Lolbakla
module.exports.run = async function({ api, event, args }) {
  const axios = require('axios');
  if (axios && axios.defaults) axios.defaults.timeout = axios.defaults.timeout || 30000; // no request may hang forever
  const fs = require('fs');
  const request = require('request');
  const cheerio = require('cheerio');
  const { join, resolve } = require("path");
  const { senderID, threadID, messageID, messageReply, type } = event;
  var name = args[0];
  if (type == "message_reply") {
    var text = messageReply.body;
  }
  if (!text && !name) return api.sendMessage(__l.t("m3"), threadID, messageID);
  const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, threadID, (e, i) => r(e ? null : i), messageID));
  const react = (e) => { try { api.setMessageReaction(e, messageID, () => {}, true); } catch (err) {} };
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ ADC " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, threadID); else api.sendMessage(o, threadID, messageID); react(b ? "❌" : "✅"); };
  react("⏳");
  const info = await sendWait(__l.t("m5"));
  if (!text && name) {
    var data = fs.readFile(
      `${__dirname}/${args[0]}.js`,
      "utf-8",
      async (err, data) => {
        if (err) return edit(__l.t("m6", [args[0]]), info);
        const { PasteClient } = require('pastebin-api')
        const client = new PasteClient("aeGtA7rxefvTnR3AKmYwG-jxMo598whT");
        async function pastepin(name) {
          const url = await client.createPaste({
            code: data,
            expireDate: 'N',
            format: "javascript",
            name: name,
            publicity: 1
          });
          var id = url.split('/')[3]
          return 'https://pastebin.com/raw/' + id
        }
        var link = await pastepin(args[1] || 'noname')
        return edit(link, info);
      }
    );
    return
  }
  var urlR = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/
  var url = text.match(urlR);
  if (url[0].indexOf('pastebin') !== -1) {
    axios.get(url[0]).then(i => {
      var data = i.data
      fs.writeFile(
        `${__dirname}/${args[0]}.js`,
        data,
        "utf-8",
        function(err) {
          if (err) return edit(`An error occurred while applying the code ${args[0]}.js`, info);
          edit(__l.t("m7", [args[0]]), info);
        }
      );
    })
  }

  if (url[0].indexOf('buildtool') !== -1 || url[0].indexOf('tinyurl.com') !== -1) {
    const options = {
      method: 'GET',
      url: messageReply.body
    };
    request(options, function(error, response, body) {
      if (error) return edit(__l.t("m8"), info);
      const load = cheerio.load(body);
      load('.language-js').each((index, el) => {
        if (index !== 0) return;
        var code = el.children[0].data
        fs.writeFile(`${__dirname}/${args[0]}.js`, code, "utf-8",
          function(err) {
            if (err) return edit(__l.t("m9", [args[0]]), info);
            return edit(__l.t("m10", [args[0]]), info);
          }
        );
      });
    });
    return
  }
  if (url[0].indexOf('drive.google') !== -1) {
    var id = url[0].match(/[-\w]{25,}/)
    const path = resolve(__dirname, `${args[0]}.js`);
    try {
      await utils.downloadFile(`https://drive.google.com/u/0/uc?id=${id}&export=download`, path);
      return edit(__l.t("m11", [args[0]]), info);
    }
    catch (e) {
      return edit(__l.t("m9", [args[0]]), info);
    }
  }
}
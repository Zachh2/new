const __l = require("../../includes/i18n");
const fs = require("fs");

module.exports.config = {
  name: "sim",
  version: "1.1.0",
  hasPermssion: 0,
  credits: "Yan Maglinte",
  description: "Engage in conversation with Sim!",
  usePrefix: false,
  commandCategory: "chatbots",
  usages: "Chat with sim",
  cooldowns: 2,
};

/** *
Check cache/DAN/readme.md for usage instructions.
** */

module.exports.run = async function ({ api, event, args }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ SIM " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m846"));

  const { messageID, threadID, senderID } = event;
  const content = args.join(" ");
  if (!args[0]) return __edit(__l.t("m847"), __info);

  try {
    const jsonFile = fs.readFileSync(__dirname + "/cache/DAN/dan.json", "utf-8");
    const responses = JSON.parse(jsonFile);
    let respond = responses[content.toLowerCase()];

    if (content.startsWith("add = ")) {
      const switchCase = content.substring(6).toLowerCase();
      if (!global.config.ADMINBOT.includes(senderID)) {
        respond = __l.t("m849");
      } else {
        if (switchCase === "on") {
          respond = __l.t("m850");
          if (typeof global.config.ADD_FUNCTION !== "undefined")
            global.config.ADD_FUNCTION = true;
          else
            console.log(__l.t("m851"));
        } else if (switchCase === "off") {
          respond = __l.t("m852");
          if (typeof global.config.ADD_FUNCTION !== "undefined")
            global.config.ADD_FUNCTION = false;
          else
            console.log(__l.t("m851"));
        }
      }
    } else if (content.startsWith("del = ")) {
      const switchCase = content.substring(6).toLowerCase();
      if (!global.config.ADMINBOT.includes(senderID)) {
        respond = __l.t("m854");
      } else {
        if (switchCase === "on") {
          respond = __l.t("m855");
          if (typeof global.config.DEL_FUNCTION !== "undefined")
            global.config.DEL_FUNCTION = true;
          else
            console.log(__l.t("m851"));
        } else if (switchCase === "off") {
          respond = __l.t("m856");
          if (typeof global.config.DEL_FUNCTION !== "undefined")
            global.config.DEL_FUNCTION = false;
          else
            console.log(__l.t("m851"));
        }
      }
    } else if (content.includes("=!")) {
      const [word, response] = content.split("=!").map((item) => item.trim());
      const lowercaseWord = word.toLowerCase();
      if (!global.config.DEL_FUNCTION) {
        respond = __l.t("m857");
      } else {
        if (responses[lowercaseWord]) {
          if (response) {
            const index = responses[lowercaseWord].indexOf(response);
            if (index !== -1) {
              responses[lowercaseWord].splice(index, 1);
              if (responses[lowercaseWord].length === 0) {
                delete responses[lowercaseWord];
              }
              fs.writeFileSync(__dirname + "/cache/DAN/dan.json", JSON.stringify(responses, null, 4), "utf-8");
              respond = __l.t("m858", [response, word]);
            } else {
              respond = __l.t("m859", [response, word]);
            }
          } else {
            delete responses[lowercaseWord];
            fs.writeFileSync(__dirname + "/cache/DAN/dan.json", JSON.stringify(responses, null, 4), "utf-8");
            respond = __l.t("m860", [word]);
          }
        } else {
          respond = __l.t("m861", [word]);
        }
      }
    } else if (content.includes("=>")) {
      const [word, ...responseArray] = content.split("=>").map((item) => item.trim());

      const response = responseArray.join("=>").trim();
      if (!global.config.ADD_FUNCTION) {
        respond = __l.t("m862");
      } else {
        if (word && response) {
          const lowercaseWord = word.toLowerCase();
          if (responses[lowercaseWord]) {
            if (!responses[lowercaseWord].includes(response)) {
              responses[lowercaseWord].push(response);
            }
          } else {
            responses[lowercaseWord] = [response];
          }
          fs.writeFileSync(__dirname + "/cache/DAN/dan.json", JSON.stringify(responses, null, 4), "utf-8");
          respond = __l.t("m863", [word, response]);
        }
      }
    }

    if (Array.isArray(respond)) {
      const randomIndex = Math.floor(Math.random() * respond.length);
      respond = respond[randomIndex];
    } else if (!respond) {
      respond = __l.t("m864");
    }

    __edit(respond, __info);
  } catch (error) {
    console.error(error);
    __edit(__l.t("m865"), __info);
  }
};

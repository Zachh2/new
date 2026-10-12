const __l = require("../../includes/i18n");
module.exports.config = {
  name: "bratex",
  version: "3.0.0",
  hasPermssion: 0,
  credits: "dev + Zycke fix",
  description: "Generate brat text or video",
  usePrefix: true,
  commandCategory: "media",
  usages: "[video/text] [message]",
  cooldowns: 10
};

module.exports.run = async function ({ api, event, args }) {
  const axios = require("axios");
  const fs = global.nodemodule["fs-extra"];
  const path = require("path");

  const { threadID, messageID } = event;

  const type = args[0]?.toLowerCase();

  const text = args.slice(1).join(" ").trim();

  if (!type || !["video", "text"].includes(type)) {
    return api.sendMessage(
__l.t("m200"),
      threadID,
      messageID
    );
  }

  if (!text) {
    return api.sendMessage(
__l.t("m201"),
      threadID,
      messageID
    );
  }


  api.sendMessage(
__l.t("m202", [type.toUpperCase()]),
    threadID,
    async (err, info) => {

      const encoded = encodeURIComponent(text);

      try {

        // VIDEO API
        if (type === "video") {

          const url =
          `https://api.ferdev.my.id/maker/bratvid?text=${encoded}&apikey=lain-lain`;

          const file = path.join(
            __dirname,
            "cache",
            `brat_${Date.now()}.mp4`
          );


          await fs.ensureDir(
            path.dirname(file)
          );


          const res = await axios({
            url,
            method: "GET",
            responseType: "stream",
            timeout: 60000
          });


          const writer = fs.createWriteStream(file);

          res.data.pipe(writer);


          writer.on("finish", () => {

            api.editMessage(
__l.t("m203"),
              info.messageID,
              threadID
            );


            api.sendMessage(
              {
                body: __l.t("m204", [text]),
                attachment: fs.createReadStream(file)
              },
              threadID,
              () => {
                if (fs.existsSync(file))
                  fs.unlinkSync(file);
              },
              messageID
            );

          });

        }


        // TEXT API
        else if (type === "text") {

          const url =
          `https://smfahim.xyz/maker/brat/v2?text=${encoded}`;


          const res = await axios.get(url, {
            responseType: "arraybuffer"
          });


          const file = path.join(
            __dirname,
            "cache",
            `brat_${Date.now()}.png`
          );


          await fs.ensureDir(
            path.dirname(file)
          );


          fs.writeFileSync(
            file,
            Buffer.from(res.data)
          );


          api.editMessage(
__l.t("m205"),
            info.messageID,
            threadID
          );


          api.sendMessage(
            {
              body: __l.t("m206", [text]),
              attachment: fs.createReadStream(file)
            },
            threadID,
            () => {
              if (fs.existsSync(file))
                fs.unlinkSync(file);
            },
            messageID
          );

        }


      } catch (e) {

        console.error(
          "BRAT ERROR:",
          e.response?.data || e.message
        );


        api.editMessage(
__l.t("m208"),
          info.messageID,
          threadID
        );

      }

    }
  );
};
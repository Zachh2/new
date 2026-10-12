const __l = require("../../includes/i18n");
const fs = require('fs');

module.exports.config = {
    name: "restart",
    hasPermssion: 2,
    description: "Restarts the bot",
    usePrefix: true, 
    commandCategory: "System",
    usages: "restart",
        hide: true,
    cooldowns: 20,
};
    module.exports.run = async function ({ api, event }) {
        const threadID = event.threadID;

        console.log(`Restarting command from thread ${threadID}`);

        const data = {
            threadID: threadID
        };

        fs.writeFile('./threadID.json', JSON.stringify(data), (err) => {
            if (err) {
                console.error("Failed to save threadID:", err);
                return;
            }
            console.log("ThreadID saved to threadID.json");

            setTimeout(() => {
                fs.unlink('./threadID.json', (err) => {
                    if (err) {
                        console.error("Failed to delete threadID.json:", err);
                        return;
                    }
                    console.log("threadID.json deleted");
                });
            }, 5000);
        });

        api.sendMessage(__l.t("m793"), threadID, (err) => {
            if (err) {
                console.error("Failed to send restart message:", err);
            } else {
                process.exit(1);
            }
        });
    };
const __l = require("../../includes/i18n");
const fs = require('fs');
const path = require('path');

// Random quotes array
const randomQuotes = [
    "Knowledge is power.",
    "Simplicity is the ultimate sophistication.",
    "Code is like humor. When you have to explain it, it’s bad.",
    "Stay hungry, stay foolish."
];


module.exports.config = {
    name: "help2",
    hasPermssion: 0,
    version: "1.0.0",
    credits: "zach",
    description: "Beginner's guide",
    usePrefix: true,
    commandCategory: "System",
    usages: "[command name] or [all] or [page number]",
    cooldowns: 5
};

module.exports.run = async function({ api, event, args, prefix }) {
    const lang = __l.language(event.threadID);
    const t = (key, values = []) => __l.t(key, values, lang);
    prefix = prefix || global.config.PREFIX;
    const randomQuote = __l.translate(randomQuotes[Math.floor(Math.random() * randomQuotes.length)], lang);
    const sendWait = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, event.threadID, (e, i) => r(e ? null : i), event.messageID));
    const react = (e) => { try { api.setMessageReaction(e, event.messageID, () => {}, true); } catch (err) {} };
    const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ HELP " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
    const edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|too large/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, event.threadID); else api.sendMessage(o, event.threadID, event.messageID); react(b ? "❌" : "✅"); };
    react("⏳");
    const info = await sendWait(t("m479"));

    try {
        const commands = [...global.client.commands.values()].filter(command => command.config?.name).map(command => ({
            name: command.config.name,
            description: command.config.descriptionKey ? t(command.config.descriptionKey) : __l.commandDescription(command, event.threadID),
            usages: command.config.usagesKey ? t(command.config.usagesKey) : __l.translate(command.config.usages || 'No usage specified', lang),
            version: command.config.version || '1.0.0',
            credits: command.config.credits || 'Unknown',
            category: __l.translate(command.config.commandCategory || 'General', lang),
            cooldown: command.config.cooldowns || 5
        }));

        if (commands.length === 0) {
            return edit(t("m510"), info);
        }

        commands.sort((a, b) => a.name.localeCompare(b.name));

        // Default: show page 1
        if (!args[0]) {
            const page = 1;
            const perPage = 10;
            const totalPages = Math.ceil(commands.length / perPage);
            const start = (page - 1) * perPage;
            const end = start + perPage;
            const pageCommands = commands.slice(start, end);

            let helpText = t("m511");
            pageCommands.forEach((cmd, i) => {
                helpText += t("m512", [prefix, start + i + 1, cmd.name, cmd.description]);
            });

            helpText += t("m513", [page, totalPages]);
            helpText += t("m514", [prefix, totalPages]);
            helpText += t("m515", [prefix]);
            helpText += t("m516", [prefix]);
            helpText += t("m517", [randomQuote]);

            return edit(helpText, info);
        }

        // Page navigation
        if (!isNaN(args[0])) {
            const page = parseInt(args[0]);
            const perPage = 10;
            const totalPages = Math.ceil(commands.length / perPage);

            if (page < 1 || page > totalPages) {
                return edit(t("m518", [totalPages]), info);
            }

            const start = (page - 1) * perPage;
            const end = start + perPage;
            const pageCommands = commands.slice(start, end);

            let helpText = t("m511");
            pageCommands.forEach((cmd, i) => {
                helpText += t("m512", [prefix, start + i + 1, cmd.name, cmd.description]);
            });

            helpText += t("m513", [page, totalPages]);
            helpText += t("m516", [prefix]);
            helpText += t("m517", [randomQuote]);

            return edit(helpText, info);
        }

        // Command details
        if (args[0].toLowerCase() !== 'all') {
            const cmdName = args[0].toLowerCase();
            const command = commands.find(c => c.name.toLowerCase() === cmdName);

            if (command) {
                let detail = t("m519");
                detail += t("m520", [command.name]);
                detail += t("m521", [command.version]);
                detail += t("m522", [command.category]);
                detail += t("m523", [command.description]);
                detail += t("m524", [prefix, command.usages]);
                detail += t("m525", [command.credits]);
                detail += t("m526", [command.cooldown]);
                detail += t("m517", [randomQuote]);

                return edit(detail, info);
            } else {
                return edit(t("m527", [args[0]]), info);
            }
        }

        // Show all commands
        if (args[0].toLowerCase() === 'all') {
            let helpText = t("m528");
            commands.forEach((cmd, i) => {
                helpText += t("m512", [prefix, i + 1, cmd.name, cmd.description]);
            });

            helpText += t("m529", [commands.length]);
            helpText += t("m516", [prefix]);
            helpText += t("m517", [randomQuote]);

            return edit(helpText, info);
        }

    } catch (error) {
        console.error(error);
        edit(t("m530"), info);
    }
};

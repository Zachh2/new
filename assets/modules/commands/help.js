const __l = require("../../includes/i18n");
const fs = require('fs');
const path = require('path');
const now = new Date();

const optionsTime = {
  timeZone: 'Asia/Manila',
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
};

const optionsDate = {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
};

const optionsDay = {
  timeZone: 'Asia/Manila',
  weekday: 'long'
};

const time = now.toLocaleTimeString('en-GB', optionsTime);
const date = now.toLocaleDateString('en-GB', optionsDate);


module.exports.config = {
    name: "help",
    hasPermssion: 0,
    version: "1.0.0",
    credits: "Jonell Magallanes",
    description: "Show available commands",
    usePrefix: true,
    commandCategory: "System",
    usages: "[command name] or [all] or [page number]",
    cooldowns: 5
};

module.exports.run = async function({ api, event, args }) {
    const lang = __l.language(event.threadID);
    const t = (key, values = []) => __l.t(key, values, lang);
    const weekday = now.toLocaleDateString('en-US', optionsDay);
    const weekdayNames = {
        tl: ['Linggo', 'Lunes', 'Martes', 'Miyerkules', 'Huwebes', 'Biyernes', 'Sabado'],
        ilo: ['Domingo', 'Lunes', 'Martes', 'Mierkoles', 'Huebes', 'Biernes', 'Sabado'],
        ceb: ['Dominggo', 'Lunes', 'Martes', 'Miyerkules', 'Huwebes', 'Biyernes', 'Sabado'],
        hil: ['Domingo', 'Lunes', 'Martes', 'Miyerkules', 'Huwebes', 'Biyernes', 'Sabado']
    };
    const day = weekdayNames[__l.language(event.threadID)]?.[['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(weekday)] || weekday;
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
            return edit(t("m482"), info);
        }

        commands.sort((a, b) => a.name.localeCompare(b.name));

        // If no args or just "help" - show page 1 by default
        if (!args[0] || args[0].toLowerCase() === 'help') {
            const page = 1;
            const commandsPerPage = 10;
            const totalPages = Math.ceil(commands.length / commandsPerPage);
            const startIndex = (page - 1) * commandsPerPage;
            const endIndex = startIndex + commandsPerPage;
            const pageCommands = commands.slice(startIndex, endIndex);

           let helpText = t("m483", [global.config.PREFIX]);

pageCommands.forEach((cmd, index) => {
    helpText += t("m484", [startIndex + index + 1, cmd.name, cmd.description, cmd.cooldown, cmd.category]);
});

helpText += t("m485", [day, date, time]);

            helpText += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            helpText += t("m486", [commands.length]);
            helpText += t("m487", [global.config.PREFIX, totalPages]);
            helpText += t("m488", [global.config.PREFIX]);
            helpText += t("m489", [global.config.PREFIX]);

            return edit(helpText, info);
        }

        if (args[0] && !isNaN(args[0])) {
            const page = parseInt(args[0]);
            const commandsPerPage = 10;
            const totalPages = Math.ceil(commands.length / commandsPerPage);
            
            if (page < 1 || page > totalPages) {
                return edit(t("m490", [totalPages]), info);
            }

            const startIndex = (page - 1) * commandsPerPage;
            const endIndex = startIndex + commandsPerPage;
            const pageCommands = commands.slice(startIndex, endIndex);

           let helpText = t("m483", [global.config.PREFIX]);

pageCommands.forEach((cmd, index) => {
    helpText += t("m484", [startIndex + index + 1, cmd.name, cmd.description, cmd.cooldown, cmd.category]);
});

helpText += t("m485", [day, date, time]);

            helpText += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            helpText += t("m486", [commands.length]);
            helpText += t("m487", [global.config.PREFIX, totalPages]);
            helpText += t("m491", [global.config.PREFIX]);

            return edit(helpText, info);
        }

        if (args[0] && args[0].toLowerCase() !== 'all') {
            const cmdName = args[0].toLowerCase();
            const command = commands.find(cmd => cmd.name && cmd.name.toLowerCase() === cmdName);
            
            if (command) {
                let commandInfo = t("m492");   // was const - every += below threw
                commandInfo += '━━━━━━━━━━━━━━━━━━━━━━\n\n';
                commandInfo += t("m493", [command.name]);
                commandInfo += t("m494", [command.description]);
                commandInfo += t("m495", [command.category]);
                commandInfo += t("m496", [command.version]);
                commandInfo += t("m497", [command.credits]);
                commandInfo += t("m498", [command.cooldown]);
                commandInfo += t("m499", [global.config.PREFIX, command.usages]);
                commandInfo += `━━━━━━━━━━━━━━━━━━━━━━`;

                return edit(commandInfo, info);
            } else {
                return edit(t("m500", [args[0], global.config.PREFIX]), info);
            }
        }

        if (args[0] && args[0].toLowerCase() === 'all') {
            let helpText = t("m501");
            helpText += '━━━━━━━━━━━━━━━━━━━━━━\n\n';

            commands.forEach((cmd, index) => {
                helpText += `🔹 ${index + 1}. ${cmd.name}\n   📝 ${cmd.description}\n\n`;
            });

            helpText += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            helpText += t("m486", [commands.length]);
            helpText += t("m491", [global.config.PREFIX]);

            return edit(helpText, info);
        }
        
    } catch (error) {
        console.error(error);
        edit(t("m502"), info);
    }
};

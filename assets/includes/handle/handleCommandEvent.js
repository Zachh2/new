module.exports = function ({ api, models, Users, Threads, Currencies, ...rest }) {
    const logger = require("../../utils/log.js")
    return async function ({ event, ...rest2 }) {
        const { allowInbox } = global.config;
        const { userBanned, threadBanned } = global.data;
        const { commands, eventRegistered } = global.client;
        var { senderID, threadID } = event;
        var senderID = String(senderID);
        var threadID = String(threadID);
        if (userBanned.has(senderID) || threadBanned.has(threadID) || allowInbox == !![] && senderID == threadID) return;
        // Reloaded modules can leave duplicate names in this registry.
        for (const eventReg of new Set(eventRegistered)) {
            const cmd = commands.get(eventReg);
            if (!cmd || typeof cmd.handleEvent !== 'function') continue;
            const getText2 = require("../i18n").commandText(cmd, threadID);
            try {
                const Obj = {
                    ...rest,
                    ...rest2
                };
                Obj.event = event 
                Obj.api = api
                Obj.models = models
                Obj.Users = Users
                Obj.Threads = Threads 
                Obj.Currencies = Currencies 
                Obj.getText = getText2;
                
                if (cmd) await cmd.handleEvent(Obj);
            } catch (error) {
                logger.log(global.getText('handleCommandEvent', 'moduleError', cmd.config.name), 'error');
            }
        }
    };
};

module.exports = function ({ api, models, Users, Threads, Currencies, ...rest }) {
    return async function ({ event, ...rest2 }) {
        const { handleReaction, commands } = global.client;
        const { messageID, threadID } = event;
        if (handleReaction.length !== 0) {
            const indexOfHandle = handleReaction.findIndex(e => e.messageID == messageID);
            if (indexOfHandle < 0) return;
            const indexOfMessage = handleReaction[indexOfHandle];
            const handleNeedExec = commands.get(indexOfMessage.name);

            if (!handleNeedExec) return api.sendMessage(global.getText('handleReaction', 'missingValue'), threadID, messageID);
            try {
                const getText2 = require("../i18n").commandText(handleNeedExec, threadID);
                const Obj = {
                    ...rest,
                    ...rest2
                };
                Obj.api= api 
                Obj.event = event 
                Obj.models = models
                Obj.Users = Users
                Obj.Threads = Threads
                Obj.Currencies = Currencies
                Obj.handleReaction = indexOfMessage
                Obj.models= models 
                Obj.getText = getText2
                await handleNeedExec.handleReaction(Obj);
                return;
            } catch (error) {
                return api.sendMessage(global.getText('handleReaction', 'executeError', error), threadID, messageID);
            }
        }
    };
};

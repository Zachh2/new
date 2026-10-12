module.exports = function ({ api, models, Users, Threads, Currencies, ...rest }) {
    return async function ({ event, ...rest2 }) {
        if (!event.messageReply) return;
        const { handleReply, commands } = global.client
        const { messageID, threadID, messageReply } = event;
        if (handleReply.length !== 0) {
            const indexOfHandle = handleReply.findIndex(e => e.messageID == messageReply.messageID);
            if (indexOfHandle < 0) return;
            const indexOfMessage = handleReply[indexOfHandle];
            const handleNeedExec = commands.get(indexOfMessage.name);
            if (!handleNeedExec) return api.sendMessage(global.getText('handleReply', 'missingValue'), threadID, messageID);
            try {
                const getText2 = require("../i18n").commandText(handleNeedExec, threadID);
                const Obj = {
                    ...rest,
                    ...rest2
                };
                Obj.api = api
                Obj.event = event 
                Obj.models = models
                Obj.Users = Users
                Obj.Threads = Threads 
                Obj.Currencies = Currencies
                Obj.handleReply = indexOfMessage
                Obj.models = models
                Obj.getText = getText2
                await handleNeedExec.handleReply(Obj);
                return;
            } catch (error) {
                return api.sendMessage(global.getText('handleReply', 'executeError', error), threadID, messageID);
            }
        }
    };
}

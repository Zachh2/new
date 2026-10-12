
// Migration: lock old and new groups until they start the bot

let threadData = await Threads.getData(threadID);

if (threadData.botStarted === undefined) {
    await Threads.setData(threadID, {
        ...threadData,
        botStarted: false,
        language: null
    });
}

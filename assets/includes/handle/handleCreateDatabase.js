module.exports = function ({ Users, Threads }) {
    const logger = require("../../utils/log.js");
    const fs = require("fs-extra");
    const path = require("path");

    // NOTE: the previous version did:
    //   const threads = require('../database/data/threadsData.json')
    // require() caches JSON at load time, so that object was a snapshot taken
    // when the bot started and never changed. Any group added afterwards was
    // missing from it forever, so the participant-sync below could never run
    // and new threads showed no data in the dashboard.
    const THREADS_PATH = path.join(__dirname, "..", "database", "data", "threadsData.json");
    const USERS_PATH   = path.join(__dirname, "..", "database", "data", "usersData.json");

    // small TTL cache so we re-read from disk without hitting it on every message
    let _t = { data: {}, at: 0 };
    let _u = { data: {}, at: 0 };
    const TTL = 5000;
    const refreshing = new Set();
    const retryAfter = new Map();

    function readJSON(file, slot) {
        const now = Date.now();
        if (now - slot.at < TTL) return slot.data;
        try {
            const raw = fs.readFileSync(file, "utf8").trim();
            slot.data = raw ? JSON.parse(raw) : {};
        } catch (e) {
            // keep the last good copy rather than wiping it
        }
        slot.at = now;
        return slot.data;
    }

    return async function ({ event }) {
        const { allUserID, allThreadID } = global.data;
        const { autoCreateDB } = global.config;
        if (autoCreateDB === false) return;

        const senderID = String(event.senderID);
        const threadID = String(event.threadID);

        try {
            const threads = readJSON(THREADS_PATH, _t);
            const users   = readJSON(USERS_PATH, _u);

            // ---- new group ----
            if (event.isGroup === true && !allThreadID.includes(threadID) && !threads[threadID]) {
                allThreadID.push(threadID);
                await Threads.createData(threadID);
                _t.at = 0;   // force a re-read so the block below sees it immediately
                logger.log(global.getText('handleCreateDatabase', 'newThread', threadID), 'DATABASE');
            }

            // ---- keep participant list current ----
            // reads fresh data, so this now works for groups added after startup
            const tdata = readJSON(THREADS_PATH, _t)[threadID];
            // An inactive new group may already have a minimal record for
            // onboarding. Fill its member/admin information after activation.
            if (event.isGroup === true && tdata?.threadInfo &&
                (!Array.isArray(tdata.threadInfo.participantIDs) || !Array.isArray(tdata.threadInfo.adminIDs)) &&
                !refreshing.has(threadID) && Date.now() >= (retryAfter.get(threadID) || 0)) {
                // Refresh incomplete onboarding records without holding up the
                // member's command while Facebook returns group information.
                refreshing.add(threadID);
                void Promise.resolve().then(async () => {
                    const fresh = await Threads.getInfo(threadID);
                    if (!fresh || !Array.isArray(fresh.adminIDs) || !Array.isArray(fresh.participantIDs)) {
                        retryAfter.set(threadID, Date.now() + 30000);
                        return;
                    }
                    const merged = { ...tdata.threadInfo, ...fresh };
                    await Threads.setData(threadID, { threadInfo: merged });
                    global.data.threadInfo.set(threadID, merged);
                    if (!allThreadID.includes(threadID)) allThreadID.push(threadID);
                    _t.at = 0;
                    retryAfter.delete(threadID);
                }).catch(err => {
                    retryAfter.set(threadID, Date.now() + 30000);
                    console.error('Group info refresh:', err.message);
                }).finally(() => refreshing.delete(threadID));
            }
            if (tdata && tdata.threadInfo && Array.isArray(tdata.threadInfo.participantIDs)) {
                if (!tdata.threadInfo.participantIDs.includes(senderID)) {
                    tdata.threadInfo.participantIDs.push(senderID);
                    await Threads.setData(threadID, { threadInfo: tdata.threadInfo });
                    _t.at = 0;
                    logger.log('Added participant ' + senderID + ' to ' + threadID, 'ADD DATA');
                }
            }

            // ---- new user ----
            if (!allUserID.includes(senderID) && !users[senderID]) {
                allUserID.push(senderID);
                await Users.createData(senderID);
                _u.at = 0;
                logger.log(global.getText('handleCreateDatabase', 'newUser', senderID), 'DATABASE');
            }

        } catch (err) {
            console.log("handleCreateDatabase:", err.message);
        }
    };
}

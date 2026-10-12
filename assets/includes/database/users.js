// All factories share one user cache; stale module instances must not erase streaks.
let sharedUsersData;
module.exports = function ({ api }) {
    const fsx = require("fs-extra");

    // Atomic write: a plain writeFileSync that is interrupted (crash, container
    // restart, out-of-disk) leaves a truncated JSON file and the whole database
    // is gone. Writing to a temp file and renaming makes the swap all-or-nothing.
    function safeWriteJSON(file, obj) {
        const fsx = require("fs-extra");
        const tmp = file + ".tmp";
        const out = JSON.stringify(obj, null, 4);
        if (!out || out.length < 2) return;            // never write empty/garbage
        let fd;
        try {
            fd=fsx.openSync(tmp,'w',0o600);
            fsx.writeFileSync(fd,out);fsx.fsyncSync(fd);fsx.closeSync(fd);fd=undefined;
            fsx.renameSync(tmp,file);
        } finally {
            if(fd!==undefined)fsx.closeSync(fd);
            try { fsx.unlinkSync(tmp); } catch (error) { if(error.code!=='ENOENT')throw error; }
        }
    }

    var path = __dirname + "/data/usersData.json";

    if (!fsx.existsSync(path)) fsx.writeFileSync(path, '{}');
    // A corrupt database must be reported, never silently replaced.
    var usersData = sharedUsersData || JSON.parse(fsx.readFileSync(path, 'utf8'));
    if (!usersData || typeof usersData !== 'object' || Array.isArray(usersData))
        throw new Error('Invalid usersData.json');
    sharedUsersData = usersData;

    async function saveData(data) {
        try {
            if (!data) throw new Error('Data cannot be left blank');
            safeWriteJSON(path, data);
            return true
        } catch (error) {
            return false
        }
    }

    async function getInfo(id) {
        return (await api.getUserInfo(id))[id];
    }

    async function getNameUser(userID) {
        // This used to call api.getUserInfo() and then throw the answer away,
        // returning "User ID: <id>" regardless - one wasted request to Facebook
        // every single time it ran. Use what we already have, and only ask
        // Facebook when the name is genuinely unknown.
        try {
            if (!userID) throw new Error("User ID cannot be blank");
            if (isNaN(userID)) throw new Error("Invalid user ID");

            const cached = global.data.userName.get(String(userID));
            if (cached) return cached;

            const info = await api.getUserInfo(userID);
            const name = info && info[userID] && info[userID].name;
            if (name) {
                global.data.userName.set(String(userID), name);
                return name;
            }
            return `Facebook user`;
        } catch (error) {
            return `Facebook user`
        }
    }

    async function getUserFull(id) {
        var resolveFunc = function () { };
        var rejectFunc = function () { };
        var returnPromise = new Promise(function (resolve, reject) {
            resolveFunc = resolve;
            rejectFunc = reject;
        });
        try {
            api.httpGet(`https://graph.facebook.com/${id}?fields=email,about,birthday,link&access_token=${global.account.accessToken}`, (e, i) => {
                if (e) return rejectFunc(e)
                var t = JSON.parse(i);
                var dataUser = {
                    error: 0,
                    author: 'D-Jukie',
                    data: {
                        uid: t.id || null,
                        about: t.about || null,
                        link: t.link || null,
                        imgavt: `https://graph.facebook.com/${t.id}/picture?height=1500&width=1500&access_token=1073911769817594|aa417da57f9e260d1ac1ec4530b417de`
                    }
                };
                return resolveFunc(dataUser)
            });
            return returnPromise
        } catch (error) {
            return resolveFunc({
                error: 1,
                author: 'D-Jukie',
                data: {}
            })
        }
    }

    async function getAll(keys, callback) {
        try {
            if (!keys) {
                if (Object.keys(usersData).length == 0) return [];
                else if (Object.keys(usersData).length > 0) {
                    var db = [];
                    for (var i of Object.keys(usersData)) db.push(usersData[i]);
                    return db;
                }
            }
            if (!Array.isArray(keys)) throw new Error("The input parameter must be an array");
            const data = [];
            for (var userID in usersData) {
                var database = {
                    ID: userID
                };
                var userData = usersData[userID];
                for (var i of keys) database[i] = userData[i];
                data.push(database);
            }
            if (callback && typeof callback == "function") callback(null, data);
            return data;
        } catch (error) {
            if (callback && typeof callback == "function") callback(error, null);
            return false
        }
    }

    async function getData(userID, callback) {
        try {
            if (!userID) throw new Error("User ID cannot be blank");
            if (isNaN(userID)) throw new Error("Invalid user ID");
            if (!usersData.hasOwnProperty(userID)) await createData(userID, (error, info) => {
                return info;
            });
            const data = usersData[userID];
            // Records created before the name was known (or after a wipe) had
            // no "name", so commands printed "- undefined". Fill it in from
            // what the bot already knows, and remember it.
            if (data && typeof data === "object" && !data.name) {
                const known = global.data.userName.get(String(userID));
                if (known) data.name = known;
                else {
                    const fetched = await getNameUser(userID);
                    if (fetched && !/^facebook user$/i.test(fetched)) data.name = fetched;
                }
            }
            if (callback && typeof callback == "function") callback(null, data);
            return data;
        } catch (error) {
            if (callback && typeof callback == "function") callback(error, null);
            return false
        }
    }

    async function setData(userID, options, callback) {
        try {
            if (!userID) throw new Error("User ID cannot be blank");
            if (isNaN(userID)) throw new Error("Invalid user ID");
            if (!userID) throw new Error("userID cannot be empty");
            if (global.config.autoCreateDB) {
                if (!usersData.hasOwnProperty(userID)) throw new Error(`User ID: ${userID} does not exist in Database`);
            }
            if (typeof options != 'object') throw new Error("The options parameter passed must be an object");
            const previous = usersData[userID];
            usersData[userID] = { ...previous, ...options, ...(previous?.streaks ? { streaks: previous.streaks } : {}) };
            if (!await saveData(usersData)) {
                if (previous === undefined) delete usersData[userID];
                else usersData[userID] = previous;
                throw new Error('Could not save user data');
            }
            if (callback && typeof callback == "function") callback(null, usersData[userID]);
            return usersData[userID];
        } catch (error) {
            if (callback && typeof callback == "function") callback(error, null);
            return false
        }
    }

    async function delData(userID, callback) {
        try {
            if (!userID) throw new Error("User ID cannot be blank");
            if (isNaN(userID)) throw new Error("Invalid user ID");
            if (global.config.autoCreateDB) {
                if (!usersData.hasOwnProperty(userID)) throw new Error(`User ID: ${userID} does not exist in Database`);
            }
            const previous = usersData[userID];
            delete usersData[userID];
            if (!await saveData(usersData)) {
                usersData[userID] = previous;
                throw new Error('Could not delete user data');
            }
            if (callback && typeof callback == "function") callback(null, usersData);
            return usersData;
        } catch (error) {
            if (callback && typeof callback == "function") callback(error, null);
            return false
        }
    }

    async function createData(userID, callback) {
        try {
            if (!userID) throw new Error("User ID cannot be blank");
            if (isNaN(userID)) throw new Error("Invalid user ID");
            if (usersData.hasOwnProperty(userID)) return false
            var data = {
                [userID]: {
                    userID: userID,
                    money: 0,
                    exp: 0,
                    createTime: {
                        timestamp: Date.now()
                    },
                    data: {
                        timestamp: Date.now()
                    },
                    lastUpdate: Date.now()
                }
            }
            Object.assign(usersData, data);
            if (!await saveData(usersData)) {
                delete usersData[userID];
                throw new Error('Could not create user data');
            }
            if (callback && typeof callback == "function") callback(null, data);
            return data;
        } catch (error) {
            if (callback && typeof callback == "function") callback(error, null);
            return false
        }
    }

    function streakIDs(userID, threadID) {
        if (!/^\d+$/.test(String(userID)) || !/^\d+$/.test(String(threadID)))
            throw new Error('Invalid streak user/thread ID');
    }
    function getStreak(userID, threadID) {
        streakIDs(userID, threadID);
        const value = usersData[String(userID)]?.streaks?.[String(threadID)];
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }
    function transactStreak(userID, threadID, update) {
        streakIDs(userID, threadID);
        userID = String(userID); threadID = String(threadID);
        const previous = usersData[userID];
        const draft = { record: getStreak(userID, threadID) };
        const result = update(draft);
        if (result && typeof result.then === 'function') throw new Error('Streak update must be synchronous');
        if (JSON.stringify(draft.record) === JSON.stringify(previous?.streaks?.[threadID])) return result;
        if (!draft.record || typeof draft.record !== 'object' || Array.isArray(draft.record)) throw new Error('Invalid streak record');
        const next = { ...(previous || { userID, money: 0, exp: 0, data: {}, createTime: { timestamp: Date.now() } }),
            streaks: { ...(previous?.streaks || {}), [threadID]: draft.record } };
        // No await between reading the shared cache and the atomic disk write.
        // Publish the new cache value only after the disk write succeeds.
        safeWriteJSON(path, { ...usersData, [userID]: next });
        usersData[userID] = next;
        return result;
    }

    return {
        getStreak,
        transactStreak,
        getInfo,
        getNameUser,
        getAll,
        getData,
        setData,
        delData,
        createData,
        getUserFull
    };
};

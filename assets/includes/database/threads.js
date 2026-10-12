module.exports = function ({ api }) {
    const Users = require("./users")({ api });
    const logger = require("../../utils/log.js");
    const { writeFileSync, readFileSync } = require("fs-extra");

    // Atomic write: a plain writeFileSync that is interrupted (crash, container
    // restart, out-of-disk) leaves a truncated JSON file and the whole database
    // is gone. Writing to a temp file and renaming makes the swap all-or-nothing.
    function safeWriteJSON(file, obj) {
        const fsx = require("fs-extra");
        const tmp = file + ".tmp";
        const out = JSON.stringify(obj, null, 4);
        if (!out || out.length < 2) return;            // never write empty/garbage
        fsx.writeFileSync(tmp, out);
        fsx.renameSync(tmp, file);
    }

    var path = __dirname + "/data/threadsData.json";

    function loadCurrent() {
        try {
            const data = JSON.parse(readFileSync(path, 'utf8'));
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid thread database');
            return data;
        } catch (error) {
            if (error.code === 'ENOENT') return {};
            throw error; // Never overwrite a corrupt file with an empty snapshot.
        }
    }
    var threadsData = loadCurrent();

    async function getInfo(threadID) {
        try {
            if (!threadID) throw new Error("threadID cannot be empty");
            const result = await api.getThreadInfo(threadID);
            return result;
        }
        catch (error) { 
            console.error('Error in getInfo:', error);
            return null; // Return null instead of throwing error
        }
    }

    async function getData(threadID, callback) {
        try {
            threadsData = loadCurrent();
            if (!threadID) throw new Error("threadID cannot be empty");
            if (isNaN(threadID)) throw new Error("Invalid threadID");
            
            // Check if threadsData exists
            if (!threadsData) {
                threadsData = {};
            }
            
            if (!threadsData.hasOwnProperty(threadID)) {
                await createData(threadID);
            }
            
            // Double check if data was created successfully
            if (!threadsData[threadID]) {
                throw new Error(`Failed to create data for thread ${threadID}`);
            }
            
            const data = threadsData[threadID];
            if (callback && typeof callback == "function") callback(null, data);
            return data;
        } catch (error) {
            console.error('Error in getData:', error);
            if (callback && typeof callback == "function") callback(error, null);
            return null; // Return null instead of false
        }
    }

    async function saveData(data) {
        try {
            if (!data) throw new Error('Data cannot be left blank');
            safeWriteJSON(path, data);
            return true;
        } catch (error) {
            console.error('Error in saveData:', error);
            return false;
        }
    }
    
    async function getAll(keys, callback) {
        try {
            threadsData = loadCurrent();
            // Ensure threadsData exists
            if (!threadsData) threadsData = {};
            
            if (!keys) {
                if (Object.keys(threadsData).length == 0) return [];
                else if (Object.keys(threadsData).length > 0) {
                    var db = [];
                    for (var i of Object.keys(threadsData)) db.push(threadsData[i]);
                    return db;
                }
            }
            if (!Array.isArray(keys)) throw new Error("The input parameter must be an array");
            const data = [];
            for (var ID in threadsData) {
                const database = {
                    ID: ID
                };
                const threadData = threadsData[ID];
                // Ensure threadData exists
                if (threadData) {
                    for (var i of keys) database[i] = threadData[i];
                    data.push(database);
                }
            }
            if (callback && typeof callback == "function") callback(null, data);
            return data;
        } catch (error) {
            console.error('Error in getAll:', error);
            if (callback && typeof callback == "function") callback(error, null);
            return [];
        }
    }
    
    async function setData(threadID, options, callback) {
        try {
            threadsData = loadCurrent();
            if (!threadID) throw new Error("threadID cannot be empty");
            if (isNaN(threadID)) throw new Error("Invalid threadID");
            
            // Ensure threadsData exists
            if (!threadsData) threadsData = {};
            
            if (!threadsData.hasOwnProperty(threadID)) {
                await createData(threadID);
            }
            threadsData = loadCurrent(); // Another handler may have updated botSettings during the await.
            
            if (typeof options != 'object') throw new Error("The options parameter passed must be an object");
            
            // Ensure thread exists before spreading
            threadsData[threadID] = {
                ...(threadsData[threadID] || {}),
                ...options
            };
            
            await saveData(threadsData);
            if (callback && typeof callback == "function") callback(null, threadsData[threadID]);
            return threadsData[threadID];
        }
        catch(error) {
            console.error('Error in setData:', error);
            if (callback && typeof callback == "function") callback(error, null);
            return null;
        }
    }

    async function delData(threadID, callback) {
        try {
            threadsData = loadCurrent();
            if (!threadID) throw new Error("threadID cannot be empty");
            if (isNaN(threadID)) throw new Error("Invalid threadID");
            
            // Ensure threadsData exists
            if (!threadsData) threadsData = {};
            
            if (!threadsData.hasOwnProperty(threadID)) {
                throw new Error(`Threads with ID: ${threadID} does not exist in Database`);
            }
            
            delete threadsData[threadID];
            await saveData(threadsData);
            if (callback && typeof callback == "function") callback(null, "REMOVE THREAD " + threadID + " SUCCESS");
            return true;
        } catch(error) {
            console.error('Error in delData:', error);
            if (callback && typeof callback == "function") callback(error, null);
            return false;
        }
    }

    async function createData(threadID, callback) {
        try {
            threadsData = loadCurrent();
            if (!threadID) throw new Error("threadID cannot be empty");
            if (isNaN(threadID)) throw new Error("Invalid threadID");
            
            // Ensure threadsData exists
            if (!threadsData) threadsData = {};
            
            if (threadsData.hasOwnProperty(threadID)) {
                throw new Error(`Threads with ID: ${threadID} already exists in Database`);
            }
            
            var threadInfo = await api.getThreadInfo(threadID);
            
            // Check if threadInfo is valid
            if (!threadInfo) {
                throw new Error(`Could not get thread info for ${threadID}`);
            }
            
            var data = {
                [threadID]: {
                    threadInfo: {
                        threadID: threadID,
                        threadName: threadInfo.threadName || "",
                        emoji: threadInfo.emoji || "",
                        adminIDs: threadInfo.adminIDs || [],
                        participantIDs: threadInfo.participantIDs || [],
                        isGroup: threadInfo.isGroup || false,
                    },
                    createTime: {
                        timestamp: Date.now()
                    },
                    data: {
                        timestamp: Date.now()
                    }
                }
            };
            
            // Safely handle user data
            if (threadInfo.userInfo && Array.isArray(threadInfo.userInfo)) {
                const dataUser = global.data?.allUserID || [];
                for (let singleData of threadInfo.userInfo) {
                    if (singleData && singleData.gender != undefined) {
                        try {
                            if (dataUser.includes(singleData.id) || (Users && Users.hasOwnProperty(singleData.id))) {
                                continue;
                            }
                            dataUser.push(singleData.id);
                            if (Users && typeof Users.createData === 'function') {
                                await Users.createData(singleData.id);
                                logger.log(global.getText('handleCreateDatabase', 'newUser', singleData.id), 'DATABASE');
                            }
                        } catch(e) { 
                            console.error('Error creating user data:', e);
                        }
                    }
                }
            }
            
            threadsData = loadCurrent();
            threadsData[threadID] = { ...data[threadID], ...(threadsData[threadID] || {}),
                threadInfo: { ...data[threadID].threadInfo, ...(threadsData[threadID]?.threadInfo || {}) } };
            await saveData(threadsData);
            if (callback && typeof callback == "function") callback(null, data);
            return data;
        } catch (error) {
            console.error('Error in createData:', error);
            if (callback && typeof callback == "function") callback(error, null);
            return null;
        }
    }

    return {
        getInfo,
        getAll,
        getData,
        setData,
        delData,
        createData
    };
};

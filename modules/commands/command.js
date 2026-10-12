const __l = require("../../includes/i18n");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "cmd",
    version: "1.1.0",
    hasPermssion: 2,
    credits: "Mirai Team | Modified by Jonell Magallanes",
    description: "Manage/Control all bot modules",
    usePrefix: true,
    commandCategory: "Admin",
    usages: "[load/unload/loadAll/unloadAll/info/share/install] [name module]",
    cooldowns: 5,
    dependencies: {
        "fs-extra": "",
        "child_process": "",
        "path": ""
    }
};

const sendWait = (api, t, threadID, messageID) => new Promise(r => api.sendMessage(t, threadID, (e, i) => r(e ? null : i), messageID));
const editInto = (api, t, i, threadID, messageID) => {
    if (i) api.editMessage(t, i.messageID, threadID);
    else api.sendMessage(t, threadID, messageID);
};

const loadCommand = function ({ moduleList, threadID, messageID, info }) {
    const { execSync } = global.nodemodule["child_process"];
    const { writeFileSync, unlinkSync, readFileSync } = global.nodemodule["fs-extra"];
    const { join } = global.nodemodule["path"];
    const { configPath, mainPath, api } = global.client;
    const logger = require(mainPath + "/utils/log");

    var errorList = [];
    delete require["resolve"][require["resolve"](configPath)];
    var configValue = require(configPath);
    writeFileSync(configPath + ".temp", JSON.stringify(configValue, null, 2), "utf8");

    for (const nameModule of moduleList) {
        try {
            const dirModule = __dirname + "/" + nameModule + ".js";
            delete require["cache"][require["resolve"](dirModule)];
            const command = require(dirModule);
            global.client.commands.delete(nameModule);
            if (!command.config || !command.run || !command.config.commandCategory) throw new Error(__l.t("m293"));

            global.client["eventRegistered"] = global.client["eventRegistered"].filter(info => info != command.config.name);

            if (command.config.dependencies && typeof command.config.dependencies == "object") {
                const listPackage = JSON.parse(readFileSync("./package.json")).dependencies,
                    listbuiltinModules = require("module")["builtinModules"];
                for (const packageName in command.config.dependencies) {
                    var tryLoadCount = 0, loadSuccess = false, error;
                    const moduleDir = join(global.client.mainPath, "nodemodules", "node_modules", packageName);
                    try {
                        if (listPackage.hasOwnProperty(packageName) || listbuiltinModules.includes(packageName))
                            global.nodemodule[packageName] = require(packageName);
                        else global.nodemodule[packageName] = require(moduleDir);
                    } catch {
                        logger.loader(__l.t("m294") + packageName + __l.t("m295") + command.config.name + " installing...", "warn");
                        const insPack = {};
                        insPack.stdio = "inherit";
                        insPack.env = process.env;
                        insPack.shell = true;
                        insPack.cwd = join(global.client.mainPath, "nodemodules");
                        execSync(
                            "npm --package-lock false --save install " +
                                packageName +
                                (command.config.dependencies[packageName] == "*" || command.config.dependencies[packageName] == ""
                                    ? ""
                                    : "@" + command.config.dependencies[packageName]),
                            insPack
                        );
                        for (tryLoadCount = 1; tryLoadCount <= 3; tryLoadCount++) {
                            require["cache"] = {};
                            try {
                                if (listPackage.hasOwnProperty(packageName) || listbuiltinModules.includes(packageName))
                                    global.nodemodule[packageName] = require(packageName);
                                else global.nodemodule[packageName] = require(moduleDir);
                                loadSuccess = true;
                                break;
                            } catch (erorr) {
                                error = erorr;
                            }
                            if (loadSuccess || !error) break;
                        }
                        if (!loadSuccess || error)
                            throw __l.t("m297") + packageName + __l.t("m298") + command.config.name + __l.t("m299") + error + " " + error["stack"];
                    }
                }
                logger.loader(__l.t("m300") + command.config.name);
            }

            if (command.config.envConfig && typeof command.config.envConfig == "Object")
                try {
                    for (const [key, value] of Object.entries(command.config.envConfig)) {
                        if (typeof global.configModule[command.config.name] == undefined) global.configModule[command.config.name] = {};
                        if (typeof configValue[command.config.name] == undefined) configValue[command.config.name] = {};
                        if (typeof configValue[command.config.name][key] !== undefined)
                            global.configModule[command.config.name][key] = configValue[command.config.name][key];
                        else global.configModule[command.config.name][key] = value || "";
                        if (typeof configValue[command.config.name][key] == undefined) configValue[command.config.name][key] = value || "";
                    }
                    logger.loader(__l.t("m301") + command.config.name);
                } catch (error) {
                    throw new Error(__l.t("m302") + JSON.stringify(error));
                }

            if (command["onLoad"])
                try {
                    const onLoads = {};
                    onLoads["configValue"] = configValue;
                    command["onLoad"](onLoads);
                } catch (error) {
                    throw new Error(__l.t("m303") + JSON.stringify(error));
                }

            if (command.handleEvent) global.client.eventRegistered.push(command.config.name);

            (global.config.commandDisabled.includes(nameModule + ".js") || configValue.commandDisabled.includes(nameModule + ".js")) &&
                (configValue.commandDisabled.splice(configValue.commandDisabled.indexOf(nameModule + ".js"), 1),
                global.config.commandDisabled.splice(global.config.commandDisabled.indexOf(nameModule + ".js"), 1));

            global.client.commands.set(command.config.name, command);
            logger.loader(__l.t("m304") + command.config.name + "!");
        } catch (error) {
            errorList.push("- " + nameModule + " reason:" + error + " at " + error["stack"]);
        }
    }

    if (errorList.length != 0) api.sendMessage(__l.t("m305") + errorList.join(" "), threadID, messageID);
    editInto(api, __l.t("m306") + (moduleList.length - errorList.length) + " module(s)", info, threadID, messageID);

    writeFileSync(configPath, JSON.stringify(configValue, null, 4), "utf8");
    unlinkSync(configPath + ".temp");
    return;
};

const unloadModule = function ({ moduleList, threadID, messageID, info }) {
    const { writeFileSync, unlinkSync } = global.nodemodule["fs-extra"];
    const { configPath, mainPath, api } = global.client;
    const logger = require(mainPath + "/utils/log");

    delete require.cache[require.resolve(configPath)];
    var configValue = require(configPath);
    writeFileSync(configPath + ".temp", JSON.stringify(configValue, null, 4), "utf8");

    for (const nameModule of moduleList) {
        global.client.commands.delete(nameModule);
        global.client.eventRegistered = global.client.eventRegistered.filter(item => item !== nameModule);
        configValue["commandDisabled"].push(`${nameModule}.js`);
        global.config["commandDisabled"].push(`${nameModule}.js`);
        logger.loader(__l.t("m307", [nameModule]));
    }

    writeFileSync(configPath, JSON.stringify(configValue, null, 4), "utf8");
    unlinkSync(configPath + ".temp");

    return editInto(api, __l.t("m308", [moduleList.length]), info, threadID, messageID);
};

module.exports.run = async function ({ event, args, api }) {
    const { readdirSync, readFileSync, writeFileSync } = global.nodemodule["fs-extra"];
    const { threadID, messageID } = event;
    var moduleList = args.splice(1, args.length);

    switch (args[0]) {
        case "load": {
            if (moduleList.length == 0) return api.sendMessage(__l.t("m309"), threadID, messageID);
            else return loadCommand({ moduleList, threadID, messageID, info: await sendWait(api, __l.t("m310"), threadID, messageID) });
        }
        case "unload": {
            if (moduleList.length == 0) return api.sendMessage(__l.t("m309"), threadID, messageID);
            else return unloadModule({ moduleList, threadID, messageID, info: await sendWait(api, __l.t("m311"), threadID, messageID) });
        }
        case "loadAll": {
            const wait = await sendWait(api, __l.t("m312"), threadID, messageID);
            moduleList = readdirSync(__dirname).filter(file => file.endsWith(".js") && !file.includes("example"));
            moduleList = moduleList.map(item => item.replace(/\.js/g, ""));
            loadCommand({ moduleList, threadID, messageID });
            editInto(api, __l.t("m313"), wait, threadID, messageID);
            break;
        }
        case "unloadAll": {
            moduleList = readdirSync(__dirname).filter(file => file.endsWith(".js") && !file.includes("example") && !file.includes("command"));
            moduleList = moduleList.map(item => item.replace(/\.js/g, ""));
            return unloadModule({ moduleList, threadID, messageID, info: await sendWait(api, __l.t("m311"), threadID, messageID) });
        }
        case "info": {
            const command = global.client.commands.get(moduleList.join("") || "");
            if (!command) return api.sendMessage(__l.t("m314"), threadID, messageID);

            const { name, version, hasPermssion, credits, cooldowns, dependencies } = command.config;
            return api.sendMessage(
                "━━━━━━━━━━━━━━━━━━\n" +
                __l.t("m315") +
                "━━━━━━━━━━━━━━━━━━\n" +
                __l.t("m316") + name + "\n" +
                __l.t("m317") + credits + "\n" +
                __l.t("m318") + version + "\n" +
                __l.t("m319") + (hasPermssion == 0 ? "User" : hasPermssion == 1 ? "Admin" : __l.t("m320")) + "\n" +
                __l.t("m321") + cooldowns + "s\n" +
                __l.t("m322") + (Object.keys(dependencies || {})).join(", ") || "None",
                threadID,
                messageID
            );
        }
        case "share": {
            if (!moduleList[0]) return api.sendMessage(__l.t("m323"), threadID, messageID);
            const filePath = path.join(__dirname, `${moduleList[0]}.js`);
            if (!fs.existsSync(filePath)) return api.sendMessage(__l.t("m324"), threadID, messageID);

            const code = readFileSync(filePath, "utf8");
            return api.sendMessage(
                "━━━━━━━━━━━━━━━━━━\n" +
                __l.t("m325") +
                "━━━━━━━━━━━━━━━━━━\n" +
                __l.t("m316") + moduleList[0] + "\n\n" +
                code,
                threadID,
                messageID
            );
        }
        case "install": {
            if (moduleList.length < 2) return api.sendMessage(__l.t("m326"), threadID, messageID);
            const cmdName = moduleList[0];
            const code = args.slice(2).join(" ");
            const filePath = path.join(__dirname, `${cmdName}.js`);
            try {
                writeFileSync(filePath, code, "utf8");
                return api.sendMessage(
                    "━━━━━━━━━━━━━━━━━━\n" +
                    __l.t("m327") +
                    "━━━━━━━━━━━━━━━━━━\n" +
                    __l.t("m316") + cmdName,
                    threadID,
                    messageID
                );
            } catch (e) {
                return api.sendMessage(
                    "━━━━━━━━━━━━━━━━━━\n" +
                    __l.t("m328") +
                    "━━━━━━━━━━━━━━━━━━\n" +
                    e.message,
                    threadID,
                    messageID
                );
            }
        }
        default: {
            return api.sendMessage(__l.t("m329"), threadID, messageID);
        }
    }
};
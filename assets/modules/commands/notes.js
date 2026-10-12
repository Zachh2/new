const __l = require("../../includes/i18n");
module.exports.config = {
    name: "note",
    hasPermssion: 2,
    version: "1.0.0",
    credits: "Jonell Magallanes",
    description: "Manage Facebook Messenger notes",
    usePrefix: true,
    commandCategory: "Utility",
    usages: "[create/delete/check] [text]",
    cooldowns: 10,
};

module.exports.run = async function ({ api, event, args }) {  const __tid = event.threadID, __mid = event.messageID;
  const __react = (e) => { try { api.setMessageReaction(e, __mid, () => {}, true); } catch (err) {} };
  const __send = (t) => global.editMsgDisabled ? Promise.resolve(null) : new Promise(r => api.sendMessage(t, __tid, (e, i) => r(e ? null : i), __mid));
  const __fmt = (t, ok) => { const s = String(t); return /[╭╰━┈]/.test(s) ? s : "╭┈ ❒ [ NOTE " + (ok ? "✅" : "❌") + " ]\n" + s + "\n╰┈━━━━━━━━━━━"; };
  const __edit = (t, i) => { const b = /❌|⚠️|💀|[Ff]ail|[Ee]rror|[Nn]ot found|[Cc]ould not|[Uu]nable|[Dd]enied|[Ii]nvalid/.test(String(t)); const o = __fmt(t, !b); if (i) api.editMessage(o, i.messageID, __tid); else api.sendMessage(o, __tid, __mid); __react(b ? "❌" : "✅"); };
  __react("⏳");
  const __info = await __send(__l.t("m634"));

    const { threadID, messageID, senderID } = event;
    const action = args[0]?.toLowerCase();

    if (!action) {
        return __edit(__l.t("m635"), __info);
    }

    try {
        switch (action) {
            case "create": {
                const noteText = args.slice(1).join(" ");
                if (!noteText) {
                    return __edit(__l.t("m636"), __info);
                }

                await new Promise((resolve, reject) => {
                    api.notes.create(noteText, (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    });
                });

                return __edit(__l.t("m637", [noteText]), __info);
            }

            case "delete": {
                await new Promise((resolve, reject) => {
                    api.notes.check((err, currentNote) => {
                        if (err) reject(err);
                        else if (!currentNote) reject(new Error(__l.t("m638")));
                        else {
                            api.notes.delete(currentNote.id, (err, result) => {
                                if (err) reject(err);
                                else resolve(result);
                            });
                        }
                    });
                });

                return __edit(__l.t("m639"), __info);
            }

            case "check": {
                const currentNote = await new Promise((resolve, reject) => {
                    api.notes.check((err, note) => {
                        if (err) reject(err);
                        else resolve(note);
                    });
                });

                if (!currentNote) {
                    return __edit(__l.t("m640"), __info);
                }

                const createdTime = new Date(currentNote.creation_time * 1000).toLocaleString();
                const expiresTime = new Date((currentNote.creation_time + 86400) * 1000).toLocaleString();

                return __edit(__l.t("m641", [currentNote.description, createdTime, expiresTime, currentNote.privacy]), __info);
            }

            default: {
                return __edit(__l.t("m642"), __info);
            }
        }
    } catch (error) {
        console.error("Note Error:", error);
        
        if (error.message.includes("No active note")) {
            return __edit(__l.t("m645"), __info);
        } else if (error.message.includes("login")) {
            return __edit(__l.t("m646"), __info);
        } else {
            return __edit(__l.t("m647", [error.message]), __info);
        }
    }
};
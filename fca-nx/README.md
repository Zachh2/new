<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0f172a,50:2563eb,100:06b6d4&height=220&section=header&text=FCA-NX&fontSize=72&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=The%20Facebook%20Messenger%20API%20for%20Node.js&descAlignY=60&descSize=18" width="100%"/>

<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=600&size=20&duration=2800&pause=900&color=38BDF8&center=true&vCenter=true&width=700&lines=⚡+Lightning+Fast+Messenger+API;🔒+Secure+Session+Management;🛡️+Auto-Healing+Architecture;🌐+90%2B+Powerful+API+Methods;🚀+Built+for+Modern+Node.js+Projects" />

<br><br>

<a href="https://www.npmjs.com/package/fca-nx">
<img src="https://img.shields.io/npm/v/fca-nx?style=for-the-badge&logo=npm&logoColor=white">
</a>
<a href="https://www.npmjs.com/package/fca-nx">
<img src="https://img.shields.io/npm/dm/fca-nx?style=for-the-badge&logo=npm&logoColor=white">
</a>
<a href="https://github.com/xalmandevv/fca-nx">
<img src="https://img.shields.io/github/stars/xalmandevv/fca-nx?style=for-the-badge&logo=github">
</a>
<a href="https://github.com/xalmandevv/fca-nx/blob/main/LICENSE">
<img src="https://img.shields.io/github/license/xalmandevv/fca-nx?style=for-the-badge">
</a>
<a href="https://nodejs.org/">
<img src="https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white">
</a>

<br><br>

**⚡ Lightning Fast · 🔒 Secure · 🌐 90+ Methods · 🛡️ Auto-Healing**

<br>

FCA-NX is a modern Facebook Messenger API client for Node.js,  
built for bots, automation systems, integrations, and advanced Messenger applications.

</div>

---

<div align="center">✨ Why FCA-NX?</div>

<table>
<tr>
<td align="center" width="25%">⚡<br><br><b>FAST</b><br><br>Optimized communication and event handling</td>
<td align="center" width="25%">🛡️<br><br><b>STABLE</b><br><br>Session protection and automatic reconnection</td>
<td align="center" width="25%">🌐<br><br><b>POWERFUL</b><br><br>90+ API methods and utilities.</td>
<td align="center" width="25%">🔧<br><br><b>FLEXIBLE</b><br><br>Designed for bots and custom applications</td>
</tr>
</table>

---

# ✨ Features

| Feature | Description |
|:---:|---|
| ⚡ **Lightning Fast** | Optimized MQTT communication engine |
| 🔒 **Security First** | Session protection with automatic backups |
| 🛡️ **Auto-Healing** | Automatic recovery from connection problems |
| 🔄 **Auto Reconnect** | Automatically reconnect after disconnects |
| 🌐 **90+ Methods** | Messages, users, threads, reactions and more |
| 📡 **Real-Time Events** | Powerful MQTT event listener |
| 💾 **Auto Save** | Automatic appState protection |
| 📢 **Broadcasting** | Controlled multi-thread broadcasting |
| 👥 **Thread Tools** | Complete group management utilities |
| 👤 **User Tools** | User information and relationship APIs |

# 📦 Installation

```bash
npm install fca-nx

```
### Requirements
 * Node.js >= 18.0.0
Check your Node.js version:
```bash
node -v

```
# 🚀 Quick Start
```javascript
const { login } = require("fca-nx");
const appState = require("./account.json");

login(
  { appState },
  { listenEvents: true },
  (err, api) => {
    if (err) {
      console.error(err);
      return;
    }

    console.log("╭─────────────────────────────╮");
    console.log("│     🚀 FCA-NX CONNECTED     │");
    console.log("╰─────────────────────────────╯");

    api.autoSaveSession("./account.json", {
      interval: 3 * 60 * 1000,
      backup: true
    });

    api.listenMqtt((err, event) => {
      if (err) {
        console.error("Listen error:", err);
        return;
      }

      if (event.type === "message") {
        api.sendMessage(
          "🤖 I received: " + event.body,
          event.threadID
        );
      }
    });
  }
);

```
# 🔐 Session Protection
```javascript
api.autoSaveSession("./account.json");

api.autoSaveSession("./account.json", {
  interval: 5 * 60 * 1000,
  debounce: 30 * 1000,
  backup: true,
  maxBackups: 5
});

api.saveSession();
api.restoreFromBackup();
api.stopAutoSave();

```
# 💬 Messaging
### Send Message
```javascript
api.sendMessage("Hello world!", threadID);

```
### Send Attachment
```javascript
const fs = require("fs");

api.sendMessage(
  {
    body: "Check this out!",
    attachment: fs.createReadStream("./photo.jpg")
  },
  threadID
);

```
### Mentions
```javascript
api.sendMessage(
  {
    body: "Hey @John, how are you?",
    mentions: [
      {
        id: "123456789",
        tag: "@John",
        fromIndex: 4
      }
    ]
  },
  threadID
);

```
### Sticker
```javascript
api.sendMessage(
  {
    sticker: "369239263222822"
  },
  threadID
);

```
### Location
```javascript
api.sendMessage(
  {
    location: {
      latitude: 23.8103,
      longitude: 90.4125,
      current: true
    }
  },
  threadID
);

```
# 📡 Mass Broadcasting
```javascript
const result = await api.sendBroadcast(
  "📢 Important announcement!",
  [
    "thread_id_1",
    "thread_id_2",
    "thread_id_3"
  ],
  {
    parallel: 3,
    delay: 2000,
    onProgress: (sent, total) => {
      console.log(`📊 Progress: ${sent}/${total}`);
    }
  }
);

console.log(`✅ Sent: ${result.success}`);
console.log(`❌ Failed: ${result.failed}`);

```
# 👥 Thread Management
```javascript
const info = await api.getThreadInfo(threadID);
const threads = await api.getThreadList(20);
const history = await api.getThreadHistory(threadID, 50);

const groupID = await api.createGroup("New Group", ["user1", "user2"]);

await api.addUserToGroup(userID, threadID);
await api.removeUserFromGroup(userID, threadID);

await api.setTitle("New Group Name", threadID);
await api.changeThreadColor("#0084FF", threadID);
await api.changeThreadEmoji("🔥", threadID);
await api.changeNickname("Captain", threadID, userID);
await api.changeGroupImage(fs.createReadStream("./group.png"), threadID);

await api.changeAdminStatus(threadID, userID, true);

await api.createPoll(
  "What's your favorite color?",
  threadID,
  {
    Red: false,
    Blue: false,
    Green: false
  }
);

```
# 👤 User Operations
```javascript
const user = await api.getUserInfo(userID);
const userV2 = await api.getUserInfoV2(userID);
const users = await api.getUserID("John Doe");
const uid = await api.getUID("[https://facebook.com/username](https://facebook.com/username)");
const friends = await api.getFriendsList();
const avatar = await api.getAvatarUser(userID);

// Relationship Management
await api.sendFriendRequest(userID);
await api.handleFriendRequest(userID, true);
await api.changeBlockedStatus(userID, true);
await api.unfriend(userID);

```
# 🖼️ Profile Management
```javascript
await api.changeAvatar(fs.createReadStream("./avatar.jpg"));
await api.changeCover(fs.createReadStream("./cover.jpg"));
await api.changeBio("Powered by FCA-NX");

```
# 😍 Reactions & Interactions
```javascript
await api.setMessageReaction("❤️", messageID, threadID);
await api.setMessageReaction("", messageID); // Remove reaction
await api.reactToPost(postID, "😂");

await api.sendMessage("Nice message!", threadID, null, messageID); // Reply

```
# 🔧 Message Actions
```javascript
await api.editMessage("Updated text", messageID);
await api.unsendMessage(messageID);
await api.deleteMessage([messageID1, messageID2]);
await api.forwardAttachment(attachmentID, [userID]);

const attachments = await api.uploadAttachment([
  fs.createReadStream("./file.pdf")
]);

await api.markAsRead(threadID);
await api.markAsReadAll();
await api.sendTypingIndicator(threadID, true);

```
# 🌐 HTTP Utilities
```javascript
// GET
api.httpGet("[https://api.example.com](https://api.example.com)", { param: "value" }, (err, data) => {
  console.log(data);
});

// POST
api.httpPost("[https://api.example.com](https://api.example.com)", { key: "value" }, (err, data) => {
  console.log(data);
});

// Form Data
api.httpPostFormData("[https://api.example.com](https://api.example.com)", { file: fs.createReadStream("./file.jpg") }, (err, data) => {
  console.log(data);
});

```
# ⚙️ Configuration
| Option | Type | Default | Description |
|---|---|---|---|
| selfListen | boolean | false | Receive own messages |
| listenEvents | boolean | true | Receive thread events |
| listenTyping | boolean | false | Receive typing events |
| updatePresence | boolean | false | Receive online status |
| autoMarkDelivery | boolean | false | Auto mark delivered |
| autoMarkRead | boolean | false | Auto mark read |
| autoReconnect | boolean | true | Auto reconnect |
| online | boolean | false | Appear online |
| proxy | string | null | HTTP proxy |
| userAgent | string | null | Custom User-Agent |
| emitReady | boolean | false | Emit ready event |
# 🔑 Login Methods
### AppState
```javascript
const { login } = require("fca-nx");
const appState = require("./account.json");

login({ appState }, options, callback);

```
### Email & Password
```javascript
login(
  {
    email: "your_email@example.com",
    password: "your_password"
  },
  options,
  callback
);

```
> Email/password authentication may require additional verification.
> 
# 🧩 API Architecture
```text
api
│
├── messages
│   ├── send
│   ├── edit
│   ├── delete
│   ├── unsend
│   ├── react
│   └── uploadAttachment
│
├── threads
│   ├── createGroup
│   ├── getInfo
│   ├── getList
│   ├── addUsers
│   ├── removeUser
│   ├── setTitle
│   └── setNickname
│
├── users
│   ├── getID
│   ├── getInfo
│   ├── getInfoV2
│   └── getFriends
│
├── account
│   ├── changeAvatar
│   ├── changeCover
│   ├── changeBio
│   ├── handleFriendRequest
│   ├── changeBlockedStatus
│   └── logout
│
└── realtime
    ├── listen
    ├── stop
    └── middleware

```
# 🏗️ Architecture
```text
┌─────────────────────┐
│     Your Bot / App  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│       FCA-NX        │
├─────────────────────┤
│    API Layer        │
│    MQTT Engine      │
│    Session Manager  │
│    Auto Healing     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Facebook Services  │
│                     │
└─────────────────────┘

```
# 🛡️ Best Practices
 1. Always use AppState
 2. Enable automatic session backups
 3. Use listenMqtt for real-time events
 4. Handle connection errors properly
 5. Use controlled broadcasting
 6. Keep session files private
 7. Never publish account credentials
 8. Keep FCA-NX updated
# 🤝 Contributing
```bash
git clone [https://github.com/xalmandevv/fca-nx.git](https://github.com/xalmandevv/fca-nx.git)
cd fca-nx
git checkout -b feature/amazing
git add .
git commit -m "Add amazing feature"
git push origin feature/amazing

```
Then open a Pull Request.
# 📄 License
MIT License — Free to use, modify, and distribute.
<div align="center">
<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=600&size=18&duration=3000&pause=1000&color=38BDF8&center=true&vCenter=true&width=600&lines=Built+with+⚡+for+Node.js+Developers;Powered+by+FCA-NX;Made+for+Bots+🤖+%26+Automation+🚀" />
<a href="https://github.com/xalmandevv/fca-nx">
<img src="https://img.shields.io/badge/GitHub-xalmandevv-181717?style=for-the-badge&logo=github">
</a>
<a href="https://www.npmjs.com/package/fca-nx">
<img src="https://img.shields.io/badge/NPM-fca--nx-CB3837?style=for-the-badge&logo=npm">
</a>
⭐ Star the repository if FCA-NX helps your project! ⭐
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:06b6d4,50:2563eb,100:0f172a&height=120&section=footer" width="100%"/>
</div>

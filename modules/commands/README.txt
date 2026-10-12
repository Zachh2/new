INSTALL:

1. Put streakSystem.js where your bot can require it.

2. In your main command handler, before command.run():

const {updateStreak} = require('./streakSystem');

await updateStreak(api,event);

3. Then execute the command.

All commands will count:
-help
-music
-ai
-mood
-catchup

Storage:
usersData.json

Key:
threadID_userID

Timezone:
Asia/Manila

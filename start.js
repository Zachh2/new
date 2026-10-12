const { spawn } = require("child_process");

// Exit code 0  -> intentional stop (shutdown, or the session needs a new
//                 appstate). Do NOT restart, or the bot would hammer Facebook
//                 with logins using a dead session.
// Anything else -> crash/restart request. Restart, but back off if it keeps
//                 dying quickly, because rapid re-logins get accounts flagged.

let quickCrashes = 0;

function startBot() {
  const startedAt = Date.now();
  // --trace-warnings printed a full stack trace for every warning, and the
  // `request` library inside fbvibex fires a util.isArray deprecation on
  // basically every API call - that's the wall of white text in the console.
  // --no-deprecation silences those (they're library noise, nothing we can
  // fix from here) while real errors still print normally.
  const child = spawn("node", ["--no-deprecation", "main.js"], {
    cwd: __dirname,
    stdio: "inherit",
    shell: true,
    env: Object.assign({}, process.env, { BOT_SUPERVISED: "1" })
  });

  child.on("close", (codeExit) => {
    console.log(`Bot process exited with code: ${codeExit}`);
    // main.js records why it stopped - show it here so a loop explains itself
    try {
      const log = require("fs").readFileSync(__dirname + "/crash.log", "utf8").trim().split("\n");
      if (log.length) console.log("Reason: " + log[log.length - 1]);
    } catch (e) {}
    if (codeExit === 0) {
      console.log("Stopped on purpose - not restarting.");
      return;
    }

    // "autoRestartOnCrash": false in config.json stops the supervisor from
    // bringing the bot back by itself.
    let allowRestart = true;
    try {
      const cfg = JSON.parse(require("fs").readFileSync(__dirname + "/config.json", "utf8"));
      if (cfg.autoRestartOnCrash === false) allowRestart = false;
    } catch (e) {}
    if (!allowRestart) {
      console.log("Auto-restart is off (config.json -> autoRestartOnCrash). Start it yourself when ready.");
      return;
    }

    const ranFor = Date.now() - startedAt;
    quickCrashes = ranFor < 2 * 60 * 1000 ? quickCrashes + 1 : 0;

    if (quickCrashes >= 6) {
      console.log("Bot crashed 6 times in a row within 2 minutes of starting. Stopping to protect the account - check the logs.");
      return;
    }

    // 5s, 15s, 45s, 2m15s, 5m ...
    const wait = quickCrashes === 0 ? 5000 : Math.min(5000 * Math.pow(3, quickCrashes), 5 * 60 * 1000);
    console.log(`Restarting in ${Math.round(wait / 1000)}s...`);
    setTimeout(startBot, wait);
  });

  child.on("error", (error) => {
    console.error(`An error occurred starting the bot: ${error}`);
    setTimeout(startBot, 10000);
  });
}

startBot();

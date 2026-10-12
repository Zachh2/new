const { login } = require("fca-nx");
const fs = require("fs");
const path = require("path");

const APPSTATE_PATH = path.join(__dirname, "appstate.json");


const options = {
  logLevel: "info",
  forceLogin: true,
  listenEvents: false,
  selfListen: false,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};


const credentials = {
  email: process.env.FB_EMAIL || "chiwarr@xitroo.com",
  password: process.env.FB_PASSWORD || "",
};


function callback(err, api) {
  if (err) {
    console.error("❌ Login failed:", err);
    return;
  }

  console.log("✅ Successfully logged in!");
  console.log("👤 User ID:", api.getCurrentUserID());

  const appState = api.getAppState();


  try {
    fs.writeFileSync(
      APPSTATE_PATH,
      JSON.stringify(appState, null, 2),
      "utf8"
    );
    console.log(`💾 appState.json saved successfully at: ${APPSTATE_PATH}`);
    console.log(`📦 Total cookies: ${appState.length}`);
  } catch (saveErr) {
    console.error("❌ Failed to save appState.json:", saveErr);
  }


  process.exit(0);
}


if (fs.existsSync(APPSTATE_PATH)) {
  console.log("🔑 Found appstate.json, attempting login with cookies...");
  try {
    const appState = JSON.parse(fs.readFileSync(APPSTATE_PATH, "utf8"));

    if (Array.isArray(appState) && appState.length > 0) {
      login({ appState }, options, (err, api) => {
        if (err) {
          console.warn("⚠️ Cookie login failed, falling back to email/password...");
          emailPasswordLogin();
        } else {
          callback(null, api);
        }
      });
    } else {
      console.warn("⚠️ appstate.json is empty or invalid, using email/password...");
      emailPasswordLogin();
    }
  } catch (parseErr) {
    console.error("❌ Failed to parse appstate.json:", parseErr);
    emailPasswordLogin();
  }
} else {
  console.log("📧 No appstate.json found, logging in with email/password...");
  emailPasswordLogin();
}


function emailPasswordLogin() {
  login(
    {
      email: credentials.email,
      password: credentials.password,
    },
    options,
    callback
  );
}
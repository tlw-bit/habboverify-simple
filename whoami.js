require("dotenv").config();
const { Client, IntentsBitField } = require("discord.js");

const token = String(process.env.DISCORD_TOKEN || "").trim();
if (!token) {
  console.error("❌ No DISCORD_TOKEN env var found.");
  process.exit(1);
}

const client = new Client({
  intents: [IntentsBitField.Flags.Guilds],
});

client.once("ready", () => {
  console.log("Logged in as:", client.user.tag);
  console.log("Bot user id:", client.user.id);
  process.exit(0);
});

client.login(token).catch((e) => {
  console.error("Login failed:", e?.message || e);
  process.exit(1);
});

// deploy-commands.js (Discord.js v14)
require("dotenv").config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const commands = [
  // ----- XP / Ranks -----
  new SlashCommandBuilder()
    .setName("level")
    .setDescription("Show level/xp for you or someone else")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to check")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show the rank card for you or someone else")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to check")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("xpleaderboard")
    .setDescription("Show the XP leaderboard"),

  // ----- Invites -----
  new SlashCommandBuilder()
    .setName("invites")
    .setDescription("Show invite count for you or someone else")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to check")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("invleaderboard")
    .setDescription("Show the invite leaderboard"),

  // ----- Verification -----
  new SlashCommandBuilder()
    .setName("getcode")
    .setDescription("DM me a verification code"),

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verify your Habbo account via motto code")
    .addStringOption(o =>
      o.setName("habbo")
        .setDescription("Your Habbo name")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("verifymsg")
    .setDescription("Post + pin verification instructions (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // ----- Utility -----
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("pong ✅"),
].map(c => c.toJSON());

const token = String(process.env.DISCORD_TOKEN || "").trim();
const clientId = String(process.env.CLIENT_ID || "").trim();
const guildId = String(process.env.GUILD_ID || "").trim();

if (!token) throw new Error("Missing DISCORD_TOKEN in .env");
if (!clientId) throw new Error("Missing CLIENT_ID in .env");
if (!guildId) throw new Error("Missing GUILD_ID in .env");

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("🚀 Deploying Concierge guild commands (overwrites the list)...");
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log("✅ Done. Commands are now: /level /rank /xpleaderboard /invites /invleaderboard /getcode /verify /verifymsg /ping");
  } catch (err) {
    console.error("❌ Failed to deploy commands:", err);
  }
})();

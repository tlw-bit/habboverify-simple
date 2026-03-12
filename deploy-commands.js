// deploy-commands.js (Discord.js v14)
require("dotenv").config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const commands = [
  // ----- XP / Ranks -----
  new SlashCommandBuilder()
    .setName("level")
    .setDescription("Show level/xp for you or someone else")
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user").setDescription("User to check").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("xpinfo")
    .setDescription("Show how XP works in this server")
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("xpadmin")
    .setDescription("Admin XP tools (give/take/set/reset)")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("give")
        .setDescription("Give XP to a user")
        .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
        .addIntegerOption((o) => o.setName("amount").setDescription("XP amount").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("take")
        .setDescription("Take XP from a user")
        .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
        .addIntegerOption((o) => o.setName("amount").setDescription("XP amount").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Set a user's XP to an exact value")
        .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
        .addIntegerOption((o) => o.setName("amount").setDescription("XP amount").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("reset")
        .setDescription("Reset a user's XP/level/prestige")
        .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show the rank card for you or someone else")
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user").setDescription("User to check").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("xpleaderboard")
    .setDescription("Show the XP leaderboard")
    .setDMPermission(false),

  // ----- Invites -----
  new SlashCommandBuilder()
    .setName("invites")
    .setDescription("Show invite count for you or someone else")
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user").setDescription("User to check").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("invleaderboard")
    .setDescription("Show the invite leaderboard")
    .setDMPermission(false),

  // ----- Verification -----
  new SlashCommandBuilder()
    .setName("getcode")
    .setDescription("DM me a verification code")
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verify your Habbo account via motto code")
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName("habbo").setDescription("Your Habbo name").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("verifymsg")
    .setDescription("Post + pin verification instructions (admin)")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),


  // ----- Raffles -----
  new SlashCommandBuilder()
    .setName("add")
    .setDescription("Raffle: manually assign a ticket number to a user")
    .setDMPermission(false)
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
    .addIntegerOption((o) => o.setName("number").setDescription("Ticket number").setRequired(true)),

  new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Raffle: remove a ticket number assignment")
    .setDMPermission(false)
    .addIntegerOption((o) => o.setName("number").setDescription("Ticket number").setRequired(true)),

  new SlashCommandBuilder()
    .setName("raffleview")
    .setDescription("Raffle: view manual ticket assignments in this channel")
    .setDMPermission(false),

  // ----- Utility -----
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("pong ✅")
    .setDMPermission(false),
].map((c) => c.toJSON());

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
    console.log(
      "✅ Done. Commands are now: /level /xpinfo /xpadmin /rank /xpleaderboard /invites /invleaderboard /getcode /verify /verifymsg /add /remove /raffleview /ping"
    );
  } catch (err) {
    console.error("❌ Failed to deploy commands:", err);
  }
})();

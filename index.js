console.log("Bot starting...");

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionsBitField,
} = require("discord.js");

const path = require("path");
const fs = require("fs");
const { createCanvas, loadImage } = require("canvas");

// ---- fetch support (Node 18+ has global fetch; fallback just in case) ----
const fetchFn =
  global.fetch || ((...args) => import("undici").then((m) => m.fetch(...args)));

// ====== CONFIG ======
const PREFIX = "!";
const VERIFIED_ROLE = "Verified";
const OLD_ROLE_TO_REMOVE = "Unverified";

const VERIFY_CHANNEL_ID = "1462386529765691473";
const LOG_CHANNEL_ID = "1456955298597175391";
const WELCOME_CHANNEL_ID = "1456962809425559613";

// ====== XP / LEVELING CONFIG ======
const XP_FILE = path.join(__dirname, "xp.json");

// If you want XP only in specific channels, put IDs here. Leave [] to allow everywhere.
const XP_ALLOWED_CHANNEL_IDS = []; // e.g. ["123", "456"]

// If you want to block channels from earning XP, put IDs here.
const XP_BLOCKED_CHANNEL_IDS = ["1462386529765691473"]; // e.g. ["999"]

const XP_MIN = 10;
const XP_MAX = 20;
const XP_COOLDOWN_SECONDS = 60;

const PRESTIGE_AT_LEVEL = 50; // prestige when reaching this level
const PRESTIGE_RESET_LEVEL = 1; // new level after prestige
const PRESTIGE_RESET_XP = 0; // xp after prestige

// Where to announce level-ups (optional). Leave "" to announce in same channel.
const LEVEL_UP_CHANNEL_ID = "1456967580299559066";

// Optional level roles: level -> roleId
const LEVEL_ROLES = {
  2: "1462479094859038773", // Pool’s Closed
  5: "1462479797304295535", // Chair Rotator (PRO)
  8: "1462480092910587925", // Fake HC Member
  12: "1462480383328129075", // HC Member (Trust Me)
  16: "1462480917322010715", // Coin Beggar
  20: "1462480684496060728", // Club NX Bouncer
  25: "1462481138546381127", // Dancefloor Menace
  30: "1462481539391684760", // Definitely Legit
  40: "1462478268199600129", // Touch Grass Challenge Failed
  50: "1462478548961857844", // Hotel Legend (Unemployed)
};

// ====== RANK CARD: ROLE ACCENT COLOURS ======
const ROLE_ACCENTS = {
  "1462479094859038773": "#facc15",
  "1462479797304295535": "#d97706",
  "1462480092910587925": "#3b82f6",
  "1462480383328129075": "#22c55e",
  "1462480917322010715": "#f59e0b",
  "1462480684496060728": "#a855f7",
  "1462481138546381127": "#ec4899",
  "1462481539391684760": "#10b981",
  "1462478268199600129": "#16a34a",
  "1462478548961857844": "#38bdf8",
};

const DEFAULT_ACCENT = "#5865f2";

// ====== INVITE TRACKING STORAGE ======
const INVITES_FILE = path.join(__dirname, "invites.json");

function loadInvitesDataSafe() {
  if (!fs.existsSync(INVITES_FILE)) return { counts: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(INVITES_FILE, "utf8"));
    if (!parsed.counts) parsed.counts = {};
    return parsed;
  } catch {
    return { counts: {} };
  }
}

function saveInvitesData(obj) {
  fs.writeFileSync(INVITES_FILE, JSON.stringify(obj, null, 2), "utf8");
}

let invitesData = loadInvitesDataSafe();

// ====== VERIFICATION PENDING CODES (GLOBAL) ======
const pending = new Map();
function makeCode() {
  return "verify-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}
async function fetchHabboMotto(name) {
  const base = "https://www.habbo.com";
  const url = `${base}/api/public/users?name=${encodeURIComponent(name)}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetchFn(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (ConciergeBot; +https://discord.com) ConciergeBot/1.0",
        Referer: "https://www.habbo.com/",
      },
    });

    console.log("[Habbo API]", res.status, url);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.log("Habbo API blocked:", res.status, text.slice(0, 300));

      if (res.status === 403) {
        throw new Error(
          "Habbo is blocking this bot's IP (403). Try hosting the bot on a different network/IP."
        );
      }
      if (res.status === 404) throw new Error("Habbo user not found on habbo.com.");
      if (res.status === 429) throw new Error("Too many requests. Try again in a moment.");

      throw new Error(`Habbo API error (${res.status}).`);
    }

    const data = await res.json();
    return (data?.motto || "").trim();
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Habbo API timed out. Try again.");
    throw err;
  } finally {
    clearTimeout(t);
  }
}

// ====== LOG EMBEDS ======
function sendLogEmbed(guild, embed) {
  if (!LOG_CHANNEL_ID) return;
  const channel = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (!channel) return;
  channel.send({ embeds: [embed] }).catch(() => {});
}

function verifiedEmbed(userId, habboName) {
  return new EmbedBuilder()
    .setTitle("🛎️ Check-in Complete")
    .setColor(0x57f287)
    .addFields(
      { name: "User", value: `<@${userId}>`, inline: true },
      { name: "Habbo Guest", value: habboName, inline: true }
    )
    .setTimestamp();
}

function joinEmbed(member) {
  return new EmbedBuilder()
    .setTitle("✅ Member Joined")
    .setColor(0x57f287)
    .setDescription(`<@${member.user.id}> joined the server.`)
    .addFields(
      { name: "User", value: member.user.tag, inline: true },
      { name: "ID", value: member.user.id, inline: true }
    )
    .setTimestamp();
}

function leaveEmbed(member) {
  return new EmbedBuilder()
    .setTitle("🚪 Member Left")
    .setColor(0xed4245)
    .setDescription(`<@${member.user.id}> left the server.`)
    .addFields(
      { name: "User", value: member.user.tag, inline: true },
      { name: "ID", value: member.user.id, inline: true }
    )
    .setTimestamp();
}

// ====== CLIENT ======
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});
// ====== INVITE CACHE (guildId -> Map(code -> uses)) ======
const invitesCache = new Map();

async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map();
    invites.forEach((inv) => map.set(inv.code, inv.uses ?? 0));
    invitesCache.set(guild.id, map);
  } catch (e) {
    console.warn("⚠️ Could not fetch invites for guild:", guild.id, e?.message || e);
  }
}

client.on("inviteCreate", async (invite) => {
  if (!invite.guild) return;
  await cacheGuildInvites(invite.guild);
});

client.on("inviteDelete", async (invite) => {
  if (!invite.guild) return;
  await cacheGuildInvites(invite.guild);
});

// ====== JOIN / LEAVE + INVITE DETECTION + WELCOME ======
client.on("guildMemberAdd", async (member) => {
  sendLogEmbed(member.guild, joinEmbed(member));

  let inviterId = null;
  let inviteCodeUsed = null;

  try {
    const before = invitesCache.get(member.guild.id) || new Map();

    const invites = await member.guild.invites.fetch();
    const after = new Map();
    invites.forEach((inv) => after.set(inv.code, inv.uses ?? 0));

    let usedInvite = null;
    for (const inv of invites.values()) {
      const prevUses = before.get(inv.code) ?? 0;
      const nowUses = inv.uses ?? 0;
      if (nowUses > prevUses) {
        usedInvite = inv;
        break;
      }
    }

    invitesCache.set(member.guild.id, after);

    if (usedInvite?.inviter?.id) {
      inviterId = usedInvite.inviter.id;
      inviteCodeUsed = usedInvite.code;

      invitesData.counts[inviterId] = (invitesData.counts[inviterId] || 0) + 1;
      saveInvitesData(invitesData);
    }
  } catch (e) {
    console.warn("⚠️ Invite detection failed:", e?.message || e);
  }

  try {
    const welcomeChannel = await member.guild.channels
      .fetch(WELCOME_CHANNEL_ID)
      .catch(() => null);
    if (!welcomeChannel || !welcomeChannel.isTextBased()) return;

    const invitedLine = inviterId
      ? `👤 **Invited by:** <@${inviterId}>${
          inviteCodeUsed ? ` (code: \`${inviteCodeUsed}\`)` : ""
        }`
      : `👤 **Invited by:** _(unknown)_`;

    const embed = new EmbedBuilder()
      .setTitle("🏨 Welcome to the Hotel Lobby!")
      .setDescription(
        `Welcome, <@${member.id}>.\n\n` +
          `${invitedLine}\n\n` +
          `Please head to <#${VERIFY_CHANNEL_ID}> to **check in** and get started.`
      )
      .setColor(0x2ecc71)
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    await welcomeChannel.send({
      content: `<@${member.id}>`,
      embeds: [embed],
      allowedMentions: { users: inviterId ? [member.id, inviterId] : [member.id] },
    });
  } catch (err) {
    console.error("welcome send error:", err?.message || err);
  }
});

client.on("guildMemberRemove", (member) => {
  sendLogEmbed(member.guild, leaveEmbed(member));
});

// ====== READY ======
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    await cacheGuildInvites(guild);
  }
});

// ====== XP STORAGE ======
function loadXpDataSafe() {
  if (!fs.existsSync(XP_FILE)) return { users: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(XP_FILE, "utf8"));
    if (!parsed.users) parsed.users = {};
    return parsed;
  } catch {
    return { users: {} };
  }
}

function saveXpData(obj) {
  fs.writeFileSync(XP_FILE, JSON.stringify(obj, null, 2), "utf8");
}

let xpData = loadXpDataSafe();

function ensureXpUser(userId) {
  if (!xpData.users[userId]) {
    xpData.users[userId] = { xp: 0, level: 1, prestige: 0, lastXpAt: 0 };
  } else {
    if (typeof xpData.users[userId].prestige !== "number") xpData.users[userId].prestige = 0;
  }
  return xpData.users[userId];
}

// XP curve
function xpNeeded(level) {
  return 100 + (level - 1) * 50;
}

function shouldAwardXp(channelId) {
  const cid = String(channelId);
  if (XP_BLOCKED_CHANNEL_IDS.map(String).includes(cid)) return false;
  if (XP_ALLOWED_CHANNEL_IDS.length > 0 && !XP_ALLOWED_CHANNEL_IDS.map(String).includes(cid))
    return false;
  return true;
}

function randInt(min, max) {
  const a = Math.ceil(min);
  const b = Math.floor(max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
// Global rank: order by level desc, then xp desc
function getGlobalRank(userId) {
  const entries = Object.entries(xpData.users || {})
    .map(([uid, u]) => ({ uid, level: Number(u.level) || 1, xp: Number(u.xp) || 0 }))
    .sort((a, b) => (b.level - a.level) || (b.xp - a.xp));

  const total = entries.length || 1;
  const idx = entries.findIndex((x) => x.uid === userId);
  return { rank: idx >= 0 ? idx + 1 : total, total };
}

function getInviteCount(userId) {
  return Number(invitesData?.counts?.[userId] || 0);
}

function pickAccentForMember(member) {
  if (!member) return DEFAULT_ACCENT;

  for (const [roleId, hex] of Object.entries(ROLE_ACCENTS)) {
    if (member.roles.cache.has(roleId)) return hex;
  }

  const coloured = member.roles.cache
    .filter((r) => r.color && r.color !== 0)
    .sort((a, b) => b.position - a.position)
    .first();

  return coloured?.hexColor || DEFAULT_ACCENT;
}

// ====== RANK CARD DRAW HELPERS ======
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth, startSize, fontFamily = "Sans") {
  let size = startSize;
  do {
    ctx.font = `bold ${size}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  } while (size > 10);
  return size;
}

function drawPill(ctx, x, y, w, h, fill, stroke) {
  ctx.save();
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.stroke();
  }
  ctx.restore();
}

async function generateRankCard(member, userObj) {
  const user = member.user;

  const width = 934;
  const height = 282;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const accent = pickAccentForMember(member);
  const needed = xpNeeded(userObj.level);
  const progress = Math.max(0, Math.min(userObj.xp / needed, 1));

  const { rank, total } = getGlobalRank(user.id);
  const invites = getInviteCount(user.id);

  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#0f172a";
  roundRect(ctx, 18, 18, width - 36, height - 36, 18);
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.fillRect(18, 18, width - 36, 8);

  const avatarURL = user.displayAvatarURL({ extension: "png", size: 256 });
  const avatar = await loadImage(avatarURL);

  ctx.save();
  ctx.beginPath();
  ctx.arc(122, 141, 68, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, 54, 73, 136, 136);
  ctx.restore();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px Sans";
  ctx.fillText(user.username, 220, 108);

  const prestige = Number(userObj.prestige || 0);

  const rowX = 220;
  const rowY = 140;
  let afterPillX = rowX;

  if (prestige > 0) {
    const pillH = 26;
    const pillY = rowY - 18;
    const prestigeText = `⭐ PRESTIGE ${prestige}`;

    ctx.font = "bold 14px Sans";
    const textPadX = 14;
    const pillW = Math.max(120, Math.ceil(ctx.measureText(prestigeText).width) + textPadX * 2);

    drawPill(ctx, rowX, pillY, pillW, pillH, "#111827", accent);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px Sans";
    ctx.fillText(prestigeText, rowX + textPadX, pillY + 18);

    afterPillX = rowX + pillW + 16;
  }

  const restText = `Status ${userObj.level} • ${userObj.xp}/${needed} Rep`;
  const maxRestWidth = width - 36 - afterPillX - 20;
  const restSize = fitText(ctx, restText, maxRestWidth, 18, "Sans");

  ctx.fillStyle = "#94a3b8";
  ctx.font = `${restSize}px Sans`;
  ctx.fillText(restText, afterPillX, rowY);

  ctx.fillStyle = "#e5e7eb";
  ctx.font = "18px Sans";
  ctx.fillText(`🏆 #${rank} / ${total}`, 220, 172);
  ctx.fillText(`🎟️ Referrals: ${invites}`, 220, 198);

  const barX = 220;
  const barY = 220;
  const barW = 680;
  const barH = 26;

  ctx.fillStyle = "#111827";
  roundRect(ctx, barX, barY, barW, barH, 12);
  ctx.fill();

  ctx.fillStyle = accent;
  roundRect(ctx, barX, barY, Math.max(10, barW * progress), barH, 12);
  ctx.fill();

  ctx.fillStyle = "#0b1220";
  ctx.font = "bold 14px Sans";
  const pct = Math.round(progress * 100);
  ctx.fillText(`${pct}%`, barX + barW - 42, barY + 18);

  return canvas.toBuffer();
}
// ====== LEVEL ROLES + ANNOUNCEMENTS ======
function getLevelRolePairsSorted(guild) {
  return Object.entries(LEVEL_ROLES)
    .map(([lvl, roleId]) => ({ lvl: Number(lvl), roleId: String(roleId) }))
    .filter(
      (x) =>
        Number.isFinite(x.lvl) && x.lvl > 0 && x.roleId && guild.roles.cache.get(x.roleId)
    )
    .sort((a, b) => a.lvl - b.lvl);
}

async function applyLevelRoles(member, level) {
  const pairs = getLevelRolePairsSorted(member.guild);
  if (!pairs.length) return;

  const me = member.guild.members.me;
  if (!me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;

  const allLevelRoleIds = pairs.map((p) => p.roleId);

  const eligible = pairs.filter((p) => p.lvl <= level);
  if (!eligible.length) {
    await member.roles.remove(allLevelRoleIds).catch(() => {});
    return;
  }

  const targetRoleId = eligible[eligible.length - 1].roleId;

  const rolesToRemove = allLevelRoleIds.filter((id) => id !== targetRoleId);
  if (rolesToRemove.length) await member.roles.remove(rolesToRemove).catch(() => {});
  if (!member.roles.cache.has(targetRoleId)) await member.roles.add(targetRoleId).catch(() => {});
}

function cringeLevelUpLine(level, userMention) {
  const lines = {
    2: `🚧 ${userMention} unlocked **Pool’s Closed**. Lifeguard is imaginary.`,
    5: `🪑 ${userMention} is now **Chair Rotator (PRO)**. Spin responsibly.`,
    8: `🧢 ${userMention} achieved **Fake HC Member**. Badge? Never heard of it.`,
    12: `🧃 ${userMention} unlocked **HC Member (Trust Me)**. Source: “trust me”.`,
    16: `🪙 🚨 WARNING: ${userMention} has reached **Coin Beggar** status.`,
    20: `🚪 ${userMention} promoted to **Club NX Bouncer**. Pay: exposure.`,
    25: `🕺 DANGER: ${userMention} is now a **Dancefloor Menace**.`,
    30: `🧾 ${userMention} is now **Definitely Legit**. Nothing to see here.`,
    40: `🌱 INTERVENTION: ${userMention} unlocked **Touch Grass Challenge Failed**.`,
    50: `🏨 FINAL FORM: ${userMention} became **Hotel Legend (Unemployed)**. The hotel owns you now.`,
  };
  return lines[level] || `✨ ${userMention} leveled up to **Level ${level}**!`;
}

async function announceLevelUp(guild, fallbackChannel, user, newLevel) {
  const userMention = `<@${user.id}>`;
  const line = cringeLevelUpLine(newLevel, userMention);

  let targetChannel = fallbackChannel;

  if (LEVEL_UP_CHANNEL_ID) {
    const ch =
      guild.channels.cache.get(LEVEL_UP_CHANNEL_ID) ||
      (await guild.channels.fetch(LEVEL_UP_CHANNEL_ID).catch(() => null));
    if (ch && ch.isTextBased()) targetChannel = ch;
  }

  if (targetChannel) await targetChannel.send({ content: line }).catch(() => {});
}

async function processLevelUps({ guild, channel, userObj, userDiscord, member }) {
  while (userObj.xp >= xpNeeded(userObj.level)) {
    userObj.xp -= xpNeeded(userObj.level);
    userObj.level += 1;

    // PRESTIGE check
    if (userObj.level >= PRESTIGE_AT_LEVEL) {
      userObj.prestige = Number(userObj.prestige || 0) + 1;

      // reset
      userObj.level = PRESTIGE_RESET_LEVEL;
      userObj.xp = PRESTIGE_RESET_XP;

      // announce the level 50 line
      await announceLevelUp(guild, channel, userDiscord, PRESTIGE_AT_LEVEL).catch(() => {});

      // prestige message
      const userMention = `<@${userDiscord.id}>`;
      const prestigeMsg =
        `🏨✨ ${userMention} hit **Level ${PRESTIGE_AT_LEVEL}** and unlocked ` +
        `**PRESTIGE ${userObj.prestige}**! Back to Level ${PRESTIGE_RESET_LEVEL} we go.`;

      let targetChannel = channel;
      if (LEVEL_UP_CHANNEL_ID) {
        const ch =
          guild.channels.cache.get(LEVEL_UP_CHANNEL_ID) ||
          (await guild.channels.fetch(LEVEL_UP_CHANNEL_ID).catch(() => null));
        if (ch && ch.isTextBased()) targetChannel = ch;
      }
      if (targetChannel) await targetChannel.send({ content: prestigeMsg }).catch(() => {});

      // remove all level roles (back to level 1)
      if (member) {
        const pairs = getLevelRolePairsSorted(member.guild);
        const allLevelRoleIds = pairs.map((p) => p.roleId);
        if (allLevelRoleIds.length) await member.roles.remove(allLevelRoleIds).catch(() => {});
      }

      break;
    }

    await announceLevelUp(guild, channel, userDiscord, userObj.level).catch(() => {});
    if (member) await applyLevelRoles(member, userObj.level).catch(() => {});
  }
}

// ====== SLASH COMMANDS ======
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction.commandName;

    // /ping
    if (cmd === "ping") {
      return interaction.reply("pong ✅");
    }

    // /level
    if (cmd === "level") {
      const u = interaction.options.getUser("user") || interaction.user;
      const userObj = ensureXpUser(u.id);
      const needed = xpNeeded(userObj.level);

      return interaction.reply(
        `🛎️ <@${u.id}> is **Status ${userObj.level}**` +
          (userObj.prestige ? ` (⭐ Prestige **${userObj.prestige}**)` : "") +
          `\nReputation: **${userObj.xp}/${needed}**`
      );
    }

    // /invites
    if (cmd === "invites") {
      const u = interaction.options.getUser("user") || interaction.user;
      const count = invitesData.counts[u.id] || 0;
      return interaction.reply(`🎟️ <@${u.id}> has **${count}** referral(s).`);
    }

    // /invleaderboard
    if (cmd === "invleaderboard") {
      const entries = Object.entries(invitesData.counts || {})
        .map(([uid, count]) => ({ uid, count: Number(count) || 0 }))
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 25);

      if (!entries.length) return interaction.reply("No referrals tracked yet.");

      const lines = entries.map((x, i) => `**${i + 1}.** <@${x.uid}> — **${x.count}**`);

      const embed = new EmbedBuilder()
        .setTitle("🏆 Referral Leaderboard")
        .setDescription(lines.join("\n"))
        .setColor(0x5865f2)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // /xpleaderboard
    if (cmd === "xpleaderboard") {
      const entries = Object.entries(xpData.users || {})
        .map(([uid, u]) => ({
          uid,
          level: Number(u.level) || 1,
          prestige: Number(u.prestige) || 0,
          xp: Number(u.xp) || 0,
        }))
        .sort((a, b) => (b.prestige - a.prestige) || (b.level - a.level) || (b.xp - a.xp))
        .slice(0, 20);

      if (!entries.length) return interaction.reply("No XP data yet.");

      const lines = entries.map(
        (x, i) => `**${i + 1}.** <@${x.uid}> — **P${x.prestige} Lvl ${x.level}** (${x.xp}xp)`
      );

      const embed = new EmbedBuilder()
        .setTitle("🏆 Reputation Leaderboard")
        .setDescription(lines.join("\n"))
        .setColor(0x5865f2)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // /rank (this can take time, so defer)
    if (cmd === "rank") {
      await interaction.deferReply();

      const u = interaction.options.getUser("user") || interaction.user;
      const member = await interaction.guild.members.fetch(u.id).catch(() => null);
      if (!member) return interaction.editReply("Couldn't fetch that member.");

      const userObj = ensureXpUser(u.id);

      const buf = await generateRankCard(member, userObj).catch((e) => {
        console.error("rank card error:", e);
        return null;
      });
      if (!buf) return interaction.editReply("Failed to generate rank card.");

      const att = new AttachmentBuilder(buf, { name: "rank.png" });
      return interaction.editReply({ files: [att] });
    }

    // /getcode
    if (cmd === "getcode") {
      const code = makeCode();
      pending.set(interaction.user.id, code);

      try {
        await interaction.user.send(
          `🛎️ Your check-in code is: **${code}**\n\n` +
            `Set your Habbo motto to include that code, then run:\n` +
            `\`/verify habbo:YourHabboName\``
        );
        return interaction.reply({ content: "📩 I’ve DM’d your code!", ephemeral: true });
      } catch {
        return interaction.reply({
          content:
            "❌ I couldn’t DM you. Turn on **Allow direct messages** for this server, then try again.",
          ephemeral: true,
        });
      }
    }

    // /verify
    if (cmd === "verify") {
      await interaction.deferReply({ ephemeral: true });

      const name = interaction.options.getString("habbo", true).trim();
      const code = pending.get(interaction.user.id);
      if (!code) return interaction.editReply(`Use \`/getcode\` first.`);

      try {
        const motto = await fetchHabboMotto(name);

        const norm = (s) => (s || "").trim().replace(/\s+/g, " ");
        if (!norm(motto).includes(norm(code))) {
          return interaction.editReply(
            `Motto doesn't match yet.\n` +
              `Expected to include: **${code}**\n` +
              `Found motto: **${motto || "(empty)"}**\n\n` +
              `Tip: wait 10–30 seconds after changing your motto, then try again.`
          );
        }

        const member = await interaction.guild.members.fetch(interaction.user.id);

        const verifiedRole = interaction.guild.roles.cache.find((r) => r.name === VERIFIED_ROLE);
        if (!verifiedRole) return interaction.editReply("Verified role not found.");

        await member.roles.add(verifiedRole);

        const oldRole = interaction.guild.roles.cache.find((r) => r.name === OLD_ROLE_TO_REMOVE);
        if (oldRole) await member.roles.remove(oldRole).catch(() => {});

        if (member.manageable) {
          await member.setNickname(name.slice(0, 32)).catch(() => {});
        }

        pending.delete(interaction.user.id);

        sendLogEmbed(interaction.guild, verifiedEmbed(interaction.user.id, name));
        return interaction.editReply("✅ Check-in complete. You’re verified!");
      } catch (err) {
        return interaction.editReply(`Verification failed: ${err.message}`);
      }
    }

    // If a command exists but isn't handled:
    return interaction.reply({ content: "Command not wired up yet 😬", ephemeral: true });
  } catch (err) {
    console.error("interactionCreate error:", err);
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({ content: "Something went wrong 😬", ephemeral: true }).catch(() => {});
    }
  }
});

// ====== LOGIN (exactly once) ======
const token = String(process.env.DISCORD_TOKEN || "").trim();
if (!token) {
  console.error("❌ No DISCORD_TOKEN set in environment variables.");
  process.exit(1);
}
client.login(token).catch(console.error);

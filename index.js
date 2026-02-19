require("dotenv").config();

console.log("Bot starting...");

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionsBitField,
  MessageFlags,
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

const UNVERIFIED_ROLE_ID = "1457150062382682243";
const VERIFY_CHANNEL_ID = "1462386529765691473";
const LOG_CHANNEL_ID = "1456955298597175391";
const WELCOME_CHANNEL_ID = "1456962809425559613";

// ====== XP / LEVELING CONFIG ======
const XP_FILE = process.env.XP_FILE || path.join(__dirname, "xp.json");
const XP_FILE_BAK = `${XP_FILE}.bak`;

// If you want XP only in specific channels, put IDs here. Leave [] to allow everywhere.
const XP_ALLOWED_CHANNEL_IDS = []; // e.g. ["123", "456"]

// If you want to block channels from earning XP, put IDs here.
const XP_BLOCKED_CHANNEL_IDS = ["1462386529765691473"]; // e.g. ["999"]

const XP_MIN = 10;
const XP_MAX = 20;
const XP_COOLDOWN_SECONDS = 30;
const REACTION_XP_MIN = 8;
const REACTION_XP_MAX = 15;
const REACTION_XP_COOLDOWN_SECONDS = 45;
const LEVEL_ANNOUNCE_DEDUPE_SECONDS = 60 * 60 * 6;

const PRESTIGE_AT_LEVEL = 50; // prestige when reaching this level
const PRESTIGE_RESET_LEVEL = 1; // new level after prestige
const PRESTIGE_RESET_XP = 0; // xp after prestige

// Where to announce bot updates (level ups/prestige). Leave "" to announce in same channel.
const BOT_CHAT_CHANNEL_ID =
  process.env.BOT_CHAT_CHANNEL_ID || "1456952227909603408";
const LEVEL_UP_CHANNEL_ID =
  process.env.LEVEL_UP_CHANNEL_ID || "1456967580299559066";
const WEEKLY_LEADERBOARD_CHANNEL_ID =
  process.env.WEEKLY_LEADERBOARD_CHANNEL_ID || LEVEL_UP_CHANNEL_ID || BOT_CHAT_CHANNEL_ID;

const GIVEAWAY_ROLE_ID = process.env.GIVEAWAY_ROLE_ID || "";
const HABBO_GAMES_ROLE_ID = process.env.HABBO_GAMES_ROLE_ID || "";

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
const TWL_POINTS_FILE = process.env.TWL_POINTS_FILE || path.join(__dirname, "twl-points.json");
const PENDING_CODES_FILE = process.env.PENDING_CODES_FILE || path.join(__dirname, "pending-codes.json");

function getWeekKeyUTC(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}

function loadInvitesDataSafe() {
  if (!fs.existsSync(INVITES_FILE)) {
    return { counts: {}, weeklyCounts: {}, weeklyMeta: { weekKey: getWeekKeyUTC() } };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(INVITES_FILE, "utf8"));
    if (!parsed.counts) parsed.counts = {};
    if (!parsed.weeklyCounts) parsed.weeklyCounts = {};
    if (!parsed.weeklyMeta || typeof parsed.weeklyMeta !== "object") {
      parsed.weeklyMeta = { weekKey: getWeekKeyUTC() };
    }
    if (!parsed.weeklyMeta.weekKey) parsed.weeklyMeta.weekKey = getWeekKeyUTC();
    return parsed;
  } catch {
    return { counts: {}, weeklyCounts: {}, weeklyMeta: { weekKey: getWeekKeyUTC() } };
  }
}

function saveInvitesData(obj) {
  fs.writeFileSync(INVITES_FILE, JSON.stringify(obj, null, 2), "utf8");
}

let invitesData = loadInvitesDataSafe();

// ====== TWL POINTS STORAGE ======
function loadTwlPointsSafe() {
  if (!fs.existsSync(TWL_POINTS_FILE)) {
    return { totals: {}, weeklyCounts: {}, weeklyMeta: { weekKey: getWeekKeyUTC() } };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(TWL_POINTS_FILE, "utf8"));
    if (!parsed.totals || typeof parsed.totals !== "object") parsed.totals = {};
    if (!parsed.weeklyCounts || typeof parsed.weeklyCounts !== "object") parsed.weeklyCounts = {};
    if (!parsed.weeklyMeta || typeof parsed.weeklyMeta !== "object") {
      parsed.weeklyMeta = { weekKey: getWeekKeyUTC() };
    }
    if (!parsed.weeklyMeta.weekKey) parsed.weeklyMeta.weekKey = getWeekKeyUTC();
    return parsed;
  } catch {
    return { totals: {}, weeklyCounts: {}, weeklyMeta: { weekKey: getWeekKeyUTC() } };
  }
}

function saveTwlPointsData(obj) {
  fs.writeFileSync(TWL_POINTS_FILE, JSON.stringify(obj, null, 2), "utf8");
}

let twlPointsData = loadTwlPointsSafe();

function getTopTwlWeekly(limit = 3) {
  return Object.entries(twlPointsData.weeklyCounts || {})
    .map(([uid, count]) => ({ uid, count: Number(count) || 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function getTopTwlAllTime(limit = 10) {
  return Object.entries(twlPointsData.totals || {})
    .map(([uid, count]) => ({ uid, count: Number(count) || 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function addTwlPoints(userId, amount) {
  maybeRollWeeklyData();
  const n = Number(amount) || 0;
  if (n === 0) return;

  twlPointsData.totals[userId] = Math.max(0, (Number(twlPointsData.totals[userId]) || 0) + n);
  twlPointsData.weeklyCounts[userId] = Math.max(0, (Number(twlPointsData.weeklyCounts[userId]) || 0) + n);

  if (twlPointsData.totals[userId] === 0) delete twlPointsData.totals[userId];
  if (twlPointsData.weeklyCounts[userId] === 0) delete twlPointsData.weeklyCounts[userId];

  saveTwlPointsData(twlPointsData);
}

// ====== VERIFICATION PENDING CODES (GLOBAL) ======
function loadPendingCodesSafe() {
  if (!fs.existsSync(PENDING_CODES_FILE)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(PENDING_CODES_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePendingCodes() {
  const asObj = Object.fromEntries(pending.entries());
  fs.writeFileSync(PENDING_CODES_FILE, JSON.stringify(asObj, null, 2), "utf8");
}

const pending = new Map(Object.entries(loadPendingCodesSafe()));

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

async function assignPostVerifyRoles(member) {
  if (!member?.guild) return;

  const roleIds = [GIVEAWAY_ROLE_ID, HABBO_GAMES_ROLE_ID]
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  if (!roleIds.length) return;

  const me = member.guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;

  for (const roleId of roleIds) {
    const role = member.guild.roles.cache.get(roleId);
    if (!role) continue;
    if (me.roles.highest.position <= role.position) continue;
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role).catch(() => {});
    }
  }
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

// ====== JOIN / LEAVE + INVITE DETECTION + WELCOME + UNVERIFIED ROLE ======
client.on("guildMemberAdd", async (member) => {
  sendLogEmbed(member.guild, joinEmbed(member));

  // ✅ Give Unverified role on join
  try {
    const me = member.guild.members.me;
    if (me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
      const role =
        member.guild.roles.cache.get(UNVERIFIED_ROLE_ID) ||
        member.guild.roles.cache.find((r) => r.name === OLD_ROLE_TO_REMOVE); // "Unverified"

      if (!role) {
        console.warn("⚠️ Unverified role not found.");
      } else if (me.roles.highest.position <= role.position) {
        console.warn("⚠️ Bot role must be ABOVE Unverified in the role list.");
      } else if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role).catch(() => {});
      }
    } else {
      console.warn("⚠️ Missing ManageRoles permission; can't assign Unverified.");
    }
  } catch (e) {
    console.warn("⚠️ Failed to assign Unverified:", e?.message || e);
  }

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

      maybeRollWeeklyData();
      invitesData.counts[inviterId] = (invitesData.counts[inviterId] || 0) + 1;
      invitesData.weeklyCounts[inviterId] = (invitesData.weeklyCounts[inviterId] || 0) + 1;
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

  maybeRollWeeklyData();

  for (const guild of client.guilds.cache.values()) {
    await cacheGuildInvites(guild);
  }

  startWeeklyLeaderboardScheduler();
});

// ====== XP STORAGE ======
function loadXpDataSafe() {
  const base = { users: {}, weeklyXp: {}, weeklyMeta: { weekKey: getWeekKeyUTC() } };

  const normalize = (parsed) => {
    if (!parsed || typeof parsed !== "object") return { ...base };
    if (!parsed.users || typeof parsed.users !== "object") parsed.users = {};
    if (!parsed.weeklyXp || typeof parsed.weeklyXp !== "object") parsed.weeklyXp = {};
    if (!parsed.weeklyMeta || typeof parsed.weeklyMeta !== "object") {
      parsed.weeklyMeta = { weekKey: getWeekKeyUTC() };
    }
    if (!parsed.weeklyMeta.weekKey) parsed.weeklyMeta.weekKey = getWeekKeyUTC();
    return parsed;
  };

  const loadFile = (filePath) => {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return normalize(JSON.parse(raw));
  };

  try {
    const primary = loadFile(XP_FILE);
    if (primary) return primary;
  } catch (err) {
    console.error(`[XP] Failed to read ${XP_FILE}:`, err?.message || err);
  }

  try {
    const backup = loadFile(XP_FILE_BAK);
    if (backup) {
      console.warn(`[XP] Recovered XP data from backup: ${XP_FILE_BAK}`);
      return backup;
    }
  } catch (err) {
    console.error(`[XP] Failed to read ${XP_FILE_BAK}:`, err?.message || err);
  }

  return base;
}

function saveXpData(obj) {
  const json = JSON.stringify(obj, null, 2);
  const dir = path.dirname(XP_FILE);
  const base = path.basename(XP_FILE);
  const tmp = path.join(dir, `${base}.tmp`);

  fs.writeFileSync(tmp, json, "utf8");
  fs.renameSync(tmp, XP_FILE);
  fs.writeFileSync(XP_FILE_BAK, json, "utf8");
}

let xpData = loadXpDataSafe();

function currentWeekKey() {
  return getWeekKeyUTC();
}

function ensureWeeklyStores() {
  if (!xpData.weeklyXp || typeof xpData.weeklyXp !== "object") xpData.weeklyXp = {};
  if (!xpData.weeklyMeta || typeof xpData.weeklyMeta !== "object") {
    xpData.weeklyMeta = { weekKey: currentWeekKey() };
  }
  if (!xpData.weeklyMeta.weekKey) xpData.weeklyMeta.weekKey = currentWeekKey();

  if (!invitesData.weeklyCounts || typeof invitesData.weeklyCounts !== "object") {
    invitesData.weeklyCounts = {};
  }
  if (!invitesData.weeklyMeta || typeof invitesData.weeklyMeta !== "object") {
    invitesData.weeklyMeta = { weekKey: currentWeekKey() };
  }
  if (!invitesData.weeklyMeta.weekKey) invitesData.weeklyMeta.weekKey = currentWeekKey();

  if (!twlPointsData.weeklyCounts || typeof twlPointsData.weeklyCounts !== "object") {
    twlPointsData.weeklyCounts = {};
  }
  if (!twlPointsData.weeklyMeta || typeof twlPointsData.weeklyMeta !== "object") {
    twlPointsData.weeklyMeta = { weekKey: currentWeekKey() };
  }
  if (!twlPointsData.weeklyMeta.weekKey) twlPointsData.weeklyMeta.weekKey = currentWeekKey();
}

ensureWeeklyStores();

function maybeRollWeeklyData() {
  ensureWeeklyStores();

  const nowWeek = currentWeekKey();
  let changed = false;

  if (xpData.weeklyMeta.weekKey !== nowWeek) {
    xpData.weeklyMeta.weekKey = nowWeek;
    xpData.weeklyXp = {};
    changed = true;
  }

  if (invitesData.weeklyMeta.weekKey !== nowWeek) {
    invitesData.weeklyMeta.weekKey = nowWeek;
    invitesData.weeklyCounts = {};
    changed = true;
  }

  if (twlPointsData.weeklyMeta.weekKey !== nowWeek) {
    twlPointsData.weeklyMeta.weekKey = nowWeek;
    twlPointsData.weeklyCounts = {};
    changed = true;
  }

  if (changed) {
    saveXpData(xpData);
    saveInvitesData(invitesData);
    saveTwlPointsData(twlPointsData);
  }
}

async function postWeeklyLeaderboards(guild) {
  maybeRollWeeklyData();

  const target =
    guild.channels.cache.get(WEEKLY_LEADERBOARD_CHANNEL_ID) ||
    (await guild.channels.fetch(WEEKLY_LEADERBOARD_CHANNEL_ID).catch(() => null));

  if (!target || !target.isTextBased()) return;

  const xpEntries = Object.entries(xpData.weeklyXp || {})
    .map(([uid, xp]) => ({ uid, xp: Number(xp) || 0 }))
    .filter((x) => x.xp > 0)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 10);

  const invEntries = Object.entries(invitesData.weeklyCounts || {})
    .map(([uid, invites]) => ({ uid, invites: Number(invites) || 0 }))
    .filter((x) => x.invites > 0)
    .sort((a, b) => b.invites - a.invites)
    .slice(0, 10);

  const xpWinner = xpEntries[0] ? `<@${xpEntries[0].uid}>` : "No winner";
  const invWinner = invEntries[0] ? `<@${invEntries[0].uid}>` : "No winner";

  const xpLines = xpEntries.length
    ? xpEntries.map((x, i) => `**${i + 1}.** <@${x.uid}> — **${x.xp} XP**`).join("\n")
    : "No weekly XP yet.";

  const invLines = invEntries.length
    ? invEntries
        .map((x, i) => `**${i + 1}.** <@${x.uid}> — **${x.invites} invites**`)
        .join("\n")
    : "No weekly invites yet.";

  const twlEntries = getTopTwlWeekly(3);
  const twlLines = twlEntries.length
    ? twlEntries
        .map((x, i) => `**${i + 1}.** <@${x.uid}> — **${x.count}** TWL point${x.count === 1 ? "" : "s"}`)
        .join("\n")
    : "No weekly TWL points yet.";

  const embed = new EmbedBuilder()
    .setTitle("🏆 Weekly Leaderboards")
    .setColor(0xf1c40f)
    .setDescription(
      `Weekly wrap-up is here!\n` +
        `⭐ **XP Winner:** ${xpWinner}\n` +
        `🎟️ **Invite Winner:** ${invWinner}`
    )
    .addFields(
      { name: "Top XP (This Week)", value: xpLines },
      { name: "Top Invites (This Week)", value: invLines },
      { name: "Top TWL Winners (This Week)", value: twlLines }
    )
    .setTimestamp();

  const mentions = [xpEntries[0]?.uid, invEntries[0]?.uid, ...twlEntries.map((x) => x.uid)].filter(Boolean);

  await target
    .send({
      content: mentions.length ? mentions.map((id) => `<@${id}>`).join(" ") : "Weekly winners pending.",
      embeds: [embed],
      allowedMentions: { users: mentions },
    })
    .catch(() => {});
}

function startWeeklyLeaderboardScheduler() {
  const checkAndRun = async () => {
    const now = new Date();
    const isSunday = now.getUTCDay() === 0;
    const isMidnightHour = now.getUTCHours() === 0;
    const inWindow = now.getUTCMinutes() < 15;

    if (!isSunday || !isMidnightHour || !inWindow) {
      maybeRollWeeklyData();
      return;
    }

    const weekTag = `${currentWeekKey()}-posted`;
    ensureWeeklyStores();

    if (xpData.weeklyMeta.lastPostedWeekTag === weekTag) return;

    for (const guild of client.guilds.cache.values()) {
      await postWeeklyLeaderboards(guild).catch(() => {});
    }

    xpData.weeklyMeta.weekKey = currentWeekKey();
    invitesData.weeklyMeta.weekKey = currentWeekKey();
    twlPointsData.weeklyMeta.weekKey = currentWeekKey();
    xpData.weeklyXp = {};
    invitesData.weeklyCounts = {};
    twlPointsData.weeklyCounts = {};
    xpData.weeklyMeta.lastPostedWeekTag = weekTag;
    saveXpData(xpData);
    saveInvitesData(invitesData);
    saveTwlPointsData(twlPointsData);
  };

  checkAndRun().catch(() => {});
  setInterval(() => {
    checkAndRun().catch(() => {});
  }, 5 * 60 * 1000);
}

function ensureXpUser(userId) {
  if (!xpData.users[userId]) {
    xpData.users[userId] = {
      xp: 0,
      level: 1,
      prestige: 0,
      lastXpAt: 0,
      lastReactionXpAt: 0,
      lastAnnouncedLevel: 0,
      lastAnnouncedLevelAt: 0,
    };
  } else {
    if (typeof xpData.users[userId].prestige !== "number") xpData.users[userId].prestige = 0;
    if (typeof xpData.users[userId].lastReactionXpAt !== "number") {
      xpData.users[userId].lastReactionXpAt = 0;
    }
    if (typeof xpData.users[userId].lastAnnouncedLevel !== "number") {
      xpData.users[userId].lastAnnouncedLevel = 0;
    }
    if (typeof xpData.users[userId].lastAnnouncedLevelAt !== "number") {
      xpData.users[userId].lastAnnouncedLevelAt = 0;
    }
  }
  return xpData.users[userId];
}

function shouldAnnounceLevel(userObj, level) {
  const now = Date.now();
  const lastLevel = Number(userObj.lastAnnouncedLevel || 0);
  const lastAt = Number(userObj.lastAnnouncedLevelAt || 0);

  if (lastLevel === level && now - lastAt < LEVEL_ANNOUNCE_DEDUPE_SECONDS * 1000) {
    return false;
  }

  userObj.lastAnnouncedLevel = level;
  userObj.lastAnnouncedLevelAt = now;
  return true;
}

// XP curve
function xpNeeded(level) {
  return 70 + (level - 1) * 35;
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
    .sort((a, b) => b.level - a.level || b.xp - a.xp);

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
    .filter((x) => Number.isFinite(x.lvl) && x.lvl > 0 && x.roleId && guild.roles.cache.get(x.roleId))
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
      if (shouldAnnounceLevel(userObj, PRESTIGE_AT_LEVEL)) {
        await announceLevelUp(guild, channel, userDiscord, PRESTIGE_AT_LEVEL).catch(() => {});
      }

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

    if (shouldAnnounceLevel(userObj, userObj.level)) {
      await announceLevelUp(guild, channel, userDiscord, userObj.level).catch(() => {});
    }
    if (member) await applyLevelRoles(member, userObj.level).catch(() => {});
  }
}

async function awardXpAndProcess({ guild, channel, userId, userDiscord, amount }) {
  maybeRollWeeklyData();

  const userObj = ensureXpUser(userId);
  userObj.xp += amount;
  xpData.weeklyXp[userId] = (xpData.weeklyXp[userId] || 0) + amount;

  saveXpData(xpData);

  const member = await guild.members.fetch(userId).catch(() => null);

  await processLevelUps({
    guild,
    channel,
    userObj,
    userDiscord,
    member,
  }).catch(() => {});

  saveXpData(xpData);
}

// ====== MESSAGE CREATE (XP AWARDING) ======
client.on("messageCreate", async (message) => {
  try {
    if (!message.guild) return; // no XP in DMs
    if (message.author.bot) return; // no XP for bots

    if (message.content.startsWith(`${PREFIX}twl`)) {
      const parts = message.content.trim().split(/\s+/);
      const sub = (parts[1] || "").toLowerCase();
      const target = message.mentions.users.first();
      const amountRaw = Number(parts.find((x, i) => i >= 2 && /^-?\d+$/.test(x)));
      const amount = Number.isFinite(amountRaw) ? amountRaw : 1;

      const isAdmin =
        message.memberPermissions?.has(PermissionsBitField.Flags.Administrator) ||
        message.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild);

      if (!sub || sub === "help") {
        await message.channel
          .send(
            "🧮 **TWL points**\n" +
              "`!twl points [@user]` - show points\n" +
              "`!twl top [weekly|all]` - leaderboard\n" +
              "`!twl add @user [amount]` - admin add points\n" +
              "`!twl take @user [amount]` - admin remove points\n" +
              "`!twl set @user <amount>` - admin set total points\n" +
              "`!twl resetweekly` - admin reset weekly points"
          )
          .catch(() => {});
        return;
      }

      if (sub === "points") {
        maybeRollWeeklyData();
        const u = target || message.author;
        const total = Number(twlPointsData.totals[u.id]) || 0;
        const weekly = Number(twlPointsData.weeklyCounts[u.id]) || 0;
        await message.channel
          .send(`🏅 <@${u.id}> — **${total}** total TWL points (**${weekly}** this week).`)
          .catch(() => {});
        return;
      }

      if (sub === "top") {
        maybeRollWeeklyData();
        const mode = (parts[2] || "weekly").toLowerCase();
        const entries = mode === "all" ? getTopTwlAllTime(10) : getTopTwlWeekly(10);
        if (!entries.length) {
          await message.channel.send("No TWL points tracked yet.").catch(() => {});
          return;
        }
        const lines = entries.map((x, i) => `**${i + 1}.** <@${x.uid}> — **${x.count}**`);
        await message.channel
          .send(`🏆 **TWL ${mode === "all" ? "All-Time" : "Weekly"} Leaderboard**\n${lines.join("\n")}`)
          .catch(() => {});
        return;
      }

      if (!isAdmin) {
        await message.channel.send("❌ You don’t have permission to use TWL admin actions.").catch(() => {});
        return;
      }

      if (sub === "resetweekly") {
        twlPointsData.weeklyCounts = {};
        twlPointsData.weeklyMeta.weekKey = currentWeekKey();
        saveTwlPointsData(twlPointsData);
        await message.channel.send("✅ Reset TWL weekly points.").catch(() => {});
        return;
      }

      if (!target) {
        await message.channel.send("Mention a user, e.g. `!twl add @user 1`").catch(() => {});
        return;
      }

      if (sub === "add") {
        addTwlPoints(target.id, Math.max(1, amount));
      } else if (sub === "take") {
        addTwlPoints(target.id, -Math.max(1, amount));
      } else if (sub === "set") {
        const desired = Math.max(0, Number.isFinite(amountRaw) ? amountRaw : 0);
        const curr = Number(twlPointsData.totals[target.id]) || 0;
        addTwlPoints(target.id, desired - curr);
      } else {
        await message.channel.send("Unknown subcommand. Try `!twl help`.").catch(() => {});
        return;
      }

      const total = Number(twlPointsData.totals[target.id]) || 0;
      const weekly = Number(twlPointsData.weeklyCounts[target.id]) || 0;
      await message.channel
        .send(`✅ Updated <@${target.id}> — **${total}** total, **${weekly}** this week.`)
        .catch(() => {});
      return;
    }

    // Channel eligibility
    if (!shouldAwardXp(message.channelId)) return;

    // 5+ word requirement
    const words = message.content.trim().split(/\s+/).filter(Boolean);
    if (words.length < 5) return;

    const userId = message.author.id;
    const userObj = ensureXpUser(userId);

    // Cooldown
    const now = Date.now();
    const last = Number(userObj.lastXpAt || 0);
    const cooldownMs = XP_COOLDOWN_SECONDS * 1000;
    if (now - last < cooldownMs) return;

    // Award XP
    const gained = randInt(XP_MIN, XP_MAX);
    userObj.lastXpAt = now;
    await awardXpAndProcess({
      guild: message.guild,
      channel: message.channel,
      userId,
      userDiscord: message.author,
      amount: gained,
    }).catch(() => {});
  } catch (err) {
    console.error("messageCreate XP error:", err?.message || err);
  }
});

client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (user.bot) return;

    if (reaction.partial) await reaction.fetch().catch(() => null);
    if (!reaction.message?.guild) return;

    const guild = reaction.message.guild;
    const channel = reaction.message.channel;
    if (!channel?.isTextBased()) return;
    if (!shouldAwardXp(channel.id)) return;

    const messageAuthorId = reaction.message.author?.id;
    if (messageAuthorId && messageAuthorId === user.id) return;

    const userObj = ensureXpUser(user.id);
    const now = Date.now();
    const last = Number(userObj.lastReactionXpAt || 0);
    const cooldownMs = REACTION_XP_COOLDOWN_SECONDS * 1000;
    if (now - last < cooldownMs) return;

    const gained = randInt(REACTION_XP_MIN, REACTION_XP_MAX);
    userObj.lastReactionXpAt = now;

    await awardXpAndProcess({
      guild,
      channel,
      userId: user.id,
      userDiscord: user,
      amount: gained,
    }).catch(() => {});
  } catch (err) {
    console.error("messageReactionAdd XP error:", err?.message || err);
  }
});

// ====== SLASH COMMANDS ======
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction.commandName;

    // /ping
    if (cmd === "ping") {
      return interaction.reply("pong ✅");
    }

    // /xpinfo
    if (cmd === "xpinfo") {
      const avg = Math.round((XP_MIN + XP_MAX) / 2);

      const blocked =
        (XP_BLOCKED_CHANNEL_IDS || []).map((id) => `<#${id}>`).join(", ") || "None";

      const allowed =
        XP_ALLOWED_CHANNEL_IDS.length > 0
          ? XP_ALLOWED_CHANNEL_IDS.map((id) => `<#${id}>`).join(", ")
          : "All channels (except blocked)";

      const embed = new EmbedBuilder()
        .setTitle("📈 XP Info")
        .setColor(0x5865f2)
        .setDescription(
          `⏱️ **Cooldown:** 1 award every **${XP_COOLDOWN_SECONDS}s** per user\n` +
            `🎲 **XP per award:** **${XP_MIN}–${XP_MAX}** (avg ~${avg})\n` +
            `😀 **Reaction XP:** **${REACTION_XP_MIN}–${REACTION_XP_MAX}** every **${REACTION_XP_COOLDOWN_SECONDS}s**\n` +
            `🗣️ **Minimum message:** **5+ words**\n` +
            `✅ **XP allowed in:** ${allowed}\n` +
            `🚫 **XP blocked in:** ${blocked}\n\n` +
            `📊 **XP needed per level:** \`70 + (level - 1) * 35\`\n` +
            `⭐ **Prestige:** at **Level ${PRESTIGE_AT_LEVEL}** (resets to Level ${PRESTIGE_RESET_LEVEL})`
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // /xpadmin
    if (cmd === "xpadmin") {
      const perms = interaction.memberPermissions;
      const isAllowed =
        perms?.has(PermissionsBitField.Flags.Administrator) ||
        perms?.has(PermissionsBitField.Flags.ManageGuild);

      if (!isAllowed) {
        return interaction.reply({
          content: "❌ You don’t have permission to use this.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const action = interaction.options.getSubcommand(true);
      const targetUser = interaction.options.getUser("user", true);
      const amount = interaction.options.getInteger("amount") ?? 0;

      const targetObj = ensureXpUser(targetUser.id);

      if (action === "give") {
        if (amount <= 0)
          return interaction.reply({ content: "Amount must be > 0.", flags: MessageFlags.Ephemeral });
        targetObj.xp += amount;
      }

      if (action === "take") {
        if (amount <= 0)
          return interaction.reply({ content: "Amount must be > 0.", flags: MessageFlags.Ephemeral });
        targetObj.xp = Math.max(0, targetObj.xp - amount);
      }

      if (action === "set") {
        if (amount < 0)
          return interaction.reply({ content: "Amount can’t be negative.", flags: MessageFlags.Ephemeral });
        targetObj.xp = amount;
      }

      if (action === "reset") {
        targetObj.xp = 0;
        targetObj.level = 1;
        targetObj.prestige = 0;
        targetObj.lastXpAt = 0;
        targetObj.lastReactionXpAt = 0;
        targetObj.lastAnnouncedLevel = 0;
        targetObj.lastAnnouncedLevelAt = 0;
      }

      saveXpData(xpData);

      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

      // If give/set might push over thresholds, process level-ups
      if (action === "give" || action === "set") {
        await processLevelUps({
          guild: interaction.guild,
          channel: interaction.channel,
          userObj: targetObj,
          userDiscord: targetUser,
          member,
        }).catch(() => {});
      }

      // Re-apply level roles (useful after reset)
      if (member) {
        await applyLevelRoles(member, targetObj.level).catch(() => {});
      }

      saveXpData(xpData);

      const needed = xpNeeded(targetObj.level);

      return interaction.reply({
        content:
          `✅ Updated <@${targetUser.id}>.\n` +
          `⭐ Prestige: **${targetObj.prestige || 0}** | Level: **${targetObj.level}** | XP: **${targetObj.xp}/${needed}**`,
        flags: MessageFlags.Ephemeral,
      });
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

    // /twlpoints
    if (cmd === "twlpoints") {
      maybeRollWeeklyData();
      const u = interaction.options.getUser("user") || interaction.user;
      const total = Number(twlPointsData.totals[u.id]) || 0;
      const weekly = Number(twlPointsData.weeklyCounts[u.id]) || 0;
      return interaction.reply(`🏅 <@${u.id}> has **${total}** total TWL points (**${weekly}** this week).`);
    }

    // /twlleaderboard
    if (cmd === "twlleaderboard") {
      maybeRollWeeklyData();
      const mode = (interaction.options.getString("mode") || "weekly").toLowerCase();
      const entries = mode === "all" ? getTopTwlAllTime(15) : getTopTwlWeekly(15);
      if (!entries.length) return interaction.reply("No TWL points tracked yet.");

      const lines = entries.map(
        (x, i) => `**${i + 1}.** <@${x.uid}> — **${x.count}** TWL point${x.count === 1 ? "" : "s"}`
      );

      const embed = new EmbedBuilder()
        .setTitle(`🏆 TWL ${mode === "all" ? "All-Time" : "Weekly"} Leaderboard`)
        .setDescription(lines.join("\n"))
        .setColor(0xf1c40f)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // /twladmin
    if (cmd === "twladmin") {
      const perms = interaction.memberPermissions;
      const isAllowed =
        perms?.has(PermissionsBitField.Flags.Administrator) ||
        perms?.has(PermissionsBitField.Flags.ManageGuild);

      if (!isAllowed) {
        return interaction.reply({
          content: "❌ You don’t have permission to use this.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const action = (interaction.options.getString("action", true) || "").toLowerCase();
      const targetUser = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount") ?? 1;

      if (action === "resetweekly") {
        twlPointsData.weeklyCounts = {};
        twlPointsData.weeklyMeta.weekKey = currentWeekKey();
        saveTwlPointsData(twlPointsData);
        return interaction.reply({ content: "✅ Reset TWL weekly points.", flags: MessageFlags.Ephemeral });
      }

      if (!targetUser) {
        return interaction.reply({ content: "Pick a user.", flags: MessageFlags.Ephemeral });
      }

      if (action === "add") {
        addTwlPoints(targetUser.id, Math.max(1, amount));
      } else if (action === "take") {
        addTwlPoints(targetUser.id, -Math.max(1, amount));
      } else if (action === "set") {
        const desired = Math.max(0, amount);
        const curr = Number(twlPointsData.totals[targetUser.id]) || 0;
        addTwlPoints(targetUser.id, desired - curr);
      } else {
        return interaction.reply({
          content: "Use action: add | take | set | resetweekly",
          flags: MessageFlags.Ephemeral,
        });
      }

      const total = Number(twlPointsData.totals[targetUser.id]) || 0;
      const weekly = Number(twlPointsData.weeklyCounts[targetUser.id]) || 0;

      return interaction.reply({
        content: `✅ Updated <@${targetUser.id}> — **${total}** total, **${weekly}** this week.`,
        flags: MessageFlags.Ephemeral,
      });
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
        .sort((a, b) => b.prestige - a.prestige || b.level - a.level || b.xp - a.xp)
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

    // /getcode (DM + ephemeral reply)
    if (cmd === "getcode") {
      const code = makeCode();
      pending.set(interaction.user.id, code);
      savePendingCodes();

      try {
        await interaction.user.send(
          `🛎️ **Your check-in code is:** \`${code}\`\n\n` +
            `Set your **Habbo motto** to include that code, then go back to <#${VERIFY_CHANNEL_ID}> and type:\n` +
            `\`/verify habbo:YourHabboNameSe\``
        );

        return interaction.reply({ content: "📩 I’ve DM’d your code!", flags: MessageFlags.Ephemeral });
      } catch {
        return interaction.reply({
          content:
            "❌ I couldn’t DM you. Turn on **Allow direct messages** for this server, then try again.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // /verify
    if (cmd === "verify") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const name = interaction.options.getString("habbo", true).trim();
      const code = pending.get(interaction.user.id);
      if (!code) return interaction.editReply(`Use \`/getcode\` first.`);

      try {
        const motto = await fetchHabboMotto(name);

        const norm = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();
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

        await member.roles.add(verifiedRole).catch(() => {});

        const oldRole =
          interaction.guild.roles.cache.get(UNVERIFIED_ROLE_ID) ||
          interaction.guild.roles.cache.find((r) => r.name === OLD_ROLE_TO_REMOVE);
        if (oldRole) await member.roles.remove(oldRole).catch(() => {});

        await assignPostVerifyRoles(member).catch(() => {});

        if (member.manageable) {
          await member.setNickname(name.slice(0, 32)).catch(() => {});
        }

        pending.delete(interaction.user.id);
        savePendingCodes();

        sendLogEmbed(interaction.guild, verifiedEmbed(interaction.user.id, name));
        return interaction.editReply("✅ Check-in complete. You’re verified!");
      } catch (err) {
        return interaction.editReply(`Verification failed: ${err.message}`);
      }
    }

    // /verifymsg (post + pin verification instructions)
    if (cmd === "verifymsg") {
      const perms = interaction.memberPermissions;
      const isAllowed =
        perms?.has(PermissionsBitField.Flags.Administrator) ||
        perms?.has(PermissionsBitField.Flags.ManageGuild);

      if (!isAllowed) {
        return interaction.reply({
          content: "❌ You don’t have permission to use this.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const ch = interaction.channel;
      if (!ch || !ch.isTextBased()) {
        return interaction.reply({
          content: "❌ Can't post in this channel.",
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🛎️ Hotel Check-in")
        .setColor(0x5865f2)
        .setDescription(
          `1) Run **/getcode** to receive your check-in code in DMs.\n` +
            `2) Set your **Habbo motto** to include that code.\n` +
            `3) Run **/verify habbo:YourHabboNameSe** here to get verified.\n\n` +
            `If your motto just updated, wait **10–30 seconds** and try again.`
        )
        .setTimestamp();

      const msg = await ch.send({ embeds: [embed] }).catch(() => null);
      if (!msg)
        return interaction.reply({
          content: "❌ Failed to post the message.",
          flags: MessageFlags.Ephemeral,
        });

      await msg.pin().catch(() => {});
      return interaction.reply({
        content: "✅ Posted and pinned the verification instructions.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // If a command exists but isn't handled:
    return interaction.reply({
      content: "Command not wired up yet 😬",
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error("interactionCreate error:", err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: "Something went wrong 😬", flags: MessageFlags.Ephemeral })
        .catch(() => {});
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

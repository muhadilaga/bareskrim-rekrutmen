require("dotenv").config();
const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const express = require("express");
const { assignRole, removeRole, checkRole } = require("./services/roleService");
const { getUserGuilds } = require("./services/guildService");

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// Initialize Express for API
const app = express();
app.use(express.json());

// Middleware: Verify API secret
function botToken() {
  return process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || "";
}
function guildId() {
  return process.env.GUILD_ID || process.env.DISCORD_GUILD_ID || "";
}
function apiSecret() {
  return process.env.WEB_API_SECRET || process.env.DISCORD_BOT_SECRET || "";
}
function verifySecret(req, res, next) {
  const secret = req.headers["x-bot-secret"];
  if (!secret || secret !== apiSecret()) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }
  next();
}

// =====================
// API Endpoints
// =====================

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    bot: client.user ? "connected" : "disconnected",
    uptime: process.uptime(),
  });
});

// Assign role to user
app.post("/api/assign-role", verifySecret, async (req, res) => {
  try {
    const { userId, roleName, roleId } = req.body;

    if (!userId || (!roleName && !roleId)) {
      return res.status(400).json({
        ok: false,
        message: "userId and roleName/roleId are required",
      });
    }

    const targetRole = roleId || roleName;
    const result = await assignRole(client, userId, targetRole);

    if (result.ok) {
      res.json({ ok: true, message: `Role "${roleName}" assigned to ${userId}` });
    } else {
      res.status(400).json({ ok: false, message: result.message });
    }
  } catch (error) {
    console.error("Assign role error:", error);
    res.status(500).json({ ok: false, message: "Internal server error" });
  }
});

// Remove role from user
app.post("/api/remove-role", verifySecret, async (req, res) => {
  try {
    const { userId, roleName } = req.body;

    if (!userId || !roleName) {
      return res.status(400).json({
        ok: false,
        message: "userId and roleName are required",
      });
    }

    const result = await removeRole(client, userId, roleName);

    if (result.ok) {
      res.json({ ok: true, message: `Role "${roleName}" removed from ${userId}` });
    } else {
      res.status(400).json({ ok: false, message: result.message });
    }
  } catch (error) {
    console.error("Remove role error:", error);
    res.status(500).json({ ok: false, message: "Internal server error" });
  }
});

// Check user role
app.get("/api/check-role/:userId/:roleName", verifySecret, async (req, res) => {
  try {
    const { userId, roleName } = req.params;
    const result = await checkRole(client, userId, roleName);
    res.json(result);
  } catch (error) {
    console.error("Check role error:", error);
    res.status(500).json({ ok: false, message: "Internal server error" });
  }
});

// List Discord servers shared between bot and user
app.post("/api/guilds", verifySecret, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        ok: false,
        message: "userId is required",
      });
    }

    const result = await getUserGuilds(client, userId);

    if (result.ok) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error("Get user guilds error:", error);
    res.status(500).json({ ok: false, message: "Internal server error" });
  }
});

// =====================
// Discord Bot Events
// =====================

client.once("ready", () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  console.log(`📡 Serving guild: ${client.guilds.cache.map((g) => g.name).join(", ")}`);
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

// =====================
// Start Server
// =====================

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    // Login to Discord
    await client.login(botToken());
    console.log("🔐 Discord bot logged in");

    // Start Express server
    app.listen(PORT, () => {
      console.log(`🌐 API server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start:", error);
    process.exit(1);
  }
}

start();

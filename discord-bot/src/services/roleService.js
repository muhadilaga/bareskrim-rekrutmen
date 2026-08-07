const { GuildMember } = require("discord.js");

/**
 * Find a role by name in the guild
 */
async function findRole(guild, roleName) {
  const roles = await guild.roles.fetch();

  if (/^\d+$/.test(String(roleName).trim())) {
    const byId = roles.get(String(roleName).trim());
    if (byId) return byId;
  }

  const exact = roles.find(
    (role) => role.name.toLowerCase() === roleName.toLowerCase()
  );
  if (exact) return exact;

  const aliases = new Map([
    ["Tahap Akademik", process.env.TAHAP_AKADEMIK_ROLE_ID],
    ["Tahap Interview", process.env.TAHAP_INTERVIEW_ROLE_ID],
  ]);
  const aliasId = aliases.get(roleName)?.trim();
  if (aliasId && roles.get(aliasId)) return roles.get(aliasId);

  return null;
}

/**
 * Find a member by Discord username or ID
 * Supports: user ID, username, display name
 */
async function findMember(guild, identifier) {
  const clean = identifier.trim();

  // 1. Try by numeric ID first
  if (/^\d+$/.test(clean)) {
    try {
      const member = await guild.members.fetch(clean);
      if (member) return member;
    } catch {
      // Not found by ID
    }
  }

  // 2. Fetch all members (cache) and search
  try {
    await guild.members.fetch();
  } catch {
    // Partial fetch is OK
  }

  const lower = clean.toLowerCase();

  // 3. Exact match on username (case-insensitive)
  const exact = guild.members.cache.find(
    (m) => m.user.username.toLowerCase() === lower
  );
  if (exact) return exact;

  // 4. Exact match on display name
  const exactDisplayName = guild.members.cache.find(
    (m) => m.displayName?.toLowerCase() === lower
  );
  if (exactDisplayName) return exactDisplayName;

  // 5. Partial match on username (contains)
  const partial = guild.members.cache.find(
    (m) =>
      m.user.username.toLowerCase().includes(lower) ||
      m.displayName?.toLowerCase().includes(lower)
  );
  return partial || null;
}

/**
 * Assign a role to a user
 */
async function assignRole(client, userId, roleName) {
  try {
    const guildId = process.env.GUILD_ID || process.env.DISCORD_GUILD_ID;
    if (!guildId) {
      return { ok: false, message: "GUILD_ID not configured" };
    }

    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      return { ok: false, message: "Guild not found" };
    }

    // Find the role
    const role = await findRole(guild, roleName);
    if (!role) {
      return { ok: false, message: `Role "${roleName}" not found` };
    }

    // Find the member
    const member = await findMember(guild, userId);
    if (!member) {
      return { ok: false, message: `Member "${userId}" not found` };
    }

    // Check if already has the role
    if (member.roles.cache.has(role.id)) {
      return { ok: true, message: `User already has role "${roleName}"` };
    }

    // Assign the role
    await member.roles.add(role);
    console.log(`✅ Assigned role "${roleName}" to ${member.user.tag}`);

    return { ok: true, message: `Role "${roleName}" assigned to ${member.user.tag}` };
  } catch (error) {
    console.error("assignRole error:", error);
    return { ok: false, message: error.message || "Failed to assign role" };
  }
}

/**
 * Remove a role from a user
 */
async function removeRole(client, userId, roleName) {
  try {
    const guildId = process.env.GUILD_ID || process.env.DISCORD_GUILD_ID;
    if (!guildId) {
      return { ok: false, message: "GUILD_ID not configured" };
    }

    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      return { ok: false, message: "Guild not found" };
    }

    // Find the role
    const role = await findRole(guild, roleName);
    if (!role) {
      return { ok: false, message: `Role "${roleName}" not found` };
    }

    // Find the member
    const member = await findMember(guild, userId);
    if (!member) {
      return { ok: false, message: `Member "${userId}" not found` };
    }

    // Check if has the role
    if (!member.roles.cache.has(role.id)) {
      return { ok: true, message: `User doesn't have role "${roleName}"` };
    }

    // Remove the role
    await member.roles.remove(role);
    console.log(`✅ Removed role "${roleName}" from ${member.user.tag}`);

    return { ok: true, message: `Role "${roleName}" removed from ${member.user.tag}` };
  } catch (error) {
    console.error("removeRole error:", error);
    return { ok: false, message: error.message || "Failed to remove role" };
  }
}

/**
 * Check if a user has a specific role
 */
async function checkRole(client, userId, roleName) {
  try {
    const guildId = process.env.GUILD_ID || process.env.DISCORD_GUILD_ID;
    if (!guildId) {
      return { ok: false, message: "GUILD_ID not configured" };
    }

    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      return { ok: false, message: "Guild not found" };
    }

    // Find the role
    const role = await findRole(guild, roleName);
    if (!role) {
      return { ok: false, message: `Role "${roleName}" not found` };
    }

    // Find the member
    const member = await findMember(guild, userId);
    if (!member) {
      return { ok: false, message: `Member "${userId}" not found` };
    }

    const hasRole = member.roles.cache.has(role.id);
    return { ok: true, hasRole };
  } catch (error) {
    console.error("checkRole error:", error);
    return { ok: false, message: error.message || "Failed to check role" };
  }
}

module.exports = { assignRole, removeRole, checkRole, findMember };

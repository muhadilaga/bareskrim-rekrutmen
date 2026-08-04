const { findMember } = require("./roleService");

/**
 * List the Discord servers (guilds) the bot is in where the
 * given user is also a member.
 *
 * Note: Discord API only allows checking guilds the bot shares
 * with the user, so this returns those shared guilds.
 *
 * @param {import("discord.js").Client} client
 * @param {string} identifier - Discord username, display name, or user ID
 */
async function getUserGuilds(client, identifier) {
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    return { ok: false, message: "GUILD_ID not configured" };
  }

  const primaryGuild = await client.guilds.fetch(guildId);
  if (!primaryGuild) {
    return { ok: false, message: "Guild not found" };
  }

  const member = await findMember(primaryGuild, identifier);
  if (!member) {
    return { ok: false, message: `Member "${identifier}" not found` };
  }

  const userId = member.user.id;
  const guilds = [];

  const allGuilds = await client.guilds.fetch();
  for (const [, guild] of allGuilds) {
    try {
      const g = await guild.members.fetch(userId);
      if (g) {
        guilds.push({
          guildId: guild.id,
          guildName: guild.name,
          memberCount: guild.memberCount ?? null,
          isPrimary: guild.id === guildId,
        });
      }
    } catch {
      // User is not a member of this guild
    }
  }

  return {
    ok: true,
    userId,
    username: member.user.tag,
    guilds,
  };
}

module.exports = { getUserGuilds };

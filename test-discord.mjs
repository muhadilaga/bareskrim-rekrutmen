const TOKEN = "MTUzMjcwOTMxNjUzMDc5ODY4Mg.GjS8-V.75tpwhKzpYXqOU1mMq8x_OxfERO37-gDpWuuNw";
const GUILD_ID = "967325332866744320";
const headers = { Authorization: `Bot ${TOKEN}` };

(async function() {
  console.log("=== Test 1: Bot identity ===");
  try {
    const r1 = await fetch("https://discord.com/api/v10/users/@me", { headers });
    console.log("Status:", r1.status);
    const d1 = await r1.json();
    console.log("Bot:", JSON.stringify(d1, null, 2));
  } catch(e) { console.error("Test1 error:", e.message); }

  console.log("\n=== Test 2: Guild info ===");
  try {
    const r2 = await fetch("https://discord.com/api/v10/guilds/" + GUILD_ID + "?with_counts=true", { headers });
    console.log("Status:", r2.status);
    const d2 = await r2.json();
    console.log("Guild:", JSON.stringify(d2, null, 2));
  } catch(e) { console.error("Test2 error:", e.message); }

  console.log("\n=== Test 3: Member search ===");
  try {
    const r3 = await fetch("https://discord.com/api/v10/guilds/" + GUILD_ID + "/members/search?query=fordiber&limit=5", { headers });
    console.log("Status:", r3.status);
    const d3 = await r3.json();
    console.log("Members:", JSON.stringify(d3, null, 2));
  } catch(e) { console.error("Test3 error:", e.message); }
})();

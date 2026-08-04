const http = require('https');

const TOKEN = "MTUzMjcwOTMxNjUzMDc5ODY4Mg.GjS8-V.75tpwhKzpYXqOU1mMq8x_OxfERO37-gDpWuuNw";
const GUILD_ID = "967325332866744320";

function discordGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'discord.com',
      path: '/api/v10' + path,
      method: 'GET',
      headers: {
        'Authorization': 'Bot ' + TOKEN,
        'Content-Type': 'application/json'
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (e) => reject(e));
    req.end();
  });
}

async function main() {
  console.log("Test 1: Bot identity");
  try {
    const r1 = await discordGet('/users/@me');
    console.log("Status:", r1.status);
    console.log("Body:", r1.body);
  } catch(e) { console.error("Error:", e.message); }

  console.log("\nTest 2: Guild info");
  try {
    const r2 = await discordGet('/guilds/' + GUILD_ID);
    console.log("Status:", r2.status);
    console.log("Body:", r2.body);
  } catch(e) { console.error("Error:", e.message); }
}

main();

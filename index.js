import "dotenv/config";
import { Client, Collection, GatewayIntentBits, Events, REST, Routes } from "discord.js";
import * as autosetupCommand from "./commands/autosetup.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();
client.commands.set(autosetupCommand.data.name, autosetupCommand);

// Daftarin/update slash command di sini juga (bukan cuma di deploy-commands.js),
// soalnya beberapa host (misal Pterodactyl) jalanin "node index.js" langsung
// dan gak pernah lewat "npm run deploy". Aman dipanggil tiap start.
async function registerCommands() {
  const commands = [autosetupCommand.data.toJSON()];
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);

  const route = process.env.GUILD_ID
    ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
    : Routes.applicationCommands(process.env.CLIENT_ID);

  try {
    await rest.put(route, { body: commands });
    console.log(
      process.env.GUILD_ID
        ? `Command /autosetup terdaftar di guild ${process.env.GUILD_ID}.`
        : "Command /autosetup terdaftar global (bisa delay sampai ~1 jam nyebar)."
    );
  } catch (err) {
    console.error("Gagal register command:", err);
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`Bot online sebagai ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    const payload = { content: "Ada error pas eksekusi command ini.", embeds: [], components: [] };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply({ ...payload, ephemeral: true }).catch(() => {});
    }
  }
});

await registerCommands();
client.login(process.env.DISCORD_TOKEN);

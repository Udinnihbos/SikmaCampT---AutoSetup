import "dotenv/config";
import { Client, Collection, GatewayIntentBits, Events } from "discord.js";
import * as autosetupCommand from "./commands/autosetup.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();
client.commands.set(autosetupCommand.data.name, autosetupCommand);

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

client.login(process.env.DISCORD_TOKEN);

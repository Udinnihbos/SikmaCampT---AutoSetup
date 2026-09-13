import "dotenv/config";
import { REST, Routes } from "discord.js";
import * as autosetupCommand from "./commands/autosetup.js";

const commands = [autosetupCommand.data.toJSON()];

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

try {
  const route = process.env.GUILD_ID
    ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
    : Routes.applicationCommands(process.env.CLIENT_ID);

  console.log(
    process.env.GUILD_ID
      ? `Registering command ke guild ${process.env.GUILD_ID} (instant)...`
      : "Registering command global (bisa delay sampai ~1 jam nyebar)..."
  );

  await rest.put(route, { body: commands });
  console.log("Sukses register command /autosetup.");
} catch (err) {
  console.error("Gagal register command:", err);
}

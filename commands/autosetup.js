import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";
import { fetchConfigByToken } from "../lib/api.js";
import { wipeChannels, buildGuild } from "../lib/executor.js";

export const data = new SlashCommandBuilder()
  .setName("autosetup")
  .setDescription("Bangun struktur server (role/category/channel) dari blueprint AI pakai token")
  .addStringOption((opt) =>
    opt.setName("token").setDescription("Token dari website autosetup").setRequired(true)
  )
  .addBooleanOption((opt) =>
    opt
      .setName("wipe")
      .setDescription("Hapus semua channel yang ada sebelum bikin yang baru (DESTRUKTIF)")
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const token = interaction.options.getString("token", true).trim();
  const wipe = interaction.options.getBoolean("wipe") ?? false;

  const me = interaction.guild.members.me;
  if (
    !me.permissions.has(PermissionFlagsBits.ManageChannels) ||
    !me.permissions.has(PermissionFlagsBits.ManageRoles)
  ) {
    return interaction.editReply(
      "Bot butuh permission **Manage Channels** dan **Manage Roles** di server ini dulu sebelum bisa jalanin autosetup."
    );
  }

  let config;
  try {
    config = await fetchConfigByToken(token);
  } catch (err) {
    return interaction.editReply(`Gagal ambil blueprint: ${err.message}`);
  }

  const roleCount = config.roles?.length || 0;
  const categoryCount = config.categories?.length || 0;
  const channelCount = (config.categories || []).reduce(
    (sum, c) => sum + (c.channels?.length || 0),
    0
  );

  const embed = new EmbedBuilder()
    .setTitle("Konfirmasi Autosetup")
    .setColor(wipe ? 0xe0653f : 0x6fd3f5)
    .setDescription(
      `Bakal dibuat: **${roleCount}** role, **${categoryCount}** category, **${channelCount}** channel.` +
        (wipe
          ? "\n\n⚠️ **wipe:true** — semua channel yang ada sekarang bakal **dihapus dulu** sebelum bikin yang baru. Ini gak bisa dibatalin."
          : "")
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("autosetup_confirm").setLabel("Konfirmasi").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("autosetup_cancel").setLabel("Batal").setStyle(ButtonStyle.Secondary)
  );

  const message = await interaction.editReply({ embeds: [embed], components: [row] });

  let confirmation;
  try {
    confirmation = await message.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id,
      time: 30_000,
    });
  } catch {
    return interaction.editReply({ content: "Waktu konfirmasi habis, dibatalin.", embeds: [], components: [] });
  }

  if (confirmation.customId === "autosetup_cancel") {
    return confirmation.update({ content: "Dibatalin.", embeds: [], components: [] });
  }

  await confirmation.update({
    content: "Lagi ngebangun server... jangan tutup dulu, ini bisa makan waktu tergantung jumlah channel.",
    embeds: [],
    components: [],
  });

  let wipedCount = 0;
  if (wipe) {
    wipedCount = await wipeChannels(interaction.guild);
  }

  const summary = await buildGuild(interaction.guild, config);

  const resultLines = [
    wipe ? `Channel lama dihapus: **${wipedCount}**` : null,
    `Role dibuat: **${summary.roles}**`,
    `Category dibuat: **${summary.categories}**`,
    `Channel dibuat: **${summary.channels}**`,
  ].filter(Boolean);

  if (summary.notes?.length) {
    resultLines.push("", `ℹ️ ${summary.notes.length} catatan:`, ...summary.notes.slice(0, 10).map((n) => `- ${n}`));
  }

  if (summary.errors.length) {
    resultLines.push(
      "",
      `⚠️ ${summary.errors.length} error:`,
      ...summary.errors.slice(0, 10).map((e) => `- ${e}`)
    );
  }

  // PENTING: pakai `confirmation`, bukan `interaction`, buat edit hasil akhir.
  // Setelah confirmation.update() dipanggil, itu yang jadi pemilik pesan ini -
  // pakai interaction.editReply() lagi di sini bakal kena error "Unknown Message".
  await confirmation.editReply({ content: resultLines.join("\n"), embeds: [], components: [] });
}

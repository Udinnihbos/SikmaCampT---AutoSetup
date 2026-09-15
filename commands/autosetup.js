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
  );

export async function execute(interaction) {
  const ownerIds = (process.env.OWNER_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);
  if (!ownerIds.includes(interaction.user.id)) {
    return interaction.reply({
      content: "Command ini cuma bisa dipakai sama owner bot.",
      ephemeral: true,
    });
  }

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

  // Update progress ke pesan ephemeral yang sama, tapi di-throttle biar gak spam Discord API
  // sendiri (min jeda 4 detik antar update, dan sekalian jaga-jaga token udah expired).
  let lastProgressUpdate = 0;
  function throttledProgress(text) {
    const now = Date.now();
    if (now - lastProgressUpdate < 4000) return;
    lastProgressUpdate = now;
    confirmation.editReply({ content: text, embeds: [], components: [] }).catch(() => {});
  }

  let wipedCount = 0;
  if (wipe) {
    wipedCount = await wipeChannels(interaction.guild, (done, total) => {
      throttledProgress(`🗑️ Menghapus channel lama... ${done}/${total}`);
    });
  }

  const summary = await buildGuild(interaction.guild, config, (done, total, label) => {
    throttledProgress(`⚙️ Membangun server... ${done}/${total} (${label})`);
  });

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
  // Kalau prosesnya lama (banyak channel/role) dan token interaksi (hidup 15 menit)
  // keburu expired, fallback kirim hasil sebagai pesan biasa di channel biar gak hilang.
  const resultContent = resultLines.join("\n");
  try {
    await confirmation.editReply({ content: resultContent, embeds: [], components: [] });
  } catch (err) {
    console.error("Gagal edit reply (kemungkinan token expired), fallback ke channel message:", err.message);
    await interaction.channel
      ?.send({ content: `${interaction.user}, hasil autosetup:\n${resultContent}` })
      .catch(() => {});
  }
}

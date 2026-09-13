import { ChannelType, PermissionFlagsBits } from "discord.js";

const CHANNEL_TYPE_MAP = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  announcement: ChannelType.GuildAnnouncement,
  forum: ChannelType.GuildForum,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function permissionsFromNames(names) {
  if (!Array.isArray(names)) return [];
  return names.map((n) => PermissionFlagsBits[n]).filter((v) => typeof v === "bigint");
}

// Hapus semua channel yang ada di server. Dipanggil cuma kalau user pilih wipe:true.
// Sengaja TIDAK menghapus role - itu lebih beresiko (bisa kena role bot sendiri / @everyone).
export async function wipeChannels(guild) {
  let deleted = 0;
  const channels = [...guild.channels.cache.values()];

  for (const channel of channels) {
    try {
      await channel.delete("Wipe sebelum /autosetup");
      deleted++;
      await sleep(350);
    } catch {
      // Channel anak dari category yang udah kehapus duluan biasanya udah ikut hilang, aman diskip
    }
  }

  return deleted;
}

// Bangun roles dulu, baru categories + channels di dalamnya.
export async function buildGuild(guild, config) {
  const summary = { roles: 0, categories: 0, channels: 0, errors: [], notes: [] };

  for (const roleDef of config.roles || []) {
    try {
      await guild.roles.create({
        name: roleDef.name,
        color: roleDef.color || undefined,
        hoist: !!roleDef.hoist,
        mentionable: !!roleDef.mentionable,
        permissions: permissionsFromNames(roleDef.permissions),
        reason: "Dibuat oleh /autosetup",
      });
      summary.roles++;
      await sleep(350);
    } catch (err) {
      summary.errors.push(`Role "${roleDef.name}": ${err.message}`);
    }
  }

  for (const catDef of config.categories || []) {
    let category;
    try {
      category = await guild.channels.create({
        name: catDef.name,
        type: ChannelType.GuildCategory,
        reason: "Dibuat oleh /autosetup",
      });
      summary.categories++;
      await sleep(350);
    } catch (err) {
      summary.errors.push(`Category "${catDef.name}": ${err.message}`);
      continue;
    }

    for (const chDef of catDef.channels || []) {
      const type = CHANNEL_TYPE_MAP[chDef.type] ?? ChannelType.GuildText;
      const payload = {
        name: chDef.name,
        type,
        parent: category.id,
        reason: "Dibuat oleh /autosetup",
      };
      if (type !== ChannelType.GuildVoice && chDef.topic) {
        payload.topic = String(chDef.topic).slice(0, 1024);
      }

      try {
        await guild.channels.create(payload);
        summary.channels++;
        await sleep(350);
      } catch (err) {
        // Tipe announcement/forum butuh server di-set jadi "Community" di Discord.
        // Kalau gagal gara-gara itu dan tipenya bukan text, fallback bikin sebagai text biasa.
        const looksLikeUnsupportedType =
          type !== ChannelType.GuildText && /BASE_TYPE_CHOICES|Invalid Form Body/i.test(err.message);

        if (looksLikeUnsupportedType) {
          try {
            await guild.channels.create({ ...payload, type: ChannelType.GuildText });
            summary.channels++;
            summary.notes.push(
              `Channel "${chDef.name}" dibuat sebagai text biasa (tipe aslinya butuh Community Server aktif)`
            );
            await sleep(350);
            continue;
          } catch (fallbackErr) {
            summary.errors.push(`Channel "${chDef.name}": ${fallbackErr.message}`);
            continue;
          }
        }

        summary.errors.push(`Channel "${chDef.name}": ${err.message}`);
      }
    }
  }

  return summary;
}

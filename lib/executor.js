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

// Delay lebih panjang buat batch gede - channel create/delete termasuk endpoint
// yang paling ketat rate limit-nya di Discord, jadi makin banyak item makin butuh jaga jarak.
function delayFor(totalItems) {
  if (totalItems > 40) return 600;
  if (totalItems > 15) return 450;
  return 350;
}

function permissionsFromNames(names) {
  if (!Array.isArray(names)) return [];
  return names.map((n) => PermissionFlagsBits[n]).filter((v) => typeof v === "bigint");
}

function countTotalActions(config) {
  const roles = config.roles?.length || 0;
  const categories = config.categories?.length || 0;
  const channels = (config.categories || []).reduce((sum, c) => sum + (c.channels?.length || 0), 0);
  return roles + categories + channels;
}

// Hapus semua channel yang ada di server. Dipanggil cuma kalau user pilih wipe:true.
// Sengaja TIDAK menghapus role - itu lebih beresiko (bisa kena role bot sendiri / @everyone).
export async function wipeChannels(guild, onProgress) {
  let deleted = 0;
  const channels = [...guild.channels.cache.values()];
  const delay = delayFor(channels.length);

  for (const channel of channels) {
    try {
      await channel.delete("Wipe sebelum /autosetup");
      deleted++;
      onProgress?.(deleted, channels.length, "wipe");
      await sleep(delay);
    } catch {
      // Channel anak dari category yang udah kehapus duluan biasanya udah ikut hilang, aman diskip
    }
  }

  return deleted;
}

// Bangun roles dulu, baru categories + channels di dalamnya.
// onProgress(doneCount, totalCount, label) dipanggil tiap 1 item berhasil dibuat.
function resolveOverwrites(guild, roleMap, overwrites) {
  if (!Array.isArray(overwrites)) return undefined;
  const resolved = [];
  for (const ow of overwrites) {
    const id = ow.role === "@everyone" ? guild.roles.everyone.id : roleMap.get(ow.role)?.id;
    if (!id) continue; // role gak ketemu (mungkin AI salah nyebut nama), skip aja daripada error
    resolved.push({
      id,
      allow: permissionsFromNames(ow.allow),
      deny: permissionsFromNames(ow.deny),
    });
  }
  return resolved.length ? resolved : undefined;
}

export async function buildGuild(guild, config, onProgress) {
  const summary = { roles: 0, categories: 0, channels: 0, errors: [], notes: [] };
  const total = countTotalActions(config);
  const delay = delayFor(total);
  let done = 0;
  const roleMap = new Map(); // nama role -> objek Role, dipakai buat resolve permissionOverwrites

  for (const roleDef of config.roles || []) {
    try {
      const role = await guild.roles.create({
        name: roleDef.name,
        color: roleDef.color || undefined,
        hoist: !!roleDef.hoist,
        mentionable: !!roleDef.mentionable,
        permissions: permissionsFromNames(roleDef.permissions),
        reason: "Dibuat oleh /autosetup",
      });
      roleMap.set(roleDef.name, role);
      summary.roles++;
      done++;
      onProgress?.(done, total, "role");
      await sleep(delay);
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
      done++;
      onProgress?.(done, total, "category");
      await sleep(delay);
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
      if (type !== ChannelType.GuildVoice && chDef.nsfw) {
        payload.nsfw = true;
      }
      if (type === ChannelType.GuildText && Number(chDef.slowmode) > 0) {
        payload.rateLimitPerUser = Math.min(Number(chDef.slowmode), 21600);
      }
      const overwrites = resolveOverwrites(guild, roleMap, chDef.permissionOverwrites);
      if (overwrites) {
        payload.permissionOverwrites = overwrites;
      }

      try {
        await guild.channels.create(payload);
        summary.channels++;
        done++;
        onProgress?.(done, total, "channel");
        await sleep(delay);
      } catch (err) {
        // Tipe announcement/forum butuh server di-set jadi "Community" di Discord.
        // Kalau gagal gara-gara itu dan tipenya bukan text, fallback bikin sebagai text biasa.
        const looksLikeUnsupportedType =
          type !== ChannelType.GuildText && /BASE_TYPE_CHOICES|Invalid Form Body/i.test(err.message);

        if (looksLikeUnsupportedType) {
          try {
            await guild.channels.create({ ...payload, type: ChannelType.GuildText });
            summary.channels++;
            done++;
            summary.notes.push(
              `Channel "${chDef.name}" dibuat sebagai text biasa (tipe aslinya butuh Community Server aktif)`
            );
            onProgress?.(done, total, "channel");
            await sleep(delay);
            continue;
          } catch (fallbackErr) {
            done++;
            summary.errors.push(`Channel "${chDef.name}": ${fallbackErr.message}`);
            onProgress?.(done, total, "channel");
            continue;
          }
        }

        done++;
        summary.errors.push(`Channel "${chDef.name}": ${err.message}`);
        onProgress?.(done, total, "channel");
      }
    }
  }

  return summary;
}

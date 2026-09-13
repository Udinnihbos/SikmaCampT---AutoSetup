export async function fetchConfigByToken(token) {
  const base = process.env.AUTOSETUP_WEB_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("AUTOSETUP_WEB_URL belum diset di .env");
  }

  const res = await fetch(`${base}/api/setup/${encodeURIComponent(token)}`, {
    headers: {
      "x-bot-secret": process.env.AUTOSETUP_BOT_SECRET || "",
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Gagal ambil config (status ${res.status})`);
  }

  return data.config;
}

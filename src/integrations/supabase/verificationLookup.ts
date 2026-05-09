const MODERATOR_EMAIL = 'admin.helpinghands.20260313210846@example.com';
const MODERATOR_PASSWORD = 'Admin!2026!Help';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let cachedAccessToken: string | null = null;
let cachedTokenExpiresAt = 0;

const getModeratorAccessToken = async () => {
  const now = Date.now();
  if (cachedAccessToken && cachedTokenExpiresAt > now + 30_000) {
    return cachedAccessToken;
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: MODERATOR_EMAIL,
      password: MODERATOR_PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error('Не удалось получить доступ к данным верификации');
  }

  const payload = await response.json();
  cachedAccessToken = payload.access_token;
  cachedTokenExpiresAt = now + Number(payload.expires_in ?? 3600) * 1000;
  return cachedAccessToken;
};

export const fetchApprovedVerificationUserIds = async (userIds: string[]) => {
  const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
  if (!uniqueUserIds.length) return new Set<string>();

  const accessToken = await getModeratorAccessToken();
  const inFilter = uniqueUserIds.map((id) => `"${id}"`).join(',');
  const url = `${SUPABASE_URL}/rest/v1/verifications?select=user_id&status=eq.approved&user_id=in.(${encodeURIComponent(inFilter)})`;

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Не удалось загрузить список подтвержденных профилей');
  }

  const rows: Array<{ user_id: string }> = await response.json();
  return new Set(rows.map((row) => row.user_id));
};

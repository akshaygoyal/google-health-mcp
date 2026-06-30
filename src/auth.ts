/**
 * Google OAuth token management.
 *
 * Design: we never do an interactive OAuth flow inside the Worker.
 * Instead, a one-time local script (scripts/get-refresh-token.ts) gets a
 * refresh token on your machine, and you store it in KV once via
 * `wrangler kv key put`. From then on, this module exchanges that refresh
 * token for short-lived access tokens on every request, caching the
 * access token in KV until it's close to expiry.
 *
 * Multi-user: each user's tokens are namespaced by their userId so multiple
 * users can share a single Worker + KV namespace.
 */

export interface Env {
  HEALTH_TOKENS: KVNamespace;
  MCP_SHARED_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

const refreshTokenKey = (userId: string) => `user:${userId}:refresh_token`;
const accessTokenCacheKey = (userId: string) => `user:${userId}:access_token_cache`;

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

interface CachedAccessToken {
  accessToken: string;
  expiresAtMs: number;
}

export class TokenError extends Error {}

/**
 * Returns a valid (non-expired) Google access token, refreshing it if needed.
 * Throws TokenError if no refresh token has been set up yet, or if Google
 * rejects the refresh (e.g. token was revoked).
 */
export async function getAccessToken(env: Env, userId: string): Promise<string> {
  const cachedRaw = await env.HEALTH_TOKENS.get(accessTokenCacheKey(userId));
  if (cachedRaw) {
    const cached = JSON.parse(cachedRaw) as CachedAccessToken;
    // Refresh a bit early (60s buffer) to avoid edge-of-expiry failures.
    if (cached.expiresAtMs - 60_000 > Date.now()) {
      return cached.accessToken;
    }
  }

  const refreshToken = await env.HEALTH_TOKENS.get(refreshTokenKey(userId));
  if (!refreshToken) {
    throw new TokenError(
      `No Google refresh token found in KV for user "${userId}". ` +
        `Run \`npm run token:setup -- --user=${userId}\` locally ` +
        `and store the result with \`wrangler kv key put\` before using this server.`
    );
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new TokenError(
      `Google token refresh failed (${res.status}): ${body}. ` +
        `If this says "invalid_grant", the refresh token was likely revoked — ` +
        `re-run the local setup script to get a new one.`
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  const cacheEntry: CachedAccessToken = {
    accessToken: data.access_token,
    expiresAtMs: Date.now() + data.expires_in * 1000,
  };
  await env.HEALTH_TOKENS.put(accessTokenCacheKey(userId), JSON.stringify(cacheEntry), {
    expirationTtl: data.expires_in, // KV auto-expires the cache entry too
  });

  return data.access_token;
}

/** Used by the connection-status tool to report token health without throwing. */
export async function getTokenStatus(env: Env, userId: string): Promise<{
  hasRefreshToken: boolean;
  accessTokenCached: boolean;
  accessTokenExpiresAtMs: number | null;
}> {
  const refreshToken = await env.HEALTH_TOKENS.get(refreshTokenKey(userId));
  const cachedRaw = await env.HEALTH_TOKENS.get(accessTokenCacheKey(userId));
  const cached = cachedRaw ? (JSON.parse(cachedRaw) as CachedAccessToken) : null;
  return {
    hasRefreshToken: Boolean(refreshToken),
    accessTokenCached: Boolean(cached),
    accessTokenExpiresAtMs: cached?.expiresAtMs ?? null,
  };
}

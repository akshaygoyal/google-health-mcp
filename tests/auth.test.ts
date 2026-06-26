import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getAccessToken, getTokenStatus, TokenError } from "../src/auth.js";
import { makeKv, makeEnv, mockFetchOk, mockFetchError } from "./helpers.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("getAccessToken", () => {
  it("returns cached access token when not expired", async () => {
    const expiresAtMs = Date.now() + 3600_000;
    const kv = makeKv({
      google_access_token_cache: JSON.stringify({ accessToken: "cached-token", expiresAtMs }),
    });
    const env = makeEnv({ HEALTH_TOKENS: kv });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const token = await getAccessToken(env);

    expect(token).toBe("cached-token");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refreshes token when cache is expired", async () => {
    const expiresAtMs = Date.now() - 1000; // already expired
    const kv = makeKv({
      google_access_token_cache: JSON.stringify({ accessToken: "old-token", expiresAtMs }),
      google_refresh_token: "my-refresh-token",
    });
    const env = makeEnv({ HEALTH_TOKENS: kv });
    mockFetchOk({ access_token: "new-token", expires_in: 3600 });

    const token = await getAccessToken(env);

    expect(token).toBe("new-token");
  });

  it("refreshes token when cache is within the 60s buffer", async () => {
    const expiresAtMs = Date.now() + 30_000; // expires in 30s — within 60s buffer
    const kv = makeKv({
      google_access_token_cache: JSON.stringify({ accessToken: "expiring-token", expiresAtMs }),
      google_refresh_token: "my-refresh-token",
    });
    const env = makeEnv({ HEALTH_TOKENS: kv });
    mockFetchOk({ access_token: "fresh-token", expires_in: 3600 });

    const token = await getAccessToken(env);

    expect(token).toBe("fresh-token");
  });

  it("throws TokenError when no refresh token is stored", async () => {
    const env = makeEnv({ HEALTH_TOKENS: makeKv() });

    await expect(getAccessToken(env)).rejects.toThrow(TokenError);
  });

  it("throws TokenError when Google rejects the refresh", async () => {
    const kv = makeKv({ google_refresh_token: "revoked-token" });
    const env = makeEnv({ HEALTH_TOKENS: kv });
    mockFetchError(400, '{"error":"invalid_grant"}');

    await expect(getAccessToken(env)).rejects.toThrow(TokenError);
  });

  it("caches the new access token after a successful refresh", async () => {
    const kv = makeKv({ google_refresh_token: "my-refresh-token" });
    const env = makeEnv({ HEALTH_TOKENS: kv });
    mockFetchOk({ access_token: "new-token", expires_in: 3600 });

    await getAccessToken(env);

    expect(kv.put).toHaveBeenCalledWith(
      "google_access_token_cache",
      expect.stringContaining("new-token"),
      expect.objectContaining({ expirationTtl: 3600 })
    );
  });

  it("sends correct params to Google token endpoint", async () => {
    const kv = makeKv({ google_refresh_token: "my-refresh-token" });
    const env = makeEnv({ HEALTH_TOKENS: kv });
    mockFetchOk({ access_token: "token", expires_in: 3600 });

    await getAccessToken(env);

    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(options.body);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("my-refresh-token");
    expect(body.get("client_id")).toBe("test-client-id");
    expect(body.get("client_secret")).toBe("test-client-secret");
  });
});

describe("getTokenStatus", () => {
  it("reports missing refresh token and no cache", async () => {
    const env = makeEnv({ HEALTH_TOKENS: makeKv() });

    const status = await getTokenStatus(env);

    expect(status.hasRefreshToken).toBe(false);
    expect(status.accessTokenCached).toBe(false);
    expect(status.accessTokenExpiresAtMs).toBeNull();
  });

  it("reports token present when refresh token exists", async () => {
    const kv = makeKv({ google_refresh_token: "token" });
    const env = makeEnv({ HEALTH_TOKENS: kv });

    const status = await getTokenStatus(env);

    expect(status.hasRefreshToken).toBe(true);
  });

  it("reports cached access token expiry when cache exists", async () => {
    const expiresAtMs = Date.now() + 3600_000;
    const kv = makeKv({
      google_refresh_token: "token",
      google_access_token_cache: JSON.stringify({ accessToken: "at", expiresAtMs }),
    });
    const env = makeEnv({ HEALTH_TOKENS: kv });

    const status = await getTokenStatus(env);

    expect(status.accessTokenCached).toBe(true);
    expect(status.accessTokenExpiresAtMs).toBe(expiresAtMs);
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getDailyRollUp,
  listDataPoints,
  listDataPointsUnfiltered,
  listAllDataPointsUnfiltered,
  reconcileDataPoints,
  GoogleHealthApiError,
} from "../src/google-health-client.js";
import { makeEnv, mockFetchOk, mockFetchError } from "./helpers.js";

afterEach(() => vi.restoreAllMocks());

const USER_ID = "test-user";

// Seed the KV with an access token so auth doesn't block these tests.
function envWithToken() {
  const kv: Record<string, string> = {
    [`user:${USER_ID}:access_token_cache`]: JSON.stringify({
      accessToken: "test-access-token",
      expiresAtMs: Date.now() + 3_600_000,
    }),
  };
  return makeEnv({ HEALTH_TOKENS: { get: async (k: string) => kv[k] ?? null } as KVNamespace });
}

describe("GoogleHealthApiError", () => {
  it("includes status and body in the message", () => {
    const err = new GoogleHealthApiError(403, "forbidden");
    expect(err.status).toBe(403);
    expect(err.body).toBe("forbidden");
    expect(err.message).toContain("403");
    expect(err.message).toContain("forbidden");
  });
});

describe("listDataPoints", () => {
  it("sends a GET request with a civil time filter", async () => {
    mockFetchOk({ dataPoints: [] });
    const env = envWithToken();

    await listDataPoints(env, USER_ID, "steps", "2026-05-01", "2026-05-31");

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/dataTypes/steps/dataPoints");
    expect(url).toContain("filter=");
    expect(url).toContain("2026-05-01");
    expect(url).toContain("2026-05-31");
  });

  it("throws GoogleHealthApiError on non-ok response", async () => {
    mockFetchError(400, "bad request");
    const env = envWithToken();

    await expect(listDataPoints(env, USER_ID, "steps", "2026-05-01", "2026-05-31"))
      .rejects.toThrow(GoogleHealthApiError);
  });
});

describe("listDataPointsUnfiltered", () => {
  it("sends a GET request without a filter param", async () => {
    mockFetchOk({ dataPoints: [] });
    const env = envWithToken();

    await listDataPointsUnfiltered(env, USER_ID, "exercise");

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/dataTypes/exercise/dataPoints");
    expect(url).not.toContain("filter=");
  });
});

describe("listAllDataPointsUnfiltered", () => {
  it("returns all data points from a single page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ dataPoints: [{ id: "1" }, { id: "2" }] }),
    })));
    const env = envWithToken();

    const result = await listAllDataPointsUnfiltered(env, USER_ID, "exercise");

    expect(result.dataPoints).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("paginates through multiple pages and collects all data points", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ dataPoints: [{ id: "1" }], nextPageToken: "page2" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ dataPoints: [{ id: "2" }], nextPageToken: "page3" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ dataPoints: [{ id: "3" }] }), // no nextPageToken = last page
      });
    vi.stubGlobal("fetch", fetchMock);
    const env = envWithToken();

    const result = await listAllDataPointsUnfiltered(env, USER_ID, "exercise");

    expect(result.dataPoints).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(3);
    // Second call should include pageToken
    const [secondUrl] = fetchMock.mock.calls[1];
    expect(secondUrl).toContain("pageToken=page2");
  });

  it("handles an empty first page gracefully", async () => {
    mockFetchOk({ dataPoints: [] });
    const env = envWithToken();

    const result = await listAllDataPointsUnfiltered(env, USER_ID, "exercise");

    expect(result.dataPoints).toHaveLength(0);
  });

  it("handles a page with no dataPoints key", async () => {
    mockFetchOk({});
    const env = envWithToken();

    const result = await listAllDataPointsUnfiltered(env, USER_ID, "exercise");

    expect(result.dataPoints).toHaveLength(0);
  });
});

describe("getDailyRollUp", () => {
  it("sends a POST request with the correct date range body", async () => {
    mockFetchOk({ dataPoints: [] });
    const env = envWithToken();

    await getDailyRollUp(env, USER_ID, "steps", "2026-05-01", "2026-05-31");

    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/dataTypes/steps/dataPoints:dailyRollUp");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.range.start.date).toEqual({ year: 2026, month: 5, day: 1 });
    expect(body.range.end.date).toEqual({ year: 2026, month: 5, day: 31 });
  });
});

describe("reconcileDataPoints", () => {
  it("sends a GET request to the reconcile endpoint with a filter", async () => {
    mockFetchOk({ dataPoints: [] });
    const env = envWithToken();

    await reconcileDataPoints(env, USER_ID, "heart-rate", "2026-05-01", "2026-05-31");

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/dataTypes/heart-rate/dataPoints:reconcile");
    expect(url).toContain("filter=");
  });
});

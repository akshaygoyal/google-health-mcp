import { describe, it, expect, vi, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "../src/tools.js";
import { makeEnv } from "./helpers.js";
import type { Env } from "../src/auth.js";

afterEach(() => vi.restoreAllMocks());

// Capture registered tool handlers from registerTools without a real McpServer.
function captureTools(env: Env): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  const tools: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
  const mockServer = {
    tool: (_name: string, _desc: string, _schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
      tools[_name] = handler;
    },
  };
  registerTools(mockServer as unknown as McpServer, env);
  return tools;
}

// Seed env with a valid cached access token so auth passes in tool tests.
function envWithToken(kvExtra: Record<string, string> = {}): Env {
  const store: Record<string, string> = {
    google_access_token_cache: JSON.stringify({
      accessToken: "test-token",
      expiresAtMs: Date.now() + 3_600_000,
    }),
    ...kvExtra,
  };
  return makeEnv({
    HEALTH_TOKENS: {
      get: async (k: string) => store[k] ?? null,
      put: vi.fn(),
    } as unknown as KVNamespace,
  });
}

function stubFetch(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })));
}

function stubFetchError(status: number, message: string) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: false,
    status,
    text: async () => message,
  })));
}

// ─── health_connection_status ────────────────────────────────────────────────

describe("health_connection_status", () => {
  it("returns token status", async () => {
    const env = envWithToken({ google_refresh_token: "tok" });
    const tools = captureTools(env);
    const result = await tools["health_connection_status"]({}) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data.hasRefreshToken).toBe(true);
  });
});

// ─── get_daily_summary ───────────────────────────────────────────────────────

describe("get_daily_summary", () => {
  it("returns steps, calories and distance combined", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_daily_summary"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("steps");
    expect(data).toHaveProperty("calories");
    expect(data).toHaveProperty("distance");
  });

  it("returns an error result when the API fails", async () => {
    stubFetchError(500, "server error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_daily_summary"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── get_steps_history ───────────────────────────────────────────────────────

describe("get_steps_history", () => {
  it("returns step data for the date range", async () => {
    stubFetch({ dataPoints: [{ value: 8000 }] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_steps_history"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data.dataPoints).toHaveLength(1);
  });
});

// ─── get_heart_rate ──────────────────────────────────────────────────────────

describe("get_heart_rate", () => {
  it("returns samples and resting heart rate", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_heart_rate"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("samples");
    expect(data).toHaveProperty("restingHeartRate");
  });
});

// ─── get_exercise_sessions ───────────────────────────────────────────────────

describe("get_exercise_sessions", () => {
  function makeSession(startTime: string) {
    return {
      exercise: {
        interval: { startTime },
        exerciseType: "WALKING",
        activeDuration: "600s",
      },
    };
  }

  it("returns only sessions within the date range", async () => {
    const allSessions = [
      makeSession("2026-04-30T10:00:00Z"), // before — excluded
      makeSession("2026-05-15T10:00:00Z"), // in range — included
      makeSession("2026-05-31T23:00:00Z"), // in range — included
      makeSession("2026-06-01T00:00:00Z"), // after — excluded
    ];
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ dataPoints: allSessions }),
    })));

    const tools = captureTools(envWithToken());
    const result = await tools["get_exercise_sessions"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data.dataPoints).toHaveLength(2);
    expect(data.dataPoints[0].exercise.interval.startTime).toBe("2026-05-15T10:00:00Z");
    expect(data.dataPoints[1].exercise.interval.startTime).toBe("2026-05-31T23:00:00Z");
  });

  it("paginates through all pages before filtering", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ dataPoints: [makeSession("2026-06-01T10:00:00Z")], nextPageToken: "p2" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ dataPoints: [makeSession("2026-05-15T10:00:00Z")] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const tools = captureTools(envWithToken());
    const result = await tools["get_exercise_sessions"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(data.dataPoints).toHaveLength(1);
    expect(data.dataPoints[0].exercise.interval.startTime).toBe("2026-05-15T10:00:00Z");
  });

  it("returns empty array when no sessions match the date range", async () => {
    stubFetch({ dataPoints: [makeSession("2026-04-01T10:00:00Z")] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_exercise_sessions"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data.dataPoints).toHaveLength(0);
  });

  it("excludes sessions missing an interval startTime", async () => {
    stubFetch({ dataPoints: [{ exercise: {} }] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_exercise_sessions"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data.dataPoints).toHaveLength(0);
  });

  it("returns an error result when the API fails", async () => {
    stubFetchError(403, "forbidden");
    const tools = captureTools(envWithToken());
    const result = await tools["get_exercise_sessions"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── get_sleep ───────────────────────────────────────────────────────────────

describe("get_sleep", () => {
  it("returns sleep data", async () => {
    stubFetch({ dataPoints: [{ sleep: {} }] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_sleep"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("dataPoints");
  });
});

// ─── get_spo2 ────────────────────────────────────────────────────────────────

describe("get_spo2", () => {
  it("returns samples and daily summary", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_spo2"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("samples");
    expect(data).toHaveProperty("dailySummary");
  });
});

// ─── get_weight ──────────────────────────────────────────────────────────────

describe("get_weight", () => {
  it("returns weight data", async () => {
    stubFetch({ dataPoints: [{ weight: 70 }] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_weight"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data.dataPoints).toHaveLength(1);
  });
});

// ─── get_raw_data_points ─────────────────────────────────────────────────────

describe("get_raw_data_points", () => {
  it("queries the specified data type with date filter", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    await tools["get_raw_data_points"]({ dataType: "body-fat", startDate: "2026-05-01", endDate: "2026-05-31" });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/dataTypes/body-fat/dataPoints");
  });

  it("returns an error result on API failure", async () => {
    stubFetchError(400, "bad request");
    const tools = captureTools(envWithToken());
    const result = await tools["get_raw_data_points"]({ dataType: "body-fat", startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── check_progress_vs_target ────────────────────────────────────────────────

describe("check_progress_vs_target", () => {
  it("returns target alongside raw daily data", async () => {
    stubFetch({ dataPoints: [{ value: 9000 }] });
    const tools = captureTools(envWithToken());
    const result = await tools["check_progress_vs_target"]({ dataType: "steps", target: 10000, startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data.target).toBe(10000);
    expect(data).toHaveProperty("rawDailyData");
  });
});

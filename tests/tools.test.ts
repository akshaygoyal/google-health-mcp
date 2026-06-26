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

  it("returns an error result when KV throws", async () => {
    const env = makeEnv({
      HEALTH_TOKENS: { get: async () => { throw new Error("KV failure"); } } as unknown as KVNamespace,
    });
    const tools = captureTools(env);
    const result = await tools["health_connection_status"]({}) as { isError: boolean };
    expect(result.isError).toBe(true);
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

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_steps_history"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
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

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_heart_rate"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
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

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_sleep"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
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

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_spo2"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
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

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_weight"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
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

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["check_progress_vs_target"]({ dataType: "steps", target: 10000, startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── get_active_energy ───────────────────────────────────────────────────────

describe("get_active_energy", () => {
  it("returns daily active energy burned", async () => {
    stubFetch({ dataPoints: [{ value: 350 }] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_active_energy"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data.dataPoints).toHaveLength(1);
  });

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_active_energy"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── get_active_minutes ──────────────────────────────────────────────────────

describe("get_active_minutes", () => {
  it("returns active minutes and active zone minutes", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_active_minutes"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("activeMinutes");
    expect(data).toHaveProperty("activeZoneMinutes");
  });

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_active_minutes"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── get_floors ──────────────────────────────────────────────────────────────

describe("get_floors", () => {
  it("returns daily floors climbed", async () => {
    stubFetch({ dataPoints: [{ value: 12 }] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_floors"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data.dataPoints).toHaveLength(1);
  });
});

// ─── get_altitude ────────────────────────────────────────────────────────────

describe("get_altitude", () => {
  it("queries altitude with date filter", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    await tools["get_altitude"]({ startDate: "2026-05-01", endDate: "2026-05-31" });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/dataTypes/altitude/dataPoints");
    expect(url).toContain("filter=");
  });

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_altitude"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── get_sedentary_periods ───────────────────────────────────────────────────

describe("get_sedentary_periods", () => {
  it("queries sedentary-period with date filter", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    await tools["get_sedentary_periods"]({ startDate: "2026-05-01", endDate: "2026-05-31" });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/dataTypes/sedentary-period/dataPoints");
    expect(url).toContain("filter=");
  });
});

// ─── get_activity_level ──────────────────────────────────────────────────────

describe("get_activity_level", () => {
  it("queries activity-level via reconcile with date filter", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    await tools["get_activity_level"]({ startDate: "2026-05-01", endDate: "2026-05-31" });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/dataTypes/activity-level/dataPoints:reconcile");
  });
});

// ─── get_swim_sessions ───────────────────────────────────────────────────────

describe("get_swim_sessions", () => {
  it("queries swim-lengths-data with date filter", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    await tools["get_swim_sessions"]({ startDate: "2026-05-01", endDate: "2026-05-31" });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/dataTypes/swim-lengths-data/dataPoints");
    expect(url).toContain("filter=");
  });
});

// ─── get_vo2_max ─────────────────────────────────────────────────────────────

describe("get_vo2_max", () => {
  it("returns vo2Max, runVo2Max, and dailyVo2Max", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_vo2_max"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("vo2Max");
    expect(data).toHaveProperty("runVo2Max");
    expect(data).toHaveProperty("dailyVo2Max");
  });

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_vo2_max"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── get_heart_rate_variability ──────────────────────────────────────────────

describe("get_heart_rate_variability", () => {
  it("returns hrv and daily hrv", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_heart_rate_variability"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("heartRateVariability");
    expect(data).toHaveProperty("dailyHeartRateVariability");
  });

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_heart_rate_variability"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── get_heart_rate_zones ────────────────────────────────────────────────────

describe("get_heart_rate_zones", () => {
  it("returns daily zones, time in zones, and calories in zones", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_heart_rate_zones"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("dailyZones");
    expect(data).toHaveProperty("timeInZones");
    expect(data).toHaveProperty("caloriesInZones");
  });

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_heart_rate_zones"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── get_irregular_rhythm_notifications ──────────────────────────────────────

describe("get_irregular_rhythm_notifications", () => {
  it("queries irregular-rhythm-notification without filter", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    await tools["get_irregular_rhythm_notifications"]({ startDate: "2026-05-01", endDate: "2026-05-31" });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/dataTypes/irregular-rhythm-notification/dataPoints");
    expect(url).not.toContain("filter=");
  });
});

// ─── get_ecg ─────────────────────────────────────────────────────────────────

describe("get_ecg", () => {
  it("queries electrocardiogram without filter", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    await tools["get_ecg"]({ startDate: "2026-05-01", endDate: "2026-05-31" });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/dataTypes/electrocardiogram/dataPoints");
    expect(url).not.toContain("filter=");
  });

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_ecg"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── get_body_composition ────────────────────────────────────────────────────

describe("get_body_composition", () => {
  it("returns body fat and height", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_body_composition"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("bodyFat");
    expect(data).toHaveProperty("height");
  });

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_body_composition"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── get_blood_glucose ───────────────────────────────────────────────────────

describe("get_blood_glucose", () => {
  it("returns blood glucose data", async () => {
    stubFetch({ dataPoints: [{ value: 95 }] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_blood_glucose"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data.dataPoints).toHaveLength(1);
  });

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_blood_glucose"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── get_temperature ─────────────────────────────────────────────────────────

describe("get_temperature", () => {
  it("returns core body temperature and sleep temperature derivations", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_temperature"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("coreBodyTemperature");
    expect(data).toHaveProperty("sleepTemperatureDerivations");
  });

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_temperature"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── get_respiratory_rate ────────────────────────────────────────────────────

describe("get_respiratory_rate", () => {
  it("returns daily respiratory rate and sleep summary", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_respiratory_rate"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("dailyRespiratoryRate");
    expect(data).toHaveProperty("sleepSummary");
  });

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_respiratory_rate"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── get_nutrition ───────────────────────────────────────────────────────────

describe("get_nutrition", () => {
  it("returns hydration and nutrition data", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    const result = await tools["get_nutrition"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { content: { text: string }[] };
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty("hydration");
    expect(data).toHaveProperty("nutrition");
  });

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_nutrition"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── missing error path tests ────────────────────────────────────────────────

describe("get_floors (error path)", () => {
  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_floors"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

describe("get_sedentary_periods (error path)", () => {
  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_sedentary_periods"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

describe("get_activity_level (error path)", () => {
  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_activity_level"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

describe("get_swim_sessions (error path)", () => {
  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_swim_sessions"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

describe("get_irregular_rhythm_notifications (error path)", () => {
  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_irregular_rhythm_notifications"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

// ─── get_food ────────────────────────────────────────────────────────────────

describe("get_food", () => {
  it("queries food without filter", async () => {
    stubFetch({ dataPoints: [] });
    const tools = captureTools(envWithToken());
    await tools["get_food"]({ startDate: "2026-05-01", endDate: "2026-05-31" });
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/dataTypes/food/dataPoints");
    expect(url).not.toContain("filter=");
  });

  it("returns an error result on API failure", async () => {
    stubFetchError(500, "error");
    const tools = captureTools(envWithToken());
    const result = await tools["get_food"]({ startDate: "2026-05-01", endDate: "2026-05-31" }) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});

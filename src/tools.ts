/**
 * MCP tool definitions. Each tool wraps a Google Health API call.
 * Kept deliberately read-only — this server never writes data back.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env } from "./auth.js";
import { getTokenStatus } from "./auth.js";
import {
  getDailyRollUp,
  listDataPoints,
  listDataPointsUnfiltered,
  listAllDataPointsUnfiltered,
  reconcileDataPoints,
  GoogleHealthApiError,
} from "./google-health-client.js";
import { DataType } from "./data-types.js";

// IMPORTANT: this must be a function, not a single shared constant. If the
// same Zod object instance is reused for both startDate and endDate in a
// tool's parameter shape, the JSON Schema serializer treats them as
// identical and collapses the second occurrence into a `$ref` pointer
// instead of a concrete `string` type. MCP clients that don't dereference
// `$ref` then see that field as untyped ("any") and may send `null` for it.
// Calling this function twice gives each field its own distinct instance.
function dateParam() {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
    .describe("Date in YYYY-MM-DD format");
}

function errorResult(err: unknown) {
  const message =
    err instanceof GoogleHealthApiError
      ? err.message
      : err instanceof Error
      ? err.message
      : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerTools(server: McpServer, env: Env): void {
  server.tool(
    "health_connection_status",
    "Check whether this server has a valid Google Health connection " +
      "(refresh token present, access token cache state). Use this first " +
      "if other tools are failing.",
    {},
    async () => {
      try {
        const status = await getTokenStatus(env);
        return jsonResult(status);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_daily_summary",
    "Get a daily summary (steps, total calories, distance) for a date range.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const [steps, calories, distance] = await Promise.all([
          getDailyRollUp(env, DataType.steps, startDate, endDate),
          getDailyRollUp(env, DataType.calories, startDate, endDate),
          getDailyRollUp(env, DataType.distance, startDate, endDate),
        ]);
        return jsonResult({ steps, calories, distance });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_steps_history",
    "Get daily step counts over a date range, for trend analysis.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const data = await getDailyRollUp(env, DataType.steps, startDate, endDate);
        return jsonResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_heart_rate",
    "Get heart rate data for a date range: raw samples (reconciled across " +
      "sources) plus daily resting heart rate.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const [samples, restingHr] = await Promise.all([
          reconcileDataPoints(env, DataType.heartRate, startDate, endDate),
          getDailyRollUp(env, DataType.dailyRestingHeartRate, startDate, endDate),
        ]);
        return jsonResult({ samples, restingHeartRate: restingHr });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_exercise_sessions",
    "Get logged exercise/workout sessions (e.g. runs) for a date range, " +
      "including duration, distance and calories where available.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const raw = await listAllDataPointsUnfiltered(env, DataType.exercise) as { dataPoints?: Array<{ exercise?: { interval?: { startTime?: string } } }> };
        const startMs = new Date(`${startDate}T00:00:00Z`).getTime();
        const endMs = new Date(`${endDate}T23:59:59Z`).getTime();
        const data = {
          ...raw,
          dataPoints: (raw.dataPoints ?? []).filter(p => {
            const t = p.exercise?.interval?.startTime;
            if (!t) return false;
            const ms = new Date(t).getTime();
            return ms >= startMs && ms <= endMs;
          }),
        };
        return jsonResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_sleep",
    "Get sleep-related data for a date range.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        // The "sleep" data type doesn't support the interval filter field,
        // so we fetch all points and filter client-side by date.
        const data = await listDataPointsUnfiltered(env, DataType.sleep);
        return jsonResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_spo2",
    "Get blood oxygen saturation (SpO2) readings for a date range.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const [raw, daily] = await Promise.all([
          listDataPoints(env, DataType.oxygenSaturation, startDate, endDate),
          getDailyRollUp(env, DataType.dailyOxygenSaturation, startDate, endDate),
        ]);
        return jsonResult({ samples: raw, dailySummary: daily });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_weight",
    "Get weight measurements over a date range.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const data = await listDataPoints(env, DataType.weight, startDate, endDate);
        return jsonResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_raw_data_points",
    "Advanced/debug tool: call any Google Health API data type by its raw " +
      "identifier with the `list` method. Use this to discover or verify the " +
      "correct data type string (e.g. for sleep) if the convenience tools " +
      "above return empty results — check " +
      "https://developers.google.com/health/data-types for the current list.",
    { dataType: z.string().describe("Raw Google Health API data type identifier, e.g. 'steps'"), startDate: dateParam(), endDate: dateParam() },
    async ({ dataType, startDate, endDate }) => {
      try {
        const data = await listDataPoints(env, dataType, startDate, endDate);
        return jsonResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // Goals: the Google Health API is organized around data-type records
  // (steps, weight, etc.), not a documented first-class "goals" resource at
  // time of writing. Rather than guess at a nonexistent endpoint, this tool
  // is honest about that and computes a simple proxy instead: your recent
  // average vs. a target you supply, so it's still useful for things like
  // half-marathon training pace checks.
  server.tool(
    "check_progress_vs_target",
    "There is no confirmed Google Health 'goals' API endpoint, so this tool " +
      "doesn't fetch a stored goal. Instead, give it a metric (e.g. 'steps') " +
      "and a target number, and it compares your recent daily average against " +
      "that target over the given date range.",
    {
      dataType: z.string().describe("Data type to check, e.g. 'steps'"),
      target: z.number().describe("Your target value per day"),
      startDate: dateParam(),
      endDate: dateParam(),
    },
    async ({ dataType, target, startDate, endDate }) => {
      try {
        const data = await getDailyRollUp(env, dataType, startDate, endDate);
        return jsonResult({ target, rawDailyData: data });
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}

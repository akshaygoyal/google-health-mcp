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

  // ─── Activity & Fitness ──────────────────────────────────────────────────

  server.tool(
    "get_active_energy",
    "Get daily active energy burned (calories from activity, not BMR) for a date range.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const data = await getDailyRollUp(env, DataType.activeEnergyBurned, startDate, endDate);
        return jsonResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_active_minutes",
    "Get daily active minutes and active zone minutes for a date range.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const [activeMinutes, activeZoneMinutes] = await Promise.all([
          getDailyRollUp(env, DataType.activeMinutes, startDate, endDate),
          getDailyRollUp(env, DataType.activeZoneMinutes, startDate, endDate),
        ]);
        return jsonResult({ activeMinutes, activeZoneMinutes });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_floors",
    "Get daily floors climbed for a date range.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const data = await getDailyRollUp(env, DataType.floors, startDate, endDate);
        return jsonResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_altitude",
    "Get altitude readings for a date range.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const data = await listDataPoints(env, DataType.altitude, startDate, endDate);
        return jsonResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_sedentary_periods",
    "Get sedentary (inactive) periods for a date range.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const data = await listDataPoints(env, DataType.sedentaryPeriod, startDate, endDate);
        return jsonResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_activity_level",
    "Get activity level classifications (sedentary, light, moderate, intense) for a date range.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const data = await reconcileDataPoints(env, DataType.activityLevel, startDate, endDate);
        return jsonResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_swim_sessions",
    "Get swim workout sessions for a date range, including lengths and stroke data.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const data = await listDataPoints(env, DataType.swimLengthsData, startDate, endDate);
        return jsonResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ─── Cardio & Heart ──────────────────────────────────────────────────────

  server.tool(
    "get_vo2_max",
    "Get VO2 max readings for a date range: raw VO2 max samples, run-specific VO2 max, " +
      "and daily VO2 max. Note: these types do not support server-side date filtering — " +
      "all recorded values are returned.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const [vo2Max, runVo2Max, dailyVo2Max] = await Promise.all([
          listDataPointsUnfiltered(env, DataType.vo2Max),
          listDataPointsUnfiltered(env, DataType.runVo2Max),
          listDataPointsUnfiltered(env, DataType.dailyVo2Max),
        ]);
        return jsonResult({ vo2Max, runVo2Max, dailyVo2Max });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_heart_rate_variability",
    "Get heart rate variability (HRV) data for a date range. Note: these types do not " +
      "support server-side date filtering — all recorded values are returned.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const [hrv, dailyHrv] = await Promise.all([
          listDataPointsUnfiltered(env, DataType.heartRateVariability),
          listDataPointsUnfiltered(env, DataType.dailyHeartRateVariability),
        ]);
        return jsonResult({ heartRateVariability: hrv, dailyHeartRateVariability: dailyHrv });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_heart_rate_zones",
    "Get heart rate zone data for a date range: daily zone summaries, time spent in " +
      "each zone, and calories burned per zone.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const [dailyZones, timeInZones, caloriesInZones] = await Promise.all([
          listDataPointsUnfiltered(env, DataType.dailyHeartRateZones),
          getDailyRollUp(env, DataType.timeInHeartRateZone, startDate, endDate),
          getDailyRollUp(env, DataType.caloriesInHeartRateZone, startDate, endDate),
        ]);
        return jsonResult({ dailyZones, timeInZones, caloriesInZones });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_irregular_rhythm_notifications",
    "Get irregular heart rhythm (AFib) notifications. Note: does not support server-side " +
      "date filtering — all recorded notifications are returned.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const data = await listDataPointsUnfiltered(env, DataType.irregularRhythmNotification);
        return jsonResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_ecg",
    "Get electrocardiogram (ECG) recordings. Note: does not support server-side date " +
      "filtering — all recorded ECGs are returned.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const data = await listDataPointsUnfiltered(env, DataType.electrocardiogram);
        return jsonResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ─── Health Metrics ──────────────────────────────────────────────────────

  server.tool(
    "get_body_composition",
    "Get body composition data (body fat percentage and height) for a date range.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const [bodyFat, height] = await Promise.all([
          getDailyRollUp(env, DataType.bodyFat, startDate, endDate),
          listDataPointsUnfiltered(env, DataType.height),
        ]);
        return jsonResult({ bodyFat, height });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_blood_glucose",
    "Get blood glucose readings for a date range.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const data = await getDailyRollUp(env, DataType.bloodGlucose, startDate, endDate);
        return jsonResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_temperature",
    "Get body temperature data for a date range: core body temperature readings and " +
      "daily sleep temperature derivations.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const [coreTemp, sleepTempDerivations] = await Promise.all([
          getDailyRollUp(env, DataType.coreBodyTemperature, startDate, endDate),
          listDataPointsUnfiltered(env, DataType.dailySleepTemperatureDerivations),
        ]);
        return jsonResult({ coreBodyTemperature: coreTemp, sleepTemperatureDerivations: sleepTempDerivations });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_respiratory_rate",
    "Get respiratory rate data for a date range. Note: these types do not support " +
      "server-side date filtering — all recorded values are returned.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const [daily, sleepSummary] = await Promise.all([
          listDataPointsUnfiltered(env, DataType.dailyRespiratoryRate),
          listDataPointsUnfiltered(env, DataType.respiratoryRateSleepSummary),
        ]);
        return jsonResult({ dailyRespiratoryRate: daily, sleepSummary });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // ─── Nutrition ───────────────────────────────────────────────────────────

  server.tool(
    "get_nutrition",
    "Get nutrition and hydration data for a date range: daily hydration log and " +
      "nutrition log summaries.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const [hydration, nutrition] = await Promise.all([
          getDailyRollUp(env, DataType.hydrationLog, startDate, endDate),
          getDailyRollUp(env, DataType.nutritionLog, startDate, endDate),
        ]);
        return jsonResult({ hydration, nutrition });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.tool(
    "get_food",
    "Get logged food entries. Note: does not support server-side date filtering — " +
      "all recorded entries are returned.",
    { startDate: dateParam(), endDate: dateParam() },
    async ({ startDate, endDate }) => {
      try {
        const data = await listDataPointsUnfiltered(env, DataType.food);
        return jsonResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}

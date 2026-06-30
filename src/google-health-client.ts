/**
 * Thin client for the Google Health API v4.
 * Docs: https://developers.google.com/health/reference/rest
 *
 * The API exposes per-data-type resources at:
 *   https://health.googleapis.com/v4/users/me/dataTypes/{dataType}/dataPoints
 * with read methods: list (raw points), reconcile (merged across sources),
 * rollUp (aggregate over a time window), dailyRollUp (aggregate per civil day).
 *
 * We mostly use `list` (for raw/event-style data like exercise sessions,
 * sleep, weight, SpO2 readings) and `dailyRollUp` (for things you want a
 * single number per day for, like steps, calories, resting heart rate).
 */

import { getAccessToken, type Env } from "./auth.js";

const BASE_URL = "https://health.googleapis.com/v4/users/me";

export class GoogleHealthApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Google Health API error (${status}): ${body}`);
  }
}

async function callGoogleHealth(
  env: Env,
  userId: string,
  path: string,
  searchParams?: Record<string, string>,
  body?: unknown
): Promise<unknown> {
  const accessToken = await getAccessToken(env, userId);
  const url = new URL(`${BASE_URL}${path}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    method: body !== undefined ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new GoogleHealthApiError(res.status, body);
  }

  return res.json();
}

function civilDateParts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

/** ISO 8601 civil date range filter, e.g. for list calls. */
function civilTimeFilter(startDate: string, endDate: string): string {
  // Google Health API filter syntax, per the data-types reference docs.
  return `interval.civil_start_time >= "${startDate}T00:00:00" AND interval.civil_end_time <= "${endDate}T23:59:59"`;
}

export async function getDailyRollUp(
  env: Env,
  userId: string,
  dataType: string,
  startDate: string,
  endDate: string
): Promise<unknown> {
  return callGoogleHealth(
    env,
    userId,
    `/dataTypes/${dataType}/dataPoints:dailyRollUp`,
    undefined,
    {
      range: {
        start: { date: civilDateParts(startDate) },
        end: { date: civilDateParts(endDate) },
      },
    }
  );
}

export async function listDataPoints(
  env: Env,
  userId: string,
  dataType: string,
  startDate: string,
  endDate: string
): Promise<unknown> {
  return callGoogleHealth(env, userId, `/dataTypes/${dataType}/dataPoints`, {
    filter: civilTimeFilter(startDate, endDate),
  });
}

/** List data points without a filter — needed for types like `sleep` that don't support the `interval` filter field. */
export async function listDataPointsUnfiltered(
  env: Env,
  userId: string,
  dataType: string
): Promise<unknown> {
  return callGoogleHealth(env, userId, `/dataTypes/${dataType}/dataPoints`);
}

/** Paginate through all pages of an unfiltered list, collecting all dataPoints. */
export async function listAllDataPointsUnfiltered(
  env: Env,
  userId: string,
  dataType: string
): Promise<{ dataPoints: unknown[] }> {
  const allPoints: unknown[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {};
    if (pageToken) params.pageToken = pageToken;
    const page = await callGoogleHealth(
      env,
      userId,
      `/dataTypes/${dataType}/dataPoints`,
      Object.keys(params).length ? params : undefined
    ) as { dataPoints?: unknown[]; nextPageToken?: string };
    if (page.dataPoints) allPoints.push(...page.dataPoints);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return { dataPoints: allPoints };
}

export async function reconcileDataPoints(
  env: Env,
  userId: string,
  dataType: string,
  startDate: string,
  endDate: string
): Promise<unknown> {
  return callGoogleHealth(env, userId, `/dataTypes/${dataType}/dataPoints:reconcile`, {
    filter: civilTimeFilter(startDate, endDate),
  });
}

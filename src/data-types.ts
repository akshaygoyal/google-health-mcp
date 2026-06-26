/**
 * Google Health API data type identifiers.
 *
 * IMPORTANT: Multi-word data type names must be kebab-case in endpoint URLs
 * (e.g. "total-calories"), but snake_case in filter expressions
 * (e.g. "total_calories"). These constants are used in URLs, so they use
 * kebab-case. See https://developers.google.com/health/data-types.
 */

export const DataType = {
  steps: "steps",
  exercise: "exercise",
  weight: "weight",
  oxygenSaturation: "oxygen-saturation",
  dailyOxygenSaturation: "daily-oxygen-saturation",
  heartRate: "heart-rate",
  dailyRestingHeartRate: "daily-resting-heart-rate",
  calories: "total-calories",
  distance: "distance",
  // "sleep" is recognized by the API (returns INVALID_DATA_POINT_FILTER rather
  // than INVALID_PARENT_DATA_TYPE_COLLECTION like wrong names do), but it does
  // not support the "interval" filter field that other data types use.
  // We query it without a date filter and slice client-side instead.
  sleep: "sleep",
} as const;

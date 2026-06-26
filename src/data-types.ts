/**
 * Google Health API data type identifiers.
 *
 * IMPORTANT: Multi-word data type names must be kebab-case in endpoint URLs
 * (e.g. "total-calories"), but snake_case in filter expressions
 * (e.g. "total_calories"). These constants are used in URLs, so they use
 * kebab-case. See https://developers.google.com/health/data-types.
 *
 * Each constant is annotated with the read methods it supports and whether
 * it supports the civil_time interval filter in list calls:
 *   [D] = dailyRollUp   [L] = list   [R] = reconcile   [F] = interval filter
 */

export const DataType = {
  // ─── Activity & Fitness ────────────────────────────────────────────────────
  steps:               "steps",               // [D][L][F]
  distance:            "distance",            // [D][L][F]
  activeEnergyBurned:  "active-energy-burned",// [D][L][F]
  activeMinutes:       "active-minutes",      // [D][L][F]
  activeZoneMinutes:   "active-zone-minutes", // [D][L][F]
  floors:              "floors",              // [D][F]
  altitude:            "altitude",            // [D][L][F]
  sedentaryPeriod:     "sedentary-period",    // [D][L][F]
  activityLevel:       "activity-level",      // [L][R][F]
  swimLengthsData:     "swim-lengths-data",   // [D][L][F]
  exercise:            "exercise",            // [L] – no interval filter support

  // ─── Cardio & Heart ────────────────────────────────────────────────────────
  heartRate:                "heart-rate",                // [D][L][F]
  dailyRestingHeartRate:    "daily-resting-heart-rate",  // [L][R]
  heartRateVariability:     "heart-rate-variability",    // [L][R]
  dailyHeartRateVariability:"daily-heart-rate-variability", // [L][R]
  dailyHeartRateZones:      "daily-heart-rate-zones",   // [L][R]
  timeInHeartRateZone:      "time-in-heart-rate-zone",  // [D][L][F]
  caloriesInHeartRateZone:  "calories-in-heart-rate-zone", // [D][F]
  vo2Max:                   "vo2-max",                  // [L][R]
  runVo2Max:                "run-vo2-max",              // [D][L]
  dailyVo2Max:              "daily-vo2-max",            // [L][R]
  irregularRhythmNotification: "irregular-rhythm-notification", // [L]
  electrocardiogram:        "electrocardiogram",        // [L]

  // ─── Health Metrics ────────────────────────────────────────────────────────
  weight:                       "weight",                        // [D][L]
  height:                       "height",                        // [L]
  bodyFat:                      "body-fat",                      // [D][L]
  bloodGlucose:                 "blood-glucose",                 // [D][L]
  oxygenSaturation:             "oxygen-saturation",             // [L][R]
  dailyOxygenSaturation:        "daily-oxygen-saturation",       // [L][R]
  coreBodyTemperature:          "core-body-temperature",         // [D][L]
  dailySleepTemperatureDerivations: "daily-sleep-temperature-derivations", // [L][R]
  respiratoryRateSleepSummary:  "respiratory-rate-sleep-summary",// [L][R]
  dailyRespiratoryRate:         "daily-respiratory-rate",        // [L][R]

  // ─── Sleep ─────────────────────────────────────────────────────────────────
  sleep: "sleep", // [L] – no interval filter support

  // ─── Nutrition ─────────────────────────────────────────────────────────────
  calories:      "total-calories", // [D][F]
  hydrationLog:  "hydration-log",  // [D][L]
  nutritionLog:  "nutrition-log",  // [D][L]
  food:          "food",           // [L]
} as const;

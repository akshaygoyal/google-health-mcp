# Changelog

All notable changes to this project will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-26

### Added
- 18 new tools covering all remaining Google Health API data types:
  - **Activity**: `get_active_energy`, `get_active_minutes`, `get_floors`, `get_altitude`, `get_sedentary_periods`, `get_activity_level`, `get_swim_sessions`
  - **Cardio**: `get_vo2_max`, `get_heart_rate_variability`, `get_heart_rate_zones`, `get_irregular_rhythm_notifications`, `get_ecg`
  - **Health metrics**: `get_body_composition`, `get_blood_glucose`, `get_temperature`, `get_respiratory_rate`
  - **Nutrition**: `get_nutrition`, `get_food`
- Full `DataType` constant coverage for all 38 supported Google Health API data types
- 46 new test cases (82 total), achieving 100% statement and line coverage
- Rewrote README with badges, conversation examples, and clearer setup guide

## [0.1.0] - 2026-06-26

### Added
- Initial release
- MCP server running on Cloudflare Workers
- Google OAuth token management with KV-backed caching
- Tools: `get_daily_summary`, `get_steps_history`, `get_heart_rate`, `get_exercise_sessions`, `get_sleep`, `get_spo2`, `get_weight`, `get_raw_data_points`, `check_progress_vs_target`, `health_connection_status`
- Pagination support for exercise sessions to retrieve full history
- Client-side date filtering for data types that don't support API-level date filters

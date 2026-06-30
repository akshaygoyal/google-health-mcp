# Changelog

All notable changes to this project will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- `wrangler.toml` is now gitignored — copy `wrangler.toml.example` to `wrangler.toml` and fill in your KV namespace ID (keeps personal infrastructure config off GitHub)

## [0.3.0] - 2026-06-30

### Added
- **Multi-user support**: each user's Google OAuth tokens are now stored in Cloudflare KV under namespaced keys (`user:<userId>:refresh_token`, `user:<userId>:access_token_cache`), allowing multiple users to share a single Worker deployment
- The MCP endpoint URL changes from `/mcp/<secret>` to `/mcp/<userId>/<secret>` — each user gets their own personal URL
- `token:setup` script now requires a `--user=<userId>` argument and prints the correctly namespaced `wrangler kv key put` command
- Weekly GitHub Actions workflow (`.github/workflows/monitor-api.yml`) to detect changes to the Google Health API and open a tracking issue automatically

### Migration from 0.2.0
Re-run the token setup with a user ID and store the token under the new key:
```bash
GOOGLE_CLIENT_ID=your-id GOOGLE_CLIENT_SECRET=your-secret npm run token:setup -- --user=alice
wrangler kv key put --binding=HEALTH_TOKENS "user:alice:refresh_token" "your-refresh-token"
```
Update your MCP client's connector URL from `/mcp/<secret>` to `/mcp/alice/<secret>`. The old `google_refresh_token` KV key is no longer read and can be deleted.

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

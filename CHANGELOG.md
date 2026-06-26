# Changelog

All notable changes to this project will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-26

### Added
- Initial release
- MCP server running on Cloudflare Workers
- Google OAuth token management with KV-backed caching
- Tools: `get_daily_summary`, `get_steps_history`, `get_heart_rate`, `get_exercise_sessions`, `get_sleep`, `get_spo2`, `get_weight`, `get_raw_data_points`, `check_progress_vs_target`, `health_connection_status`
- Pagination support for exercise sessions to retrieve full history
- Client-side date filtering for data types that don't support API-level date filters

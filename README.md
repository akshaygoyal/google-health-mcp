# Google Health MCP

[![CI](https://github.com/akshaygoyal/google-health-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/akshaygoyal/google-health-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Deploy time: ~10 min](https://img.shields.io/badge/deploy%20time-~10%20min-blue)](#setup)

> Ask your AI assistant about your own health data — steps, sleep, runs, heart rate, weight and more. Self-host in ~10 minutes on Cloudflare's free tier.

Works with **Claude**, **Cursor**, **Windsurf**, **Zed**, **VS Code (Copilot)**, **Continue.dev**, and any other [MCP](https://modelcontextprotocol.io)-compatible client.

---

## See it in action

### Monthly exercise recap

```
You:    Summarise my exercise sessions for May

AI:     You logged 39 sessions in May — 2 runs and 37 walks.

        Highlights:
        • May 9  — Long run: 21.4 km in 2h 56m (looks like a half marathon effort!)
        • May 5  — Run: 5.1 km in 39 min
        • May 25 — Most active day: 7 walks, ~6.5 km total

        You were most active in the last week of May (May 22–31),
        with activity on 8 out of 10 days.
```

### Sleep check-in

```
You:    How did I sleep last week?

AI:     Here's your sleep for Jun 16–22:

        Mon  7h 42m  ██████████████████░░░░
        Tue  6h 55m  ████████████████░░░░░░
        Wed  8h 03m  ████████████████████░░
        Thu  7h 20m  ██████████████████░░░░
        Fri  6h 30m  ███████████████░░░░░░░
        Sat  8h 45m  █████████████████████░
        Sun  7h 55m  ████████████████████░░

        Average: 7h 36m. Saturday was your best night.
        Tuesday and Friday were slightly under 7 hours.
```

### Progress towards a goal

```
You:    Am I hitting 10,000 steps a day this month?

AI:     Over the last 30 days your daily average is 8,340 steps —
        about 83% of your 10,000-step target.

        You hit the goal on 11 out of 30 days.
        Best day: June 20 with 14,200 steps.
        Weekends tend to be stronger than weekdays for you.
```

### Heart rate during a run

```
You:    What was my heart rate during my run on June 24?

AI:     During your 27-minute run on June 24 (3.76 km):

        Average heart rate: 180 bpm
        That puts it firmly in Zone 4 (threshold/hard effort).
        Your resting HR that day was 58 bpm — roughly 3× baseline.
```

---

## More things you can ask

- *"How has my resting heart rate changed over the last 3 months?"*
- *"Did I average more than 7 hours of sleep in June?"*
- *"Compare my step counts this week vs last week."*
- *"What's my average SpO2 at night?"*
- *"How much have I walked vs run this year?"*
- *"Show me my weight trend since January."*
- *"Which day of the week am I most active?"*

---

## Available tools

**Activity & Fitness**

| Tool | Description |
|------|-------------|
| `get_daily_summary` | Steps, calories and distance for a date range |
| `get_steps_history` | Daily step counts for trend analysis |
| `get_exercise_sessions` | Logged workouts with duration, distance, type |
| `get_active_energy` | Daily active calories burned (excludes BMR) |
| `get_active_minutes` | Daily active minutes and active zone minutes |
| `get_floors` | Daily floors climbed |
| `get_altitude` | Altitude readings |
| `get_sedentary_periods` | Inactive/sedentary periods |
| `get_activity_level` | Activity level classifications (sedentary → intense) |
| `get_swim_sessions` | Swim sessions with lengths and stroke data |

**Cardio & Heart**

| Tool | Description |
|------|-------------|
| `get_heart_rate` | Raw heart rate samples + daily resting HR |
| `get_heart_rate_variability` | HRV samples and daily HRV |
| `get_heart_rate_zones` | Time and calories in each heart rate zone |
| `get_vo2_max` | VO2 max, run VO2 max, and daily VO2 max |
| `get_irregular_rhythm_notifications` | AFib / irregular rhythm alerts |
| `get_ecg` | Electrocardiogram recordings |

**Health Metrics**

| Tool | Description |
|------|-------------|
| `get_spo2` | Blood oxygen saturation (SpO2) readings |
| `get_weight` | Weight measurements over time |
| `get_body_composition` | Body fat percentage and height |
| `get_blood_glucose` | Blood glucose readings |
| `get_temperature` | Core body temperature and sleep temperature derivations |
| `get_respiratory_rate` | Daily respiratory rate and sleep respiratory summary |

**Sleep**

| Tool | Description |
|------|-------------|
| `get_sleep` | Sleep sessions and stages |

**Nutrition**

| Tool | Description |
|------|-------------|
| `get_nutrition` | Daily hydration and nutrition log summaries |
| `get_food` | Logged food entries |

**Utilities**

| Tool | Description |
|------|-------------|
| `get_raw_data_points` | Query any Google Health data type by its raw ID |
| `check_progress_vs_target` | Compare your recent daily average against a target |
| `health_connection_status` | Check token health / debug connection issues |

---

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is sufficient)
- [Google Cloud project](https://console.cloud.google.com) with the Health API enabled
- Node.js 18+

---

## Setup

7 steps, ~10 minutes.

### 1. Clone and install

```bash
git clone https://github.com/akshaygoyal/google-health-mcp.git
cd google-health-mcp
npm install
```

### 2. Enable the Google Health API

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Enable APIs
2. Search for and enable **Google Health API**
3. Go to **Credentials** → Create **OAuth 2.0 Client ID** (type: Web application)
4. Add `http://127.0.0.1:8765/callback` as an authorised redirect URI
5. Note your **Client ID** and **Client Secret**

### 3. Create a Cloudflare KV namespace

```bash
npm run kv:create
```

Copy the returned `id` and paste it into `wrangler.toml` under `[[kv_namespaces]]`.

### 4. Set secrets in Cloudflare

```bash
# A long random string — becomes part of your private connector URL
wrangler secret put MCP_SHARED_SECRET

# From your Google Cloud OAuth client
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
```

### 5. Get your Google refresh token

```bash
GOOGLE_CLIENT_ID=your-id GOOGLE_CLIENT_SECRET=your-secret npm run token:setup
```

This opens a browser for Google consent. After approving, copy the printed command and run it:

```bash
wrangler kv key put --binding=HEALTH_TOKENS google_refresh_token "your-refresh-token"
```

### 6. Deploy

```bash
npm run deploy
```

Your MCP server is now live at:
```
https://google-health-mcp.<your-workers-subdomain>.workers.dev/mcp/<MCP_SHARED_SECRET>
```

### 7. Connect your MCP client

Add the URL above as a custom MCP server in your AI client:

- **Claude.ai** → Customize → Integrations → Add integration URL
- **Cursor** → Settings → MCP → Add server URL
- **Windsurf** → Settings → MCP Servers → Add
- **VS Code (Copilot)** → `.vscode/mcp.json` → add server entry
- **Continue.dev** → `config.json` → `mcpServers` array

---

## Local development

```bash
cp .dev.vars.example .dev.vars
# Fill in .dev.vars with your credentials
npm run dev
```

---

## Data types

All 38 Google Health API data types have dedicated tools. The `get_raw_data_points` tool is also available for querying any type by its raw identifier — see the [Google Health data types reference](https://developers.google.com/health/data-types) for the full list.

---

## Security

- The MCP endpoint is only accessible via a secret URL — treat it like a password
- This server is **read-only**: it never writes data back to Google Health
- Your refresh token is stored in Cloudflare KV, encrypted at rest

---

## Staying up to date

To pull the latest changes and redeploy your instance:

```bash
git pull origin main
npm install   # only needed if dependencies changed
npm run deploy
```

No re-setup of secrets or KV is needed — those persist across deployments.

If new tools aren't showing up in your AI client after a deployment, disconnect and reconnect the integration — most MCP clients cache the tool list from when you first connected.

If a release changes the Google OAuth scopes (check the [CHANGELOG](CHANGELOG.md)), you'll need to re-run `npm run token:setup` to get a new refresh token with the updated permissions.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a full history of releases and what changed in each version.

---

## Feedback & contributions

Tried it? Found a bug? Want a new data type added?

👉 **[Open an issue](https://github.com/akshaygoyal/google-health-mcp/issues)** — feedback of any kind is very welcome, especially from first-time users.

If you'd like to contribute, please read the [contributing guide](CONTRIBUTING.md) first.

---

## License

MIT
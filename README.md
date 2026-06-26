# Google Health MCP Server

An [MCP](https://modelcontextprotocol.io) server that connects any MCP-compatible AI client to the [Google Health API](https://developers.google.com/health), giving you access to your health and fitness data directly in AI conversations.

Runs as a Cloudflare Worker — deploy your own instance in ~10 minutes.

Compatible with **Claude**, **Cursor**, **Windsurf**, **Zed**, **VS Code (Copilot)**, **Continue.dev**, and any other MCP-compatible client.

## What you can ask

- "How many steps did I take last week?"
- "Show me my sleep data for the past month"
- "What was my resting heart rate trend in May?"
- "Summarize my exercise sessions this year"
- "How does my SpO2 look over the last 30 days?"

## Available tools

| Tool | Description |
|------|-------------|
| `get_daily_summary` | Steps, calories and distance for a date range |
| `get_steps_history` | Daily step counts for trend analysis |
| `get_heart_rate` | Raw heart rate samples + daily resting HR |
| `get_exercise_sessions` | Logged workouts with duration, distance, type |
| `get_sleep` | Sleep sessions and stages |
| `get_spo2` | Blood oxygen saturation readings |
| `get_weight` | Weight measurements over time |
| `get_raw_data_points` | Query any Google Health data type by ID |
| `check_progress_vs_target` | Compare your recent average against a goal |
| `health_connection_status` | Check token health / debug connection issues |

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is sufficient)
- [Google Cloud project](https://console.cloud.google.com) with the Health API enabled
- Node.js 18+

## Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/google-health-mcp.git
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

Add the URL above as a custom MCP server in your AI client. Some examples:

- **Claude.ai** → Customize → Integrations → Add integration URL
- **Cursor** → Settings → MCP → Add server URL
- **Windsurf** → Settings → MCP Servers → Add
- **VS Code (Copilot)** → `.vscode/mcp.json` → add server entry
- **Continue.dev** → `config.json` → `mcpServers` array

## Local development

```bash
cp .dev.vars.example .dev.vars
# Fill in .dev.vars with your credentials
npm run dev
```

## Data types

The `get_raw_data_points` tool accepts any identifier from the [Google Health data types reference](https://developers.google.com/health/data-types), e.g. `body-fat`, `vo2-max`, `blood-glucose`.

## Security

- The MCP endpoint is only accessible via a secret URL — treat it like a password
- This server is **read-only**: it never writes data back to Google Health
- Your refresh token is stored in Cloudflare KV, encrypted at rest

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

## License

MIT

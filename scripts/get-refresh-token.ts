/**
 * One-time local script: run this on your own machine (NOT in the Worker)
 * to do the interactive Google OAuth consent flow and obtain a refresh
 * token. You then store that refresh token in Cloudflare KV once, and the
 * Worker uses it forever after (until revoked).
 *
 * Usage:
 *   1. Set these env vars (or edit the constants below):
 *        GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   2. In your Google Cloud OAuth client, add this exact redirect URI:
 *        http://127.0.0.1:8765/callback
 *   3. Run: npm run token:setup
 *   4. Approve access in the browser window that opens.
 *   5. Copy the printed refresh token, then run:
 *        wrangler kv key put --binding=HEALTH_TOKENS google_refresh_token "PASTE_HERE"
 *
 * IMPORTANT: verify the scope strings below against
 * https://developers.google.com/health/scopes before running this — the
 * Google Health API's scope names were still being revised as of mid-2026
 * (e.g. read vs. write suffixes changing), so treat the list here as a
 * starting point, not a guarantee.
 */

import http from "node:http";
import { URL } from "node:url";
import open from "open";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = "http://127.0.0.1:8765/callback";
const PORT = 8765;

const SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.profile.readonly",
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
].join(" ");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET environment variables.\n" +
      "Example:\n" +
      "  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run token:setup"
  );
  process.exit(1);
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPES);
authUrl.searchParams.set("access_type", "offline"); // required to get a refresh token
authUrl.searchParams.set("prompt", "consent"); // forces a fresh refresh token even on repeat runs

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) {
    res.writeHead(404).end();
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end(`OAuth error: ${error}`);
    console.error(`OAuth error: ${error}`);
    server.close();
    return;
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end("Missing code param");
    return;
  }

  res
    .writeHead(200, { "Content-Type": "text/plain" })
    .end("Success! You can close this tab and return to the terminal.");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      }),
    });

    const data = (await tokenRes.json()) as Record<string, unknown>;

    if (!tokenRes.ok || !data.refresh_token) {
      console.error("\nDid not receive a refresh token. Full response:\n", data);
      console.error(
        "\nIf you've run this script before with the same Google account, " +
          "Google may withhold a new refresh token. Try revoking prior access " +
          "at https://myaccount.google.com/permissions and re-running."
      );
    } else {
      console.log("\n✅ Got a refresh token. Store it in Cloudflare KV with:\n");
      console.log(
        `wrangler kv key put --binding=HEALTH_TOKENS google_refresh_token "${data.refresh_token}"\n`
      );
    }
  } catch (err) {
    console.error("Token exchange failed:", err);
  } finally {
    server.close();
  }
});

server.listen(PORT, () => {
  console.log(`Opening browser for Google OAuth consent...`);
  console.log(`If it doesn't open automatically, visit:\n${authUrl.toString()}\n`);
  open(authUrl.toString());
});

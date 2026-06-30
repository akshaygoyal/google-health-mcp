/**
 * Cloudflare Worker entry point.
 *
 * Security model (multi-user self-hosted):
 *   - The MCP endpoint is at /mcp/<userId>/<MCP_SHARED_SECRET>.
 *   - MCP_SHARED_SECRET is a single worker-level secret set by the admin via
 *     `wrangler secret put`. Anyone without it gets a 404 (avoids confirming
 *     the route exists).
 *   - userId is a namespace, not an auth factor — security comes entirely from
 *     the shared secret. Treat the full URL like a password.
 *   - Each user's Google OAuth tokens are stored in KV under
 *     user:<userId>:refresh_token / user:<userId>:access_token_cache.
 *   - This server only ever reads from Google Health; there are no write
 *     tools, so the worst case of a leaked URL is read access to that
 *     user's health data, not data corruption.
 */

import { Hono } from "hono";
import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";
import type { Env } from "./auth.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("Google Health MCP server is running. See README for setup."));

app.all("/mcp/:userId/:secret", async (c) => {
  const userId = c.req.param("userId");
  const providedSecret = c.req.param("secret");

  if (!c.env.MCP_SHARED_SECRET || providedSecret !== c.env.MCP_SHARED_SECRET) {
    // Deliberately vague 404 rather than 401/403.
    return c.notFound();
  }

  // Restrict userId to safe characters so it can't inject KV key separators.
  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
    return c.notFound();
  }

  const server = new McpServer({
    name: "google-health-mcp",
    version: "0.1.0",
  });

  registerTools(server, c.env, userId);

  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  return transport.handleRequest(c);
});

export default app;

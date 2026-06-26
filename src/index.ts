/**
 * Cloudflare Worker entry point.
 *
 * Security model (single-user self-hosted):
 *   - The MCP endpoint is at /mcp/<MCP_SHARED_SECRET>. Anyone without the
 *     secret gets a 404, not a 401 (avoids confirming the route exists).
 *   - No OAuth flow happens between the MCP client and this Worker — the secret in
 *     the URL is the only gate. Treat that URL like a password.
 *   - This server only ever reads from Google Health; there are no write
 *     tools, so the worst case of a leaked URL is read access to your
 *     health data, not data corruption.
 */

import { Hono } from "hono";
import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";
import type { Env } from "./auth.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("Google Health MCP server is running. See README for setup."));

app.all("/mcp/:secret", async (c) => {
  const providedSecret = c.req.param("secret");
  if (!c.env.MCP_SHARED_SECRET || providedSecret !== c.env.MCP_SHARED_SECRET) {
    // Deliberately vague 404 rather than 401/403.
    return c.notFound();
  }

  const server = new McpServer({
    name: "google-health-mcp",
    version: "0.1.0",
  });

  registerTools(server, c.env);

  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  return transport.handleRequest(c);
});

export default app;

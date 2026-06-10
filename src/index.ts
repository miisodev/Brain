import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { TriliumClient } from "./trilium.js";
import { registerTools } from "./tools.js";
import { loadConfig, discoverBrain, saveConfig, configFilePath, EMPTY_BRAIN } from "./config.js";

const baseUrl = process.env.TRILIUM_BASE_URL;
const token   = process.env.TRILIUM_ETAPI_TOKEN;

if (!baseUrl || !token) {
  console.error("Missing TRILIUM_BASE_URL or TRILIUM_ETAPI_TOKEN environment variables.");
  process.exit(1);
}

const trilium = new TriliumClient(baseUrl, token);

// ── Resolve brain config ───────────────────────────────────────────────────
// Priority: brain.json file → auto-discovery from Trilium → empty (bootstrap needed)

let brain = loadConfig();

if (!brain) {
  console.error("[brain] No brain.json — attempting auto-discovery from Trilium...");
  try {
    brain = await discoverBrain(trilium);
    if (brain) {
      saveConfig(brain);
      console.error(`[brain] Auto-discovered. Config written to: ${configFilePath()}`);
    } else {
      console.error("[brain] Brain not found in Trilium. Run the bootstrap_brain tool to initialize.");
    }
  } catch (err) {
    console.error(`[brain] Auto-discovery failed: ${err}`);
  }
}

// brainRef is a mutable container — bootstrap_brain updates config in-place
// so subsequent tool calls in the same session see the new IDs immediately.
const brainRef = { config: brain ?? EMPTY_BRAIN };

// ── Transport ─────────────────────────────────────────────────────────────────

const port      = process.env.PORT ? parseInt(process.env.PORT, 10) : null;
const authToken = process.env.MCP_AUTH_TOKEN;

// BRAIN_MODE=core (default): the 12 intent-level tools.
// BRAIN_MODE=full: additionally registers the low-level/advanced surface.
const mode: "core" | "full" = process.env.BRAIN_MODE === "full" ? "full" : "core";

function createServer(): McpServer {
  const s = new McpServer({ name: "Brain", version: "4.0.0" });
  registerTools(s, trilium, brainRef, mode);
  return s;
}

if (port) {
  // ── HTTP mode — Railway / remote connector ────────────────────────────────
  // Each MCP session gets its own transport + server instance.
  // Sessions are keyed by the mcp-session-id header the client echoes back.

  const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

  Bun.serve({
    port,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return new Response("OK");
      }

      if (authToken) {
        const auth = req.headers.get("Authorization");
        if (auth !== `Bearer ${authToken}`) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      if (url.pathname !== "/mcp") {
        return new Response("Not Found", { status: 404 });
      }

      const sessionId = req.headers.get("mcp-session-id");

      if (sessionId && sessions.has(sessionId)) {
        return sessions.get(sessionId)!.handleRequest(req);
      }

      if (!sessionId) {
        // Initialization request — create a fresh session
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (id) => { sessions.set(id, transport); },
          onsessionclosed:      (id) => { sessions.delete(id); },
        });

        await createServer().connect(transport);
        return transport.handleRequest(req);
      }

      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  console.error(`[brain] HTTP connector listening on :${port}`);
} else {
  // ── stdio mode — local Claude Code / desktop ──────────────────────────────
  const transport = new StdioServerTransport();
  await createServer().connect(transport);
}

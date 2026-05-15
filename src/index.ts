import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

// ── Server ────────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "Trilium Brain",
  version: "3.0.0",
});

registerTools(server, trilium, brainRef);

const transport = new StdioServerTransport();
await server.connect(transport);

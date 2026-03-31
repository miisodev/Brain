import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TriliumClient } from "./trilium.js";
import { registerTools } from "./tools.js";

const baseUrl = process.env.TRILIUM_BASE_URL;
const token = process.env.TRILIUM_ETAPI_TOKEN;

if (!baseUrl || !token) {
  console.error("Missing TRILIUM_BASE_URL or TRILIUM_ETAPI_TOKEN environment variables.");
  process.exit(1);
}

const trilium = new TriliumClient(baseUrl, token);

const server = new McpServer({
  name: "Trilium Brain",
  version: "2.0.0",
});

registerTools(server, trilium);

const transport = new StdioServerTransport();
await server.connect(transport);

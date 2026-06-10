/**
 * init.ts — One-shot CLI bootstrapper for a fresh Trilium Brain instance.
 * Run with: bun run init  (or: TRILIUM_BASE_URL=... TRILIUM_ETAPI_TOKEN=... bun run src/init.ts)
 *
 * Creates the full brain hierarchy in Trilium and writes brain.json next to
 * the bundle. Same code path as the bootstrap_brain tool.
 */

import { TriliumClient } from "./trilium.js";
import { saveConfig } from "./config.js";
import { createBrainStructure } from "./bootstrap.js";

const baseUrl = process.env.TRILIUM_BASE_URL;
const token   = process.env.TRILIUM_ETAPI_TOKEN;

if (!baseUrl || !token) {
  console.error("Missing TRILIUM_BASE_URL or TRILIUM_ETAPI_TOKEN");
  process.exit(1);
}

const trilium = new TriliumClient(baseUrl, token);

console.log("\n🧠 Bootstrapping Trilium Brain (v4)...\n");

const config = await createBrainStructure(trilium);
const savedPath = saveConfig(config);

const show = (label: string, id: string) => console.log(`  ${id}  ${label}`);
show("root", config.root);
show("identity", config.identity.root);
show("workingMemory", config.workingMemory.root);
show("knowledge", config.knowledge.root);
show("opinions", config.opinions);
show("log", config.log.root);
show("templates", config.templates.root);

console.log("\n✅ Done.");
console.log(`\nConfig written to: ${savedPath}`);
console.log("Start the MCP server — no rebuild or manual ID pasting required.\n");

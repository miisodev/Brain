/**
 * init.ts — One-shot bootstrapper for a fresh Trilium instance.
 * Run with: bun run src/init.ts
 * Prints all created noteIds — paste them into constants.ts then rebuild.
 */

import { TriliumClient } from "./trilium.js";

const baseUrl = process.env.TRILIUM_BASE_URL;
const token = process.env.TRILIUM_ETAPI_TOKEN;

if (!baseUrl || !token) {
  console.error("Missing TRILIUM_BASE_URL or TRILIUM_ETAPI_TOKEN");
  process.exit(1);
}

const trilium = new TriliumClient(baseUrl, token);
const created: Record<string, string> = {};

function log(label: string, noteId: string) {
  created[label] = noteId;
  console.log(`  ${noteId}  ${label}`);
}

console.log("Initializing Trilium...\n");

const triliumRoot = await trilium.createNote("root", "Trilium", "");
log("Trilium", triliumRoot.note.noteId);
await trilium.addLabel(triliumRoot.note.noteId, "iconClass", "bx bx-brain");

const sections = ["Identity", "Working Memory", "Knowledge", "Opinions", "Log"] as const;
const sectionIds: Record<string, string> = {};

for (const title of sections) {
  const r = await trilium.createNote(triliumRoot.note.noteId, title, "");
  sectionIds[title] = r.note.noteId;
  log(`  ${title}`, r.note.noteId);
}

const wmChildren = ["Active Threads", "Decisions", "Open Questions"] as const;
for (const title of wmChildren) {
  const r = await trilium.createNote(sectionIds["Working Memory"], title, "");
  log(`    ${title}`, r.note.noteId);
}

console.log("\nDone. Paste these into constants.ts:\n");
console.log(JSON.stringify(created, null, 2));

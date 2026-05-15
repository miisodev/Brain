// ─────────────────────────────────────────────────────────────────────────────
// Trilium Brain — legacy constants shim
//
// Brain structure IDs are now stored in brain.json at runtime.
// This file exists only for the test suite and any tooling that imports Brain.
// The authoritative source is src/config.ts + brain.json.
// ─────────────────────────────────────────────────────────────────────────────

export { EMPTY_BRAIN as Brain } from "./config.js";

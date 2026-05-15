// ─────────────────────────────────────────────────────────────────────────────
// Trilium Brain — runtime configuration
//
// IDs are stored in brain.json next to the bundle (or at BRAIN_CONFIG_PATH).
// On startup: load file → auto-discover from Trilium → fall back to empty.
// bootstrap_brain writes this file; no manual editing required.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import type { TriliumClient } from "./trilium.js";

// ── Type ─────────────────────────────────────────────────────────────────────

export interface BrainConfig {
  root: string;
  identity: { root: string; profile: string; preferences: string; context: string };
  workingMemory: { root: string; inbox: string; threads: string; decisions: string; openQuestions: string };
  knowledge: { root: string; people: string; organizations: string; projects: string };
  opinions: string;
  log: { root: string; sessions: string; decisionsMade: string };
  templates: { root: string; thread: string; decision: string; concept: string; projectBrief: string; person: string; opinion: string; domain: string };
}

export const EMPTY_BRAIN: BrainConfig = {
  root: "",
  identity:      { root: "", profile: "", preferences: "", context: "" },
  workingMemory: { root: "", inbox: "", threads: "", decisions: "", openQuestions: "" },
  knowledge:     { root: "", people: "", organizations: "", projects: "" },
  opinions:      "",
  log:           { root: "", sessions: "", decisionsMade: "" },
  templates:     { root: "", thread: "", decision: "", concept: "", projectBrief: "", person: "", opinion: "", domain: "" },
};

// ── File path ─────────────────────────────────────────────────────────────────

export function configFilePath(): string {
  // Always co-located with the running bundle — no env override
  return join(dirname(Bun.main), "brain.json");
}

// ── Load ──────────────────────────────────────────────────────────────────────

export function loadConfig(): BrainConfig | null {
  const path = configFilePath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (typeof parsed?.root === "string") return parsed as BrainConfig;
  } catch {
    // Corrupted file — return null so discovery runs
  }
  return null;
}

// ── Save ──────────────────────────────────────────────────────────────────────

export function saveConfig(config: BrainConfig): string {
  const path = configFilePath();
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
  return path;
}

// ── Auto-discovery ────────────────────────────────────────────────────────────
// Walk the "Trilium Brain" root node by title to reconstruct the config.
// Called when brain.json doesn't exist yet (e.g. after a fresh install that
// used init.ts in an older version, or when the bundle is moved).

export async function discoverBrain(trilium: TriliumClient): Promise<BrainConfig | null> {
  let rootId: string | null = null;
  try {
    const res = await trilium.searchNotes('note.title = "Trilium Brain" #iconClass', { limit: 5 });
    const match = res.results.find((n) => n.title === "Trilium Brain");
    if (match) rootId = match.noteId;
  } catch {
    return null;
  }
  if (!rootId) return null;

  const config: BrainConfig = { ...EMPTY_BRAIN, root: rootId };

  try {
    const root = await trilium.getNote(rootId);

    for (const cid of root.childNoteIds) {
      const child = await trilium.getNote(cid).catch(() => null);
      if (!child) continue;

      // Build grandchild title → ID map
      const gc: Record<string, string> = {};
      for (const gcid of child.childNoteIds) {
        const n = await trilium.getNote(gcid).catch(() => null);
        if (n) gc[n.title] = n.noteId;
      }

      const id = child.noteId;
      const g = (t: string) => gc[t] ?? "";

      switch (child.title) {
        case "Identity":
          config.identity = { root: id, profile: g("Profile"), preferences: g("Preferences"), context: g("Context") };
          break;
        case "Working Memory":
          config.workingMemory = { root: id, inbox: g("Inbox"), threads: g("Threads"), decisions: g("Decisions"), openQuestions: g("Open Questions") };
          break;
        case "Knowledge":
          config.knowledge = { root: id, people: g("People"), organizations: g("Organizations"), projects: g("Projects") };
          break;
        case "Opinions":
          config.opinions = id;
          break;
        case "Log":
          config.log = { root: id, sessions: g("Sessions"), decisionsMade: g("Decisions Made") };
          break;
        case "Templates":
          config.templates = { root: id, thread: g("Thread"), decision: g("Decision"), concept: g("Concept"), projectBrief: g("Project Brief"), person: g("Person"), opinion: g("Opinion"), domain: g("Domain") };
          break;
      }
    }
  } catch {
    return null;
  }

  // Validate that required structural IDs are populated
  const requiredIds = [
    config.identity.root, config.workingMemory.root, config.knowledge.root,
    config.log.root, config.templates.root,
  ];
  if (requiredIds.some((id) => !id)) return null;

  return config;
}

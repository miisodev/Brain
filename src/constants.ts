// ─────────────────────────────────────────────────────────────────────────────
// Trilium Brain — structural note IDs
//
// Run `bun run init` on a fresh instance to generate these IDs, then paste
// the output here and run `bun run build` to rebuild the server.
//
// Nodes marked "" are new additions — run bootstrap_brain to create them.
// ─────────────────────────────────────────────────────────────────────────────

export const Brain = {
  root: "7lwsFLeDEFNy",

  identity: {
    root: "6KWw8MmwS356",
    profile: "",       // Core facts about the user / system
    preferences: "",   // Behavioral, stylistic, technical preferences
    context: "",       // Current life / work situation (updated regularly)
  },

  workingMemory: {
    root: "RO4UtYm8802k",
    inbox: "",               // Raw unprocessed captures (GTD drop zone)
    threads: "VLUE2DiGVVkX", // Active reasoning chains
    decisions: "HyN4NpBRUhVl",
    openQuestions: "tkJaIc0ZvXY4",
  },

  knowledge: {
    root: "w9lPh53pDpqr",
    people: "",        // One note per person
    organizations: "", // One note per organisation
    projects: "",      // One note per project (with subtree)
  },

  // Opinions stay flat — blog / diary entries, no subtrees
  opinions: "qLJItiCeW41p",

  log: {
    root: "ckp5gZYtkNFL",
    sessions: "",       // Per-session summaries (YYYY-MM-DD--title)
    decisionsMade: "",  // Promoted from workingMemory.decisions
  },

  templates: {
    root: "",
    thread: "",
    decision: "",
    concept: "",
    projectBrief: "",
    person: "",
    opinion: "",
  },
} as const;

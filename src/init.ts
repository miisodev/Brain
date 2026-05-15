/**
 * init.ts — One-shot CLI bootstrapper for a fresh Trilium Brain instance.
 * Run with: bun run init  (or: TRILIUM_BASE_URL=... TRILIUM_ETAPI_TOKEN=... bun run src/init.ts)
 *
 * Creates the full brain hierarchy in Trilium and writes brain.json next to
 * the bundle. No manual ID copying or rebuild required.
 */

import { TriliumClient } from "./trilium.js";
import { saveConfig, configFilePath } from "./config.js";
import {
  threadContent,
  decisionContent,
  conceptContent,
  personContent,
  projectContent,
  opinionContent,
} from "./templates.js";

const baseUrl = process.env.TRILIUM_BASE_URL;
const token   = process.env.TRILIUM_ETAPI_TOKEN;

if (!baseUrl || !token) {
  console.error("Missing TRILIUM_BASE_URL or TRILIUM_ETAPI_TOKEN");
  process.exit(1);
}

const trilium = new TriliumClient(baseUrl, token);
const created: Record<string, string> = {};
const today = new Date().toISOString().slice(0, 10);

function log(path: string, noteId: string) {
  created[path] = noteId;
  console.log(`  ${noteId}  ${path}`);
}

console.log("\n🧠 Bootstrapping Trilium Brain...\n");

// ── Root ──────────────────────────────────────────────────────────────────────

const rootNote = await trilium.createNote("root", "Trilium Brain", "");
log("root", rootNote.note.noteId);
await trilium.addLabel(rootNote.note.noteId, "iconClass", "bx bx-brain");
const rootId = rootNote.note.noteId;

// ── Identity ──────────────────────────────────────────────────────────────────

console.log("\n  👤 Identity");
const identity = await trilium.createNote(rootId, "Identity",
  "<p><em>Who I am — persistent facts, preferences, and current context.</em></p>");
log("identity.root", identity.note.noteId);

const [profile, preferences, context] = await Promise.all([
  trilium.createNote(identity.note.noteId, "Profile", ""),
  trilium.createNote(identity.note.noteId, "Preferences", ""),
  trilium.createNote(identity.note.noteId, "Context", ""),
]);
log("identity.profile",     profile.note.noteId);
log("identity.preferences", preferences.note.noteId);
log("identity.context",     context.note.noteId);

// ── Working Memory ────────────────────────────────────────────────────────────

console.log("\n  🔄 Working Memory");
const wm = await trilium.createNote(rootId, "Working Memory",
  "<p><em>Ephemeral — threads resolve, decisions promote, inbox gets triaged.</em></p>");
log("workingMemory.root", wm.note.noteId);

const [inbox, threads, decisions, openQ] = await Promise.all([
  trilium.createNote(wm.note.noteId, "Inbox", ""),
  trilium.createNote(wm.note.noteId, "Threads", ""),
  trilium.createNote(wm.note.noteId, "Decisions", ""),
  trilium.createNote(wm.note.noteId, "Open Questions", ""),
]);
log("workingMemory.inbox",         inbox.note.noteId);
log("workingMemory.threads",       threads.note.noteId);
log("workingMemory.decisions",     decisions.note.noteId);
log("workingMemory.openQuestions", openQ.note.noteId);

// ── Knowledge ─────────────────────────────────────────────────────────────────

console.log("\n  📚 Knowledge");
const knowledge = await trilium.createNote(rootId, "Knowledge",
  "<p><em>Durable — atomic, evergreen engrams organized by domain.</em></p>");
log("knowledge.root", knowledge.note.noteId);

const [people, orgs, projects] = await Promise.all([
  trilium.createNote(knowledge.note.noteId, "People", ""),
  trilium.createNote(knowledge.note.noteId, "Organizations", ""),
  trilium.createNote(knowledge.note.noteId, "Projects", ""),
]);
log("knowledge.people",        people.note.noteId);
log("knowledge.organizations", orgs.note.noteId);
log("knowledge.projects",      projects.note.noteId);

// ── Opinions ─────────────────────────────────────────────────────────────────

console.log("\n  💭 Opinions");
const opinions = await trilium.createNote(rootId, "Opinions",
  "<p><em>Blog/diary entries — prose, arguments, stances. No subtrees.</em></p>");
log("opinions", opinions.note.noteId);

// ── Log ───────────────────────────────────────────────────────────────────────

console.log("\n  📅 Log");
const logNote = await trilium.createNote(rootId, "Log",
  "<p><em>Temporal records — sessions and promoted decisions.</em></p>");
log("log.root", logNote.note.noteId);

const [sessions, decisionsMade] = await Promise.all([
  trilium.createNote(logNote.note.noteId, "Sessions", ""),
  trilium.createNote(logNote.note.noteId, "Decisions Made", ""),
]);
log("log.sessions",      sessions.note.noteId);
log("log.decisionsMade", decisionsMade.note.noteId);

// ── Templates ────────────────────────────────────────────────────────────────

console.log("\n  🗂️ Templates");
const templates = await trilium.createNote(rootId, "Templates",
  "<p><em>Structural templates — used by spawn_* tools.</em></p>");
log("templates.root", templates.note.noteId);

const [tThread, tDecision, tConcept, tProject, tPerson, tOpinion] = await Promise.all([
  trilium.createNote(templates.note.noteId, "Thread",        threadContent("", today)),
  trilium.createNote(templates.note.noteId, "Decision",      decisionContent("")),
  trilium.createNote(templates.note.noteId, "Concept",       conceptContent("general")),
  trilium.createNote(templates.note.noteId, "Project Brief", projectContent("", today)),
  trilium.createNote(templates.note.noteId, "Person",        personContent("", "")),
  trilium.createNote(templates.note.noteId, "Opinion",       opinionContent(today, "contemplative")),
]);
log("templates.thread",       tThread.note.noteId);
log("templates.decision",     tDecision.note.noteId);
log("templates.concept",      tConcept.note.noteId);
log("templates.projectBrief", tProject.note.noteId);
log("templates.person",       tPerson.note.noteId);
log("templates.opinion",      tOpinion.note.noteId);

// ── Write brain.json ──────────────────────────────────────────────────────────

const config = {
  root: created["root"],
  identity: {
    root:        created["identity.root"],
    profile:     created["identity.profile"],
    preferences: created["identity.preferences"],
    context:     created["identity.context"],
  },
  workingMemory: {
    root:          created["workingMemory.root"],
    inbox:         created["workingMemory.inbox"],
    threads:       created["workingMemory.threads"],
    decisions:     created["workingMemory.decisions"],
    openQuestions: created["workingMemory.openQuestions"],
  },
  knowledge: {
    root:          created["knowledge.root"],
    people:        created["knowledge.people"],
    organizations: created["knowledge.organizations"],
    projects:      created["knowledge.projects"],
  },
  opinions: created["opinions"],
  log: {
    root:          created["log.root"],
    sessions:      created["log.sessions"],
    decisionsMade: created["log.decisionsMade"],
  },
  templates: {
    root:         created["templates.root"],
    thread:       created["templates.thread"],
    decision:     created["templates.decision"],
    concept:      created["templates.concept"],
    projectBrief: created["templates.projectBrief"],
    person:       created["templates.person"],
    opinion:      created["templates.opinion"],
  },
};

const savedPath = saveConfig(config);

// ── Output ────────────────────────────────────────────────────────────────────

console.log("\n✅ Done.");
console.log(`\nConfig written to: ${savedPath}`);
console.log("Start the MCP server — no rebuild or manual ID pasting required.\n");

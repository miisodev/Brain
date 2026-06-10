// ─────────────────────────────────────────────────────────────────────────────
// Trilium Brain — structure builder
// Shared by the bootstrap_brain tool and the init.ts CLI.
// ─────────────────────────────────────────────────────────────────────────────

import { TriliumClient } from "./trilium.js";
import type { BrainConfig } from "./config.js";
import { DEFAULT_POLICY, type AnyKind } from "./types.js";
import { contentFor, sectionDescription } from "./templates.js";

export async function createBrainStructure(trilium: TriliumClient): Promise<BrainConfig> {
  const d = new Date().toISOString().slice(0, 10);

  const root = await trilium.createNote("root", "Trilium Brain", "");
  await trilium.addLabel(root.note.noteId, "iconClass", "bx bx-brain");
  const rootId = root.note.noteId;

  const mk = (parent: string, title: string, content = "") => trilium.createNote(parent, title, content);

  const identity = await mk(rootId, "Identity", sectionDescription("Who the user is — facts, preferences, current context."));
  const [profile, preferences, context] = await Promise.all([
    mk(identity.note.noteId, "Profile"),
    mk(identity.note.noteId, "Preferences"),
    mk(identity.note.noteId, "Context"),
  ]);

  const wm = await mk(rootId, "Working Memory", sectionDescription("Ephemeral — items resolve or degrade gracefully; nothing rots here."));
  const [inbox, threads, decisions, openQ] = await Promise.all([
    mk(wm.note.noteId, "Inbox"),
    mk(wm.note.noteId, "Threads"),
    mk(wm.note.noteId, "Decisions"),
    mk(wm.note.noteId, "Open Questions"),
  ]);

  const knowledge = await mk(rootId, "Knowledge", sectionDescription("Durable — people, organizations, projects, and domain folders created on demand."));
  const [people, orgs, projects] = await Promise.all([
    mk(knowledge.note.noteId, "People"),
    mk(knowledge.note.noteId, "Organizations"),
    mk(knowledge.note.noteId, "Projects"),
  ]);

  const opinions = await mk(rootId, "Opinions", sectionDescription("Dated stances with reasoning — flat, never nested."));

  const log = await mk(rootId, "Log", sectionDescription("Temporal record — sessions and decisions made."));
  const [sessions, decisionsMade] = await Promise.all([
    mk(log.note.noteId, "Sessions"),
    mk(log.note.noteId, "Decisions Made"),
  ]);

  const templates = await mk(rootId, "Templates", sectionDescription("Structural templates wired automatically — not for direct editing."));
  const tpl = (kind: AnyKind, title: string) =>
    mk(templates.note.noteId, title, contentFor(kind, { date: d, body: "" }));
  const [tThread, tDecision, tConcept, tProject, tPerson, tOpinion, tDomain, tQuestion, tReference, tOrganization] = await Promise.all([
    tpl("thread", "Thread"),
    tpl("decision", "Decision"),
    tpl("concept", "Concept"),
    tpl("project", "Project Brief"),
    tpl("person", "Person"),
    tpl("opinion", "Opinion"),
    mk(templates.note.noteId, "Domain", contentFor("domain", { date: d, body: "", domain: "Domain" })),
    tpl("question", "Question"),
    tpl("reference", "Reference"),
    tpl("organization", "Organization"),
  ]);

  return {
    version: 4,
    root: rootId,
    identity: {
      root: identity.note.noteId,
      profile: profile.note.noteId,
      preferences: preferences.note.noteId,
      context: context.note.noteId,
    },
    workingMemory: {
      root: wm.note.noteId,
      inbox: inbox.note.noteId,
      threads: threads.note.noteId,
      decisions: decisions.note.noteId,
      openQuestions: openQ.note.noteId,
    },
    knowledge: {
      root: knowledge.note.noteId,
      people: people.note.noteId,
      organizations: orgs.note.noteId,
      projects: projects.note.noteId,
    },
    opinions: opinions.note.noteId,
    log: {
      root: log.note.noteId,
      sessions: sessions.note.noteId,
      decisionsMade: decisionsMade.note.noteId,
    },
    templates: {
      root: templates.note.noteId,
      thread: tThread.note.noteId,
      decision: tDecision.note.noteId,
      concept: tConcept.note.noteId,
      projectBrief: tProject.note.noteId,
      person: tPerson.note.noteId,
      opinion: tOpinion.note.noteId,
      domain: tDomain.note.noteId,
      question: tQuestion.note.noteId,
      reference: tReference.note.noteId,
      organization: tOrganization.note.noteId,
    },
    policy: { ...DEFAULT_POLICY },
  };
}

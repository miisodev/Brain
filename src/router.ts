// ─────────────────────────────────────────────────────────────────────────────
// Trilium Brain — the router
//
// Single source of truth for WHERE a note lives, WHICH labels it carries and
// WHICH template it follows, derived from its kind. The model never chooses a
// parent note — placement is policy, and policy lives here.
// ─────────────────────────────────────────────────────────────────────────────

import type { BrainConfig } from "./config.js";
import type { TriliumClient } from "./trilium.js";
import {
  EphemeralKinds,
  type AnyKind,
  type IdentityFacet,
  type Status,
} from "./types.js";
import { slugify, titleCaseSlug } from "./normalize.js";
import { domainContent } from "./templates.js";

// ── Options accepted by remember() and threaded through routing ──────────────

export interface RememberOpts {
  facet?: IdentityFacet;   // identity: profile / preference / context
  domain?: string;         // concept / reference: knowledge domain
  project?: string;        // tag any note to a project (label + relation)
  topics?: string[];       // free topics — slugged server-side
  mood?: string;           // opinion tone
  role?: string;           // person: role / title
  org?: string;            // person: organization (auto-created + wired)
  goal?: string;           // project: one-line goal
  status?: Status;         // override initial status (rarely needed)
  date?: string;           // ISO date override (default: today)
}

export interface LabelPlan {
  name: string;
  value: string;
  inheritable?: boolean;
}

// ── Static placement ──────────────────────────────────────────────────────────

/** Container for a kind. Returns "" for concept/reference — those resolve
 *  through a knowledge domain (see resolveParent). */
export function kindHome(cfg: BrainConfig, kind: AnyKind, facet?: IdentityFacet): string {
  switch (kind) {
    case "identity": {
      const f: IdentityFacet = facet ?? "context";
      return f === "profile" ? cfg.identity.profile
        : f === "preference" ? cfg.identity.preferences
        : cfg.identity.context;
    }
    case "person":       return cfg.knowledge.people;
    case "organization": return cfg.knowledge.organizations;
    case "project":      return cfg.knowledge.projects;
    case "concept":
    case "reference":    return ""; // domain-resolved
    case "opinion":      return cfg.opinions;
    case "question":     return cfg.workingMemory.openQuestions;
    case "decision":     return cfg.workingMemory.decisions;
    case "thread":       return cfg.workingMemory.threads;
    case "capture":      return cfg.workingMemory.inbox;
    case "session":      return cfg.log.sessions;
    case "domain":       return cfg.knowledge.root;
  }
}

/** Scope to search when deduplicating a kind (and when recalling by kind). */
export function dedupScope(cfg: BrainConfig, kind: AnyKind): string {
  switch (kind) {
    case "identity":     return cfg.identity.root;
    case "opinion":      return cfg.opinions;
    case "question":
    case "decision":
    case "thread":
    case "capture":      return cfg.workingMemory.root;
    case "session":      return cfg.log.root;
    default:             return cfg.knowledge.root;
  }
}

/** Template note wired via ~template (cosmetic in Trilium UI). */
export function templateIdFor(cfg: BrainConfig, kind: AnyKind): string | undefined {
  const t = cfg.templates;
  const id = (() => {
    switch (kind) {
      case "thread":       return t.thread;
      case "decision":     return t.decision;
      case "concept":      return t.concept;
      case "project":      return t.projectBrief;
      case "person":       return t.person;
      case "opinion":      return t.opinion;
      case "domain":       return t.domain;
      case "question":     return t.question;
      case "reference":    return t.reference;
      case "organization": return t.organization;
      default:             return undefined;
    }
  })();
  return id || undefined;
}

// ── Label plan ────────────────────────────────────────────────────────────────

export function labelPlan(kind: AnyKind, title: string, opts: RememberOpts, date: string): LabelPlan[] {
  const labels: LabelPlan[] = [
    { name: "noteType", value: kind },
    { name: "created", value: opts.date ?? date },
  ];

  if (EphemeralKinds.includes(kind as never) || kind === "project") {
    labels.push({ name: "status", value: opts.status ?? "active" });
  }
  if (kind === "identity") {
    labels.push({ name: "facet", value: opts.facet ?? "context" });
  }
  if ((kind === "concept" || kind === "reference") && opts.domain) {
    labels.push({ name: "domain", value: slugify(opts.domain) });
  }
  if (kind === "opinion" && opts.mood) {
    labels.push({ name: "mood", value: slugify(opts.mood) });
  }
  if (kind === "project") {
    labels.push({ name: "project", value: slugify(title) });
  } else if (opts.project) {
    labels.push({ name: "project", value: slugify(opts.project) });
  }
  for (const topic of opts.topics ?? []) {
    const slug = slugify(topic);
    if (slug) labels.push({ name: "topic", value: slug });
  }

  // Dedupe by name+value (topics may repeat after slugging)
  const seen = new Set<string>();
  return labels.filter((l) => {
    const key = `${l.name}=${l.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Parent resolution (async — domains auto-create on demand) ────────────────

export interface ResolvedParent {
  parentId: string;
  /** Display title of the domain folder, when domain-routed. */
  domainTitle?: string;
  /** True if the domain folder was created by this call. */
  createdDomain?: boolean;
}

export async function resolveParent(
  trilium: TriliumClient,
  cfg: BrainConfig,
  kind: AnyKind,
  opts: RememberOpts
): Promise<ResolvedParent> {
  if (kind !== "concept" && kind !== "reference") {
    const parentId = kindHome(cfg, kind, opts.facet);
    if (!parentId) throw new Error(`Brain config incomplete for kind "${kind}" — run bootstrap_brain`);
    return { parentId };
  }

  const slug = slugify(opts.domain ?? "general") || "general";
  const display = titleCaseSlug(slug);

  const existing = await trilium.searchNotes(`#noteType=domain #domain=${slug}`, {
    ancestorNoteId: cfg.knowledge.root,
    fastSearch: true,
    limit: 1,
  });
  if (existing.results[0]) {
    return { parentId: existing.results[0].noteId, domainTitle: existing.results[0].title };
  }

  // First use of this domain — create a flat folder (no Concepts/References/
  // Notes triad; leaf notes carry their kind in #noteType).
  const created = await trilium.createNote(cfg.knowledge.root, display, domainContent(display));
  const did = created.note.noteId;
  await Promise.all([
    trilium.addLabel(did, "noteType", "domain"),
    trilium.addLabel(did, "domain", slug),
    trilium.addLabel(did, "iconClass", "bx bx-folder"),
  ]);
  return { parentId: did, domainTitle: display, createdDomain: true };
}

/** Human-readable location for tool receipts, e.g. "Knowledge → Technology". */
export function locationLabel(kind: AnyKind, opts: RememberOpts, domainTitle?: string): string {
  switch (kind) {
    case "identity": {
      const f = opts.facet ?? "context";
      return `Identity → ${f === "profile" ? "Profile" : f === "preference" ? "Preferences" : "Context"}`;
    }
    case "person":       return "Knowledge → People";
    case "organization": return "Knowledge → Organizations";
    case "project":      return "Knowledge → Projects";
    case "concept":
    case "reference":    return `Knowledge → ${domainTitle ?? "General"}`;
    case "opinion":      return "Opinions";
    case "question":     return "Working Memory → Open Questions";
    case "decision":     return "Working Memory → Decisions";
    case "thread":       return "Working Memory → Threads";
    case "capture":      return "Working Memory → Inbox";
    case "session":      return "Log → Sessions";
    case "domain":       return "Knowledge";
  }
}

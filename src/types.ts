// ─────────────────────────────────────────────────────────────────────────────
// Trilium Brain — shared domain types
//
// The enums in this file are the single canonical vocabulary. Tool schemas,
// the router, the lifecycle sweep, and the migration mapping all derive from
// these constants — there is no second copy anywhere.
// ─────────────────────────────────────────────────────────────────────────────

export type NoteType =
  | "text" | "code" | "book" | "canvas"
  | "mermaid" | "relationMap" | "render"
  | "search" | "file" | "image" | "launcher";

// ── Kinds ─────────────────────────────────────────────────────────────────────
// Every model-created note has exactly one kind, stored in #noteType.

export const Kinds = [
  "identity",     // fact about the user (facet: profile / preference / context)
  "person",       // someone the user knows or works with
  "organization", // company, team, community
  "project",      // a venture with a goal — single brief note, no subfolders
  "concept",      // atomic evergreen definition, lives in a domain
  "reference",    // durable reference material / how-to / source, lives in a domain
  "opinion",      // dated stance with reasoning — diary-style, flat
  "question",     // open question awaiting an answer
  "decision",     // decision record (ADR-style)
  "thread",       // multi-session line of work / investigation
  "capture",      // quick unprocessed capture (inbox)
] as const;

export type Kind = (typeof Kinds)[number];

// Internal kinds the server writes but the model never passes to remember().
export type InternalKind = "session" | "domain";
export type AnyKind = Kind | InternalKind;

// Kinds that participate in the lifecycle state machine (they open, then
// resolve or degrade). Everything else is durable until superseded.
export const EphemeralKinds: readonly Kind[] = ["question", "decision", "thread", "capture"];

export const IdentityFacets = ["profile", "preference", "context"] as const;
export type IdentityFacet = (typeof IdentityFacets)[number];

// ── Status ────────────────────────────────────────────────────────────────────
// One machine for every kind:  active → resolved | superseded | dormant
// #archived is an orthogonal flag (Trilium-native hiding) set on terminal
// states and on dormant items that aged out. Degradation demotes, never deletes.

export const Statuses = ["active", "resolved", "superseded", "dormant"] as const;
export type Status = (typeof Statuses)[number];

// Legacy → canonical status mapping, applied by the maintenance sweep.
export const LEGACY_STATUS_MAP: Record<string, Status> = {
  active: "active",
  pending: "active",
  parked: "dormant",
  open: "active",
  resolved: "resolved",
  decided: "resolved",
  done: "resolved",
  closed: "resolved",
  answered: "resolved",
  consolidated: "resolved",
  triaged: "resolved",
  superseded: "superseded",
  dormant: "dormant",
  stale: "dormant",
};

// Legacy → canonical kind mapping (#noteType values written by v3 tools).
export const LEGACY_KIND_MAP: Record<string, AnyKind> = {
  identity: "identity",
  person: "person",
  organisation: "organization",
  organization: "organization",
  project: "project",
  concept: "concept",
  knowledge: "reference",
  reference: "reference",
  opinion: "opinion",
  opinions: "opinion",
  question: "question",
  decision: "decision",
  thread: "thread",
  workingMemory: "capture",
  capture: "capture",
  inbox: "capture",
  session: "session",
  domain: "domain",
};

// Legacy date-label zoo → the two canonical write-time date labels.
// #created  = when the note entered the brain (or the date it represents)
// #closed   = when it reached a terminal state
// #updated  = last substantive revision (maintained by revise)
export const LEGACY_DATE_MAP: Record<string, "created" | "closed" | "updated"> = {
  dateOpened: "created",
  dateStarted: "created",
  dateWritten: "created",
  dateStored: "created",
  sessionDate: "created",
  dateClosed: "closed",
  dateConsolidated: "closed",
  dateUpdated: "updated",
};

// ── Relations ─────────────────────────────────────────────────────────────────
// Closed vocabulary — connect() rejects anything else.

export const RelationTypes = [
  "relatesTo",   // generic association — last resort
  "extends",     // builds upon / elaborates
  "contradicts", // conflicts with
  "supports",    // provides evidence or justification for
  "causes",      // produces / leads to
  "references",  // cites as source
  "partOf",      // semantically belongs to (e.g. decision → project)
  "worksWith",   // collaboration — symmetric, auto-bidirectional
  "mentors",     // teaches / shapes
  "instanceOf",  // concrete example of
  "supersedes",  // replaces entirely
  "implements",  // concrete realisation of
  "inspiredBy",  // conceptually influenced by
  "sourceOf",    // origin / provenance of
  "derivedFrom", // synthesised from (wired by resolve --promote)
] as const;

export type RelationType = (typeof RelationTypes)[number];

export const SymmetricRelations: readonly RelationType[] = ["worksWith"];

// Kept for compatibility with trilium.ts backlink discovery.
export const SynapseTypes = RelationTypes;
export type SynapseType = RelationType;

// ── Lifecycle policy ─────────────────────────────────────────────────────────

export interface LifecyclePolicy {
  /** Active ephemeral note untouched this many days → dormant (review queue). */
  dormantAfterDays: number;
  /** Dormant this many further days → archived in place. */
  archiveDormantAfterDays: number;
  /** Inbox captures older than this are archived into the sweep report. */
  inboxGraceDays: number;
}

export const DEFAULT_POLICY: LifecyclePolicy = {
  dormantAfterDays: 21,
  archiveDormantAfterDays: 45,
  inboxGraceDays: 7,
};

// ── Compact output shapes reused across tools ────────────────────────────────

export interface NoteStub {
  id: string;
  title: string;
  type?: string;
}

export interface AttrStub {
  id: string;
  noteId: string;
  type: string;
  name: string;
  value: string;
}

export interface BranchStub {
  id: string;
  noteId: string;
  parentNoteId: string;
}

export interface RevisionStub {
  id: string;
  noteId: string;
  title: string;
  date: string;
  size: number;
}

export interface AttachmentStub {
  id: string;
  title: string;
  mime: string;
  size: number;
}

export interface BacklinkEntry {
  noteId: string;
  title: string;
  relationName: string;
}

export interface GraphNode {
  noteId: string;
  title: string;
  depth: number;
  via?: string;        // relation name that led here
  fromNoteId?: string; // which node expanded to reach this
}

export interface SynapseSuggestion {
  noteId: string;
  title: string;
  sharedLabels: string[];
}

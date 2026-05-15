// ─────────────────────────────────────────────────────────────────────────────
// Trilium Brain — shared domain types
// ─────────────────────────────────────────────────────────────────────────────

export type NoteType =
  | "text" | "code" | "book" | "canvas"
  | "mermaid" | "relationMap" | "render"
  | "search" | "file" | "image";

// Semantic synapse (relation) vocabulary — the brain's axon labels
export const SynapseTypes = [
  "relatesTo",   // general association
  "extends",     // is a subtype / builds upon
  "contradicts", // conflicts with
  "supports",    // provides evidence for
  "causes",      // leads to / prerequisite
  "references",  // cites or links externally
  "partOf",      // component of a larger whole
  "worksWith",   // collaborative (people)
  "mentors",     // knowledge transfer (people)
  "instanceOf",  // is a concrete example of
  "supersedes",  // replaces / is newer version
  "implements",  // concrete realization of
  "inspiredBy",  // derived from / influenced by
  "sourceOf",    // originated / produced
] as const;

export type SynapseType = (typeof SynapseTypes)[number];

export type BrainSection =
  | "identity"
  | "workingMemory"
  | "knowledge"
  | "opinions"
  | "log";

export type EngramType =
  | "thread"
  | "decision"
  | "concept"
  | "person"
  | "organization"
  | "project"
  | "opinion"
  | "session"
  | "domain";

export type EngramStatus =
  | "active"
  | "parked"
  | "resolved"
  | "archived"
  | "pending"
  | "decided"
  | "superseded";

// Compact output shapes reused across tools
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

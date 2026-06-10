// ─────────────────────────────────────────────────────────────────────────────
// Trilium Brain — lifecycle engine
//
// Two responsibilities:
//   1. The maintenance sweep — deterministic hygiene + graceful degradation.
//      The same code path migrates v3 data and keeps a v4 brain converged:
//      title suffixes → status labels, legacy vocabularies → canonical enums,
//      duplicate labels → deduped, stale actives → dormant → archived.
//      Degradation demotes; it never deletes content.
//   2. Session digests — the orientation payload start_session returns.
//
// Planner functions are pure (attribute lists in, actions out) so the policy
// is unit-testable without a Trilium instance.
// ─────────────────────────────────────────────────────────────────────────────

import type { TriliumClient, Note, Attribute } from "./trilium.js";
import type { BrainConfig } from "./config.js";
import {
  LEGACY_KIND_MAP,
  LEGACY_STATUS_MAP,
  LEGACY_DATE_MAP,
  EphemeralKinds,
  type AnyKind,
  type LifecyclePolicy,
} from "./types.js";
import { normalizeTitle, toText } from "./normalize.js";
import { RESOLUTION_ANCHOR } from "./templates.js";

// ── Action model (pure planner output) ────────────────────────────────────────

export type CanonAction =
  | { op: "patchTitle"; title: string }
  | { op: "addLabel"; name: string; value: string }
  | { op: "setLabel"; name: string; value: string }      // update-or-add, deduping
  | { op: "deleteAttr"; attributeId: string; why: string };

export interface CanonPlan {
  noteId: string;
  actions: CanonAction[];
  notes: string[]; // human-readable description of each fix
}

const CANONICAL_LABELS = new Set([
  "noteType", "status", "created", "updated", "closed",
  "topic", "domain", "project", "facet", "mood", "iconClass", "archived", "goal",
]);

/** Infer the kind of an unlabeled note from the container it sits in. */
export function containerKind(cfg: BrainConfig, parentId: string): AnyKind | undefined {
  if (parentId === cfg.workingMemory.openQuestions) return "question";
  if (parentId === cfg.workingMemory.threads) return "thread";
  if (parentId === cfg.workingMemory.decisions) return "decision";
  if (parentId === cfg.workingMemory.inbox) return "capture";
  if (parentId === cfg.log.sessions) return "session";
  if (parentId === cfg.opinions) return "opinion";
  if (parentId === cfg.knowledge.people) return "person";
  if (parentId === cfg.knowledge.organizations) return "organization";
  if (parentId === cfg.knowledge.projects) return "project";
  if (parentId === cfg.identity.profile || parentId === cfg.identity.preferences ||
      parentId === cfg.identity.context || parentId === cfg.identity.root) return "identity";
  return undefined;
}

/** Structural notes the sweep must never relabel or retitle. */
export function isStructural(cfg: BrainConfig, noteId: string): boolean {
  const t = cfg.templates;
  return [
    cfg.root,
    cfg.identity.root, cfg.identity.profile, cfg.identity.preferences, cfg.identity.context,
    cfg.workingMemory.root, cfg.workingMemory.inbox, cfg.workingMemory.threads,
    cfg.workingMemory.decisions, cfg.workingMemory.openQuestions,
    cfg.knowledge.root, cfg.knowledge.people, cfg.knowledge.organizations, cfg.knowledge.projects,
    cfg.opinions, cfg.log.root, cfg.log.sessions, cfg.log.decisionsMade,
    t.root, t.thread, t.decision, t.concept, t.projectBrief, t.person, t.opinion, t.domain,
    t.question ?? "", t.reference ?? "", t.organization ?? "",
  ].includes(noteId);
}

/**
 * Pure canonicalization planner for one note.
 * Looks at title + attributes and emits the actions that bring the note to
 * the canonical vocabulary. `inferredKind` is used when #noteType is missing
 * (derived from the container by the caller).
 */
export function planCanon(
  note: Pick<Note, "noteId" | "title" | "attributes" | "dateCreated">,
  inferredKind?: AnyKind
): CanonPlan {
  const actions: CanonAction[] = [];
  const notes: string[] = [];
  const labels = note.attributes.filter((a) => a.type === "label");

  const byName = new Map<string, Attribute[]>();
  for (const l of labels) {
    const arr = byName.get(l.name) ?? [];
    arr.push(l);
    byName.set(l.name, arr);
  }
  const valueOf = (name: string) => byName.get(name)?.[0]?.value;

  // 1 — title hygiene (entities, whitespace, status suffixes)
  const { title: cleanTitle, impliedStatus } = normalizeTitle(note.title);
  if (cleanTitle && cleanTitle !== note.title) {
    actions.push({ op: "patchTitle", title: cleanTitle });
    notes.push(`title: "${note.title}" → "${cleanTitle}"`);
  }

  // 2 — duplicate labels: keep the first of each name (multi-value #topic is
  //     legitimate; dedupe only exact name+value repeats plus single-value names)
  const SINGLE_VALUE = new Set(["noteType", "status", "created", "updated", "closed", "facet", "mood", "domain", "project"]);
  const seenSingle = new Set<string>();
  const seenPair = new Set<string>();
  for (const l of labels) {
    if (l.name.startsWith("sw_")) continue;
    const pairKey = `${l.name}=${l.value}`;
    if (SINGLE_VALUE.has(l.name)) {
      if (seenSingle.has(l.name)) {
        actions.push({ op: "deleteAttr", attributeId: l.attributeId, why: `duplicate #${l.name}` });
        notes.push(`deduped #${l.name}`);
        continue;
      }
      seenSingle.add(l.name);
    } else if (seenPair.has(pairKey)) {
      actions.push({ op: "deleteAttr", attributeId: l.attributeId, why: `duplicate #${pairKey}` });
      notes.push(`deduped #${pairKey}`);
      continue;
    }
    seenPair.add(pairKey);
  }

  // 3 — kind canonicalization (or inference from container)
  const rawKind = valueOf("noteType");
  let kind: AnyKind | undefined;
  if (rawKind) {
    kind = LEGACY_KIND_MAP[rawKind];
    if (kind && kind !== rawKind) {
      actions.push({ op: "setLabel", name: "noteType", value: kind });
      notes.push(`kind: ${rawKind} → ${kind}`);
    } else if (!kind) {
      notes.push(`unknown kind "${rawKind}" left as-is`);
      kind = undefined;
    }
  } else if (inferredKind) {
    kind = inferredKind;
    actions.push({ op: "addLabel", name: "noteType", value: inferredKind });
    notes.push(`labeled as ${inferredKind} (from container)`);
  }

  // 4 — status canonicalization / inference
  const rawStatus = valueOf("status");
  if (rawStatus) {
    const canon = LEGACY_STATUS_MAP[rawStatus.toLowerCase()];
    if (canon && canon !== rawStatus) {
      actions.push({ op: "setLabel", name: "status", value: canon });
      notes.push(`status: ${rawStatus} → ${canon}`);
    }
  } else if (impliedStatus) {
    actions.push({ op: "setLabel", name: "status", value: impliedStatus });
    notes.push(`status ${impliedStatus} (from title suffix)`);
  } else if (kind && EphemeralKinds.includes(kind as never)) {
    actions.push({ op: "setLabel", name: "status", value: "active" });
    notes.push("status active (default for ephemeral kind)");
  }

  // Resolved-via-suffix notes should be archived in place.
  const hasArchived = byName.has("archived");
  const effectiveStatus = impliedStatus ?? (rawStatus ? LEGACY_STATUS_MAP[rawStatus.toLowerCase()] : undefined);
  if ((effectiveStatus === "resolved" || effectiveStatus === "superseded") && !hasArchived) {
    actions.push({ op: "addLabel", name: "archived", value: "" });
    notes.push("archived in place (terminal status)");
  }

  // 5 — date-label migration (dateOpened/dateStored/sessionDate/… → created/closed/updated)
  for (const [legacy, canonical] of Object.entries(LEGACY_DATE_MAP)) {
    const legacyAttrs = byName.get(legacy);
    if (!legacyAttrs?.length) continue;
    if (!byName.has(canonical)) {
      actions.push({ op: "addLabel", name: canonical, value: legacyAttrs[0].value });
    }
    for (const a of legacyAttrs) {
      actions.push({ op: "deleteAttr", attributeId: a.attributeId, why: `legacy #${legacy}` });
    }
    notes.push(`#${legacy} → #${canonical}`);
  }

  // 6 — every typed note carries #created
  if (kind && !byName.has("created") && !LEGACY_DATE_MAP_HAS_SOURCE(byName)) {
    actions.push({ op: "addLabel", name: "created", value: (note.dateCreated ?? "").slice(0, 10) });
    notes.push("backfilled #created from note date");
  }

  return { noteId: note.noteId, actions, notes };
}

function LEGACY_DATE_MAP_HAS_SOURCE(byName: Map<string, Attribute[]>): boolean {
  return Object.entries(LEGACY_DATE_MAP).some(([legacy, canon]) => canon === "created" && byName.has(legacy));
}

// ── Resolution content surgery (pure) ────────────────────────────────────────

/** Write an outcome into a note body. Replaces everything from the Resolution
 *  anchor down (templates place it last); appends the section if absent. */
export function applyResolution(html: string, outcome: string, date: string): string {
  const section = `${RESOLUTION_ANCHOR}\n${outcome}\n<p><em>Closed ${date}</em></p>`;
  const idx = html.indexOf(RESOLUTION_ANCHOR);
  if (idx >= 0) return html.slice(0, idx) + section;
  return `${html}\n${section}`;
}

// ── Executor ──────────────────────────────────────────────────────────────────

export interface SweepReport {
  scanned: number;
  fixed: string[];        // canonicalization fixes applied
  transitions: string[];  // lifecycle demotions (dormant / archived)
  deleted: string[];      // empty structural containers removed (deep only)
  flagged: string[];      // needs-human/model attention; nothing was changed
  dryRun: boolean;
}

async function applyPlan(trilium: TriliumClient, plan: CanonPlan, dryRun: boolean): Promise<void> {
  if (dryRun || plan.actions.length === 0) return;
  for (const action of plan.actions) {
    switch (action.op) {
      case "patchTitle":
        await trilium.patchNote(plan.noteId, { title: action.title });
        break;
      case "addLabel":
        await trilium.addLabel(plan.noteId, action.name, action.value);
        break;
      case "setLabel":
        await trilium.updateLabelValue(plan.noteId, action.name, action.value);
        break;
      case "deleteAttr":
        await trilium.deleteAttribute(action.attributeId).catch(() => null);
        break;
    }
  }
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

const label = (n: Note, name: string) =>
  n.attributes.find((a) => a.type === "label" && a.name === name)?.value;

const hasLabel = (n: Note, name: string) =>
  n.attributes.some((a) => a.type === "label" && a.name === name);

/**
 * The maintenance sweep.
 * lite (default): canonicalize recent + working-memory notes, run aging.
 * deep: full canonicalization, placement repair, empty-container cleanup,
 *       same-date session merge, inbox grace, orphan report.
 */
export async function sweep(
  trilium: TriliumClient,
  cfg: BrainConfig,
  opts: { deep?: boolean; dryRun?: boolean } = {}
): Promise<SweepReport> {
  const { deep = false, dryRun = false } = opts;
  const policy = cfg.policy;
  const report: SweepReport = { scanned: 0, fixed: [], transitions: [], deleted: [], flagged: [], dryRun };
  const today = new Date().toISOString().slice(0, 10);

  // ── Phase A: canonicalization ───────────────────────────────────────────────
  const candidates = new Map<string, AnyKind | undefined>(); // noteId → inferredKind

  // Unlabeled children of WM containers + sessions (the v3 manual-path strays)
  const containers: Array<[string, AnyKind]> = [
    [cfg.workingMemory.openQuestions, "question"],
    [cfg.workingMemory.threads, "thread"],
    [cfg.workingMemory.decisions, "decision"],
    [cfg.workingMemory.inbox, "capture"],
    [cfg.log.sessions, "session"],
    [cfg.opinions, "opinion"],
  ];
  for (const [containerId, kind] of containers) {
    if (!containerId) continue;
    const container = await trilium.getNote(containerId).catch(() => null);
    if (!container) continue;
    for (const cid of container.childNoteIds) candidates.set(cid, kind);
  }

  // Labeled notes: all (deep) or recently modified (lite)
  const labeled = await trilium.searchNotes("#noteType", {
    ancestorNoteId: cfg.root,
    fastSearch: true,
    includeArchivedNotes: true,
    limit: deep ? 500 : 40,
    ...(deep ? {} : { orderBy: "dateModified", orderDirection: "desc" as const }),
  }).catch(() => ({ results: [] as Note[] }));
  for (const n of labeled.results) {
    if (!candidates.has(n.noteId)) candidates.set(n.noteId, undefined);
  }

  for (const [noteId, inferredKind] of candidates) {
    if (isStructural(cfg, noteId)) continue;
    const note = await trilium.getNote(noteId).catch(() => null);
    if (!note) continue;
    report.scanned++;
    const plan = planCanon(note, inferredKind);
    if (plan.actions.length) {
      await applyPlan(trilium, plan, dryRun);
      report.fixed.push(`${note.title}: ${plan.notes.join("; ")}`);
    }
  }

  // ── Phase B: aging (graceful degradation) ──────────────────────────────────
  // Archived notes are excluded from search by default, so these queries see
  // exactly the live population.
  const dormantCutoff = isoDaysAgo(policy.dormantAfterDays);
  const archiveCutoff = isoDaysAgo(policy.archiveDormantAfterDays);
  const inboxCutoff = isoDaysAgo(policy.inboxGraceDays);

  for (const kind of EphemeralKinds) {
    const cutoff = kind === "capture" ? inboxCutoff : dormantCutoff;
    const stale = await trilium.searchNotes(
      `#noteType=${kind} #status=active AND note.dateModified < '${cutoff}'`,
      { ancestorNoteId: cfg.workingMemory.root, limit: 50 }
    ).catch(() => ({ results: [] as Note[] }));
    for (const n of stale.results) {
      if (isStructural(cfg, n.noteId)) continue;
      if (!dryRun) await trilium.updateLabelValue(n.noteId, "status", "dormant");
      report.transitions.push(`dormant: ${n.title} (${kind}, untouched since before ${cutoff})`);
    }

    const expired = await trilium.searchNotes(
      `#noteType=${kind} #status=dormant AND note.dateModified < '${archiveCutoff}'`,
      { ancestorNoteId: cfg.workingMemory.root, limit: 50 }
    ).catch(() => ({ results: [] as Note[] }));
    for (const n of expired.results) {
      if (isStructural(cfg, n.noteId)) continue;
      if (!dryRun) {
        await trilium.updateLabelValue(n.noteId, "closed", today);
        await trilium.addLabel(n.noteId, "archived", "");
      }
      report.transitions.push(`archived: ${n.title} (${kind}, dormant past grace period)`);
    }
  }

  // Terminal-status notes that never got the archived flag
  for (const status of ["resolved", "superseded"]) {
    const unarchived = await trilium.searchNotes(`#status=${status}`, {
      ancestorNoteId: cfg.workingMemory.root,
      fastSearch: true,
      limit: 50,
    }).catch(() => ({ results: [] as Note[] }));
    for (const n of unarchived.results) {
      if (isStructural(cfg, n.noteId)) continue;
      if (!dryRun) {
        await trilium.addLabel(n.noteId, "archived", "");
        if (!hasLabel(n, "closed")) await trilium.addLabel(n.noteId, "closed", today);
      }
      report.transitions.push(`archived in place: ${n.title} (${status})`);
    }
  }

  if (!deep) return report;

  // ── Phase C: structural repair (deep only) ─────────────────────────────────

  // C1 — empty container subfolders from v3 (project Decisions/Notes, domain triads)
  const projectsAndDomains = await trilium.searchNotes("#noteType=project OR #noteType=domain", {
    ancestorNoteId: cfg.knowledge.root,
    fastSearch: true,
    includeArchivedNotes: true,
    limit: 100,
  }).catch(() => ({ results: [] as Note[] }));
  for (const parent of projectsAndDomains.results) {
    const full = await trilium.getNote(parent.noteId).catch(() => null);
    if (!full) continue;
    for (const cid of full.childNoteIds) {
      const child = await trilium.getNote(cid).catch(() => null);
      if (!child) continue;
      const isContainerName = ["Decisions", "Notes", "Concepts", "References"].includes(child.title);
      const isEmpty = child.childNoteIds.length === 0;
      const hasNoKind = !label(child, "noteType");
      if (isContainerName && isEmpty && hasNoKind) {
        if (!dryRun) await trilium.deleteNote(cid).catch(() => null);
        report.deleted.push(`${parent.title} → ${child.title} (empty v3 container)`);
      }
    }
  }

  // C2 — strays directly under section roots
  const strayScopes: Array<[string, string]> = [
    [cfg.knowledge.root, "Knowledge"],
    [cfg.workingMemory.root, "Working Memory"],
  ];
  for (const [rootId, name] of strayScopes) {
    const root = await trilium.getNote(rootId).catch(() => null);
    if (!root) continue;
    for (const cid of root.childNoteIds) {
      if (isStructural(cfg, cid)) continue;
      const child = await trilium.getNote(cid).catch(() => null);
      if (!child) continue;
      if (label(child, "noteType") === "domain") continue; // domains belong here
      report.flagged.push(`stray under ${name} root: "${child.title}" (${child.noteId}) — re-file with remember() or forget()`);
    }
  }

  // C3 — same-date session merge
  const sessions = await trilium.searchNotes("#noteType=session", {
    ancestorNoteId: cfg.log.root,
    fastSearch: true,
    includeArchivedNotes: true,
    limit: 200,
  }).catch(() => ({ results: [] as Note[] }));
  const byDate = new Map<string, Note[]>();
  for (const s of sessions.results) {
    const d = label(s, "created") ?? label(s, "sessionDate") ?? "";
    if (!d) continue;
    const arr = byDate.get(d) ?? [];
    arr.push(s);
    byDate.set(d, arr);
  }
  for (const [date, group] of byDate) {
    if (group.length < 2) continue;
    group.sort((a, b) => (a.dateCreated < b.dateCreated ? -1 : 1));
    const [primary, ...extras] = group;
    if (!dryRun) {
      let content = await trilium.getNoteContent(primary.noteId).catch(() => "");
      for (const extra of extras) {
        const extraContent = await trilium.getNoteContent(extra.noteId).catch(() => "");
        content += `\n<h2>Merged: ${extra.title}</h2>\n${extraContent}`;
        await trilium.deleteNote(extra.noteId).catch(() => null);
      }
      await trilium.updateNoteContent(primary.noteId, content);
    }
    report.fixed.push(`merged ${group.length} session notes for ${date} into "${group[0].title}"`);
  }

  // C4 — orphan report (knowledge notes with no relations in either direction;
  // report only). Incoming edges are derived from the relations visible on the
  // scanned population — cheap, and exactly the edges that matter here.
  const knowledgeNotes = await trilium.searchNotes("#noteType", {
    ancestorNoteId: cfg.knowledge.root,
    fastSearch: true,
    limit: 200,
  }).catch(() => ({ results: [] as Note[] }));
  const relationTargets = new Set<string>();
  for (const n of knowledgeNotes.results) {
    for (const a of n.attributes) {
      if (a.type === "relation" && a.name !== "template") relationTargets.add(a.value);
    }
  }
  let orphans = 0;
  for (const n of knowledgeNotes.results) {
    const kind = label(n, "noteType");
    if (kind === "domain") continue;
    const hasOutgoing = n.attributes.some((a) => a.type === "relation" && a.name !== "template");
    const hasIncoming = relationTargets.has(n.noteId);
    if (!hasOutgoing && !hasIncoming && orphans < 10) {
      orphans++;
      report.flagged.push(`unconnected: "${n.title}" (${n.noteId}) — consider connect()`);
    }
  }

  return report;
}

// ── Session digest ────────────────────────────────────────────────────────────

export interface SessionDigest {
  identity: Array<{ facet: string; notes: Array<{ id: string; title: string; summary: string }> }>;
  workingSet: Array<{ id: string; title: string; kind: string; status: string; idleDays: number }>;
  reviewQueue: Array<{ id: string; title: string; kind: string; idleDays: number }>;
  lastSession?: { id: string; title: string; date: string; summary: string };
  counts: Record<string, number>;
}

function idleDays(dateModified: string): number {
  const ms = Date.now() - new Date(dateModified.replace(" ", "T")).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export async function buildDigest(trilium: TriliumClient, cfg: BrainConfig): Promise<SessionDigest> {
  const digest: SessionDigest = { identity: [], workingSet: [], reviewQueue: [], counts: {} };

  // Identity — titles + first line of each fact, newest first, capped
  const facets: Array<[string, string]> = [
    ["profile", cfg.identity.profile],
    ["preferences", cfg.identity.preferences],
    ["context", cfg.identity.context],
  ];
  for (const [facet, id] of facets) {
    if (!id) continue;
    const container = await trilium.getNote(id).catch(() => null);
    if (!container) continue;
    const entries: Array<{ id: string; title: string; summary: string }> = [];
    for (const cid of container.childNoteIds.slice(0, 6)) {
      const child = await trilium.getNote(cid).catch(() => null);
      if (!child) continue;
      const content = await trilium.getNoteContent(cid).catch(() => "");
      entries.push({ id: cid, title: child.title, summary: toText(content, 180) });
    }
    if (entries.length) digest.identity.push({ facet, notes: entries });
  }

  // Working set — everything live in Working Memory
  const live = await trilium.searchNotes("#status=active OR #status=dormant", {
    ancestorNoteId: cfg.workingMemory.root,
    fastSearch: true,
    limit: 30,
  }).catch(() => ({ results: [] as Note[] }));
  for (const n of live.results) {
    const kind = label(n, "noteType") ?? "?";
    const status = label(n, "status") ?? "?";
    const idle = idleDays(n.dateModified);
    if (status === "dormant") {
      digest.reviewQueue.push({ id: n.noteId, title: n.title, kind, idleDays: idle });
    } else {
      digest.workingSet.push({ id: n.noteId, title: n.title, kind, status, idleDays: idle });
    }
    digest.counts[kind] = (digest.counts[kind] ?? 0) + 1;
  }
  digest.workingSet.sort((a, b) => a.idleDays - b.idleDays);
  digest.reviewQueue.sort((a, b) => b.idleDays - a.idleDays);
  digest.workingSet = digest.workingSet.slice(0, 12);
  digest.reviewQueue = digest.reviewQueue.slice(0, 8);

  // Last session
  const sessions = await trilium.searchNotes("#noteType=session", {
    ancestorNoteId: cfg.log.root,
    fastSearch: true,
    limit: 5,
    orderBy: "dateCreated",
    orderDirection: "desc",
  }).catch(() => ({ results: [] as Note[] }));
  const last = sessions.results[0];
  if (last) {
    const content = await trilium.getNoteContent(last.noteId).catch(() => "");
    digest.lastSession = {
      id: last.noteId,
      title: last.title,
      date: label(last, "created") ?? last.dateCreated.slice(0, 10),
      summary: toText(content, 300),
    };
  }

  return digest;
}

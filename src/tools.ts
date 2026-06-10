/**
 * tools.ts — Trilium Brain MCP tool registrations (core surface)
 *
 * v4 PRINCIPLE
 * ────────────
 * The model supplies content; the server owns form. Placement, naming,
 * labels, relations, deduplication, degradation and archival are policy
 * implemented here — never instructions the model must remember.
 *
 * Core surface (default): 12 intent-level tools.
 * BRAIN_MODE=full additionally registers the low-level surface
 * (raw CRUD, attributes, attachments, revisions, calendar, graph internals)
 * from tools-advanced.ts.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TriliumClient, type Note } from "./trilium.js";
import { type BrainConfig, saveConfig } from "./config.js";
import {
  Kinds,
  RelationTypes,
  SymmetricRelations,
  IdentityFacets,
  type AnyKind,
} from "./types.js";
import {
  normalizeTitle,
  sameTitle,
  slugify,
  toHtml,
  toText,
  escapeQueryValue,
  queryTokens,
  escapeHtml,
} from "./normalize.js";
import {
  contentFor,
  RESOLUTION_ANCHOR,
  type TemplateOpts,
} from "./templates.js";
import {
  dedupScope,
  templateIdFor,
  labelPlan,
  resolveParent,
  locationLabel,
  type RememberOpts,
} from "./router.js";
import { sweep, buildDigest, applyResolution, isStructural, containerKind } from "./lifecycle.js";
import { createBrainStructure } from "./bootstrap.js";
import { registerAdvancedTools } from "./tools-advanced.js";

// ── Shared helpers ────────────────────────────────────────────────────────────

export const txt = (obj: unknown) => ({
  content: [{ type: "text" as const, text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }],
});

export const today = () => new Date().toISOString().slice(0, 10);

const labelOf = (n: Note, name: string) =>
  n.attributes.find((a) => a.type === "label" && a.name === name)?.value;

const hasLabel = (n: Note, name: string) =>
  n.attributes.some((a) => a.type === "label" && a.name === name);

const compactAttrs = (n: Note) => ({
  labels: n.attributes
    .filter((a) => a.type === "label" && !a.name.startsWith("sw_"))
    .map((a) => (a.value ? `${a.name}=${a.value}` : a.name)),
  relations: n.attributes
    .filter((a) => a.type === "relation" && a.name !== "template" && !a.name.startsWith("sw_"))
    .map((a) => ({ relation: a.name, to: a.value })),
});

/** Insert a section before the Resolution anchor (or append). */
function insertBeforeResolution(html: string, section: string): string {
  const idx = html.indexOf(RESOLUTION_ANCHOR);
  if (idx >= 0) return html.slice(0, idx) + section + "\n" + html.slice(idx);
  return html + "\n" + section;
}

async function ensureArchivedFlag(trilium: TriliumClient, note: Note): Promise<void> {
  if (!hasLabel(note, "archived")) await trilium.addLabel(note.noteId, "archived", "");
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerTools(
  server: McpServer,
  trilium: TriliumClient,
  brainRef: { config: BrainConfig },
  mode: "core" | "full" = "core"
): void {
  const b = () => brainRef.config;

  /** Find an existing same-kind note with the same (normalized) title. */
  async function findExisting(kind: AnyKind, title: string): Promise<Note | null> {
    const scope = dedupScope(b(), kind);
    if (!scope) return null;
    const res = await trilium
      .searchNotes(`#noteType=${kind}`, { ancestorNoteId: scope, fastSearch: true, limit: 100 })
      .catch(() => ({ results: [] as Note[] }));
    return res.results.find((n) => sameTitle(n.title, title)) ?? null;
  }

  /** Dedup-or-create an organization stub; returns its noteId. */
  async function ensureOrganization(name: string): Promise<string> {
    const { title } = normalizeTitle(name);
    const existing = await findExisting("organization", title);
    if (existing) return existing.noteId;
    const created = await trilium.createNote(
      b().knowledge.organizations,
      title,
      contentFor("organization", { date: today(), body: "" })
    );
    const nid = created.note.noteId;
    for (const l of labelPlan("organization", title, {}, today())) {
      await trilium.addLabel(nid, l.name, l.value, l.inheritable ?? false);
    }
    const tpl = templateIdFor(b(), "organization");
    if (tpl) await trilium.addRelation(nid, "template", tpl).catch(() => null);
    return nid;
  }

  /** Find a project note by name/slug; returns null when absent. */
  async function findProject(name: string): Promise<Note | null> {
    const slug = slugify(name);
    const bySlug = await trilium
      .searchNotes(`#noteType=project #project=${slug}`, { ancestorNoteId: b().knowledge.projects, fastSearch: true, limit: 5 })
      .catch(() => ({ results: [] as Note[] }));
    if (bySlug.results[0]) return bySlug.results[0];
    return findExisting("project", name);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SESSION
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "start_session",
    `Boot the brain — call ONCE at the start of every session, before responding.
Returns everything needed to orient: who the user is (identity digest), the live working set
(active threads / decisions / questions with idle ages), a review queue of items that aged out,
the last session's summary, and a hygiene report from the automatic maintenance pass.
No other call is needed to orient; recall() is for topic-specific lookup during the session.`,
    {},
    async () => {
      const cfg = b();
      if (!cfg.root) {
        return txt({ status: "uninitialized", action: "Run bootstrap_brain to create the brain structure." });
      }
      const hygiene = await sweep(trilium, cfg, { deep: false, dryRun: false }).catch((e) => ({
        scanned: 0, fixed: [], transitions: [], deleted: [], flagged: [`sweep failed: ${e}`], dryRun: false,
      }));
      const digest = await buildDigest(trilium, cfg);
      return txt({
        status: "ready",
        date: today(),
        identity: digest.identity,
        workingSet: digest.workingSet,
        reviewQueue: digest.reviewQueue.length
          ? { note: "These items went dormant from inactivity. Mention them to the user if relevant; resolve() or revise() to reactivate.", items: digest.reviewQueue }
          : [],
        lastSession: digest.lastSession ?? null,
        hygiene: {
          scanned: hygiene.scanned,
          fixed: hygiene.fixed.length,
          transitions: hygiene.transitions,
          flagged: hygiene.flagged,
        },
      });
    }
  );

  server.tool(
    "end_session",
    `Log the session — call ONCE at the end of every session (or when the user says goodbye).
Idempotent per date: a second call the same day appends an addendum to the existing session
note instead of creating a duplicate. Automatically runs maintenance and triggers a database
backup. Just pass the summary — formatting, placement, labels and dedup are handled here.`,
    {
      summary: z.string().describe("What happened this session — factual, concise prose"),
      title: z.string().optional().describe("Short session title (default: derived from summary)"),
      decisions: z.array(z.string()).optional().describe("Decisions made, as plain statements"),
      learned: z.array(z.string()).optional().describe("Durable things learned (should also be remember()-ed)"),
      openQuestions: z.array(z.string()).optional().describe("Questions still open (should also be remember()-ed)"),
      date: z.string().optional().describe("ISO date YYYY-MM-DD (default: today)"),
      backup: z.boolean().optional().describe("Trigger DB backup (default: true)"),
    },
    async ({ summary, title, decisions, learned, openQuestions, date, backup }) => {
      const d = date ?? today();
      const cfg = b();
      const parentId = cfg.log.sessions || cfg.log.root;

      const sections: string[] = [`<h2>Summary</h2>\n${toHtml(summary)}`];
      const list = (heading: string, items?: string[]) => {
        if (items?.length) sections.push(`<h2>${heading}</h2><ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`);
      };
      list("Decisions", decisions);
      list("Learned", learned);
      list("Open Questions", openQuestions);
      const body = sections.join("\n");

      // Idempotent per date
      const existing = await trilium
        .searchNotes(`#noteType=session #created=${d}`, { ancestorNoteId: cfg.log.root, fastSearch: true, limit: 5 })
        .catch(() => ({ results: [] as Note[] }));

      let noteId: string;
      let action: "created" | "appended";
      if (existing.results[0]) {
        noteId = existing.results[0].noteId;
        const current = await trilium.getNoteContent(noteId).catch(() => "");
        const time = new Date().toISOString().slice(11, 16);
        await trilium.updateNoteContent(noteId, `${current}\n<h2>Addendum — ${time}</h2>\n${body}`);
        action = "appended";
      } else {
        const hint = title ?? summary.split(/\s+/).slice(0, 7).join(" ");
        const { title: cleanTitle } = normalizeTitle(`${d} — ${hint}`);
        const created = await trilium.createNote(parentId, cleanTitle, contentFor("session", { date: d, body }));
        noteId = created.note.noteId;
        await trilium.addLabel(noteId, "noteType", "session");
        await trilium.addLabel(noteId, "created", d);
        action = "created";
      }

      const hygiene = await sweep(trilium, cfg, { deep: false, dryRun: false }).catch(() => null);
      let backedUp = false;
      if (backup !== false) {
        backedUp = await trilium.createBackup(d).then(() => true).catch(() => false);
      }

      return txt({
        action,
        noteId,
        date: d,
        backup: backedUp ? `brain-${d}.db` : "skipped",
        maintenance: hygiene ? { fixed: hygiene.fixed.length, transitions: hygiene.transitions.length } : "skipped",
      });
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // REMEMBER / RECALL
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "remember",
    `Store something the moment it matters. ONE tool for every kind of memory — the server
owns placement, naming, labels, templates and relation wiring. Upsert semantics: if a note
of the same kind with the same title already exists, your content is appended to it as a
dated addendum instead of creating a duplicate — call it freely, duplicates are impossible.

Kinds:
  identity     fact about the user (facet: profile | preference | context)
  person       someone in the user's world (role / org optional — org auto-created + wired)
  organization company, team, community
  project      a venture with a goal — one brief note; tag related notes via project=
  concept      atomic evergreen definition (domain= recommended, defaults to General)
  reference    durable reference material / how-to (domain= recommended)
  opinion      a dated stance with reasoning — write honestly, supersedes= an older opinion id
  question     open question awaiting an answer — resolve() it later
  decision     decision record — resolve() it with the outcome when decided
  thread       multi-session line of work — revise() to log progress, resolve() to close
  capture      quick unprocessed capture when nothing else fits (auto-archives after grace period)

Body may be plain text, markdown, or HTML — it is normalized server-side.`,
    {
      kind: z.enum(Kinds).describe("What kind of memory this is"),
      title: z.string().describe("Short specific title — no status words, the server tracks status in labels"),
      body: z.string().optional().describe("Content: plain text, markdown, or HTML"),
      facet: z.enum(IdentityFacets).optional().describe("identity only: profile | preference | context (default context)"),
      domain: z.string().optional().describe("concept/reference: knowledge domain, e.g. 'Technology' (auto-created)"),
      project: z.string().optional().describe("Tag to a project by name — adds #project label + partOf relation"),
      topics: z.array(z.string()).optional().describe("Topic tags — slugged server-side"),
      mood: z.string().optional().describe("opinion only: tone, e.g. analytical | passionate | uncertain"),
      role: z.string().optional().describe("person only: their role/title"),
      org: z.string().optional().describe("person only: organization name — auto-created and wired worksWith"),
      goal: z.string().optional().describe("project only: one-line goal"),
      supersedes: z.string().optional().describe("noteId this replaces — old note is archived and wired supersedes"),
      date: z.string().optional().describe("ISO date override (default: today)"),
    },
    async ({ kind, title, body, facet, domain, project, topics, mood, role, org, goal, supersedes, date }) => {
      const opts: RememberOpts = { facet, domain, project, topics, mood, role, org, goal, date };
      const d = date ?? today();
      const { title: cleanTitle, impliedStatus } = normalizeTitle(title);
      if (!cleanTitle) throw new Error("Title is empty after normalization");
      const html = toHtml(body ?? "");

      // ── Upsert: same kind + same title → append, never duplicate ────────────
      const existing = await findExisting(kind, cleanTitle);
      if (existing) {
        await trilium.createRevision(existing.noteId).catch(() => null);
        const current = await trilium.getNoteContent(existing.noteId).catch(() => "");
        const section = `<h2>Addendum — ${d}</h2>\n${html}`;
        await trilium.updateNoteContent(existing.noteId, insertBeforeResolution(current, section));
        await trilium.updateLabelValue(existing.noteId, "updated", d);
        for (const t of topics ?? []) {
          const slug = slugify(t);
          if (slug && !existing.attributes.some((a) => a.name === "topic" && a.value === slug)) {
            await trilium.addLabel(existing.noteId, "topic", slug);
          }
        }
        return txt({
          action: "updated",
          noteId: existing.noteId,
          kind,
          title: existing.title,
          note: "Existing note with this title — your content was appended as a dated addendum.",
        });
      }

      // ── Create ───────────────────────────────────────────────────────────────
      const resolved = await resolveParent(trilium, b(), kind, opts);
      const content = contentFor(kind, {
        date: d,
        body: html,
        domain: resolved.domainTitle ?? (domain ? normalizeTitle(domain).title : undefined),
        mood, role, org, goal,
      } satisfies TemplateOpts);

      const created = await trilium.createNote(resolved.parentId, cleanTitle, content);
      const nid = created.note.noteId;

      const plan = labelPlan(kind, cleanTitle, { ...opts, status: opts.status ?? impliedStatus }, d);
      for (const l of plan) {
        await trilium.addLabel(nid, l.name, l.value, l.inheritable ?? false);
      }
      const tpl = templateIdFor(b(), kind);
      if (tpl) await trilium.addRelation(nid, "template", tpl).catch(() => null);

      const wired: string[] = [];

      if (kind === "person" && org) {
        const orgId = await ensureOrganization(org);
        await trilium.addRelation(nid, "worksWith", orgId).catch(() => null);
        await trilium.addRelation(orgId, "worksWith", nid).catch(() => null);
        wired.push(`worksWith ↔ ${org}`);
      }
      if (project && kind !== "project") {
        const proj = await findProject(project);
        if (proj) {
          await trilium.addRelation(nid, "partOf", proj.noteId).catch(() => null);
          wired.push(`partOf → ${proj.title}`);
        }
      }
      if (supersedes) {
        const old = await trilium.getNote(supersedes).catch(() => null);
        if (old && !isStructural(b(), supersedes)) {
          await trilium.addRelation(nid, "supersedes", supersedes).catch(() => null);
          await trilium.updateLabelValue(supersedes, "status", "superseded");
          await trilium.updateLabelValue(supersedes, "closed", d);
          await ensureArchivedFlag(trilium, old);
          wired.push(`supersedes → ${old.title} (archived)`);
        }
      }

      return txt({
        action: "created",
        noteId: nid,
        kind,
        title: cleanTitle,
        location: locationLabel(kind, opts, resolved.domainTitle),
        ...(resolved.createdDomain ? { createdDomain: resolved.domainTitle } : {}),
        ...(wired.length ? { wired } : {}),
      });
    }
  );

  server.tool(
    "recall",
    `Search memory before answering questions about the user, their projects, people, past
decisions, or anything previously discussed. Runs label, title and full-text strategies
server-side and returns merged, ranked results with kind/status so you know what you're
looking at. Archived (resolved/aged-out) notes are excluded unless includeArchived=true.`,
    {
      query: z.string().describe("What to find — natural phrasing is fine"),
      kinds: z.array(z.enum(Kinds)).optional().describe("Restrict to these kinds"),
      project: z.string().optional().describe("Restrict to a project (name or slug)"),
      domain: z.string().optional().describe("Restrict to a knowledge domain"),
      includeArchived: z.boolean().optional().describe("Include archived/resolved notes (default: false)"),
      limit: z.number().optional().describe("Max results (default: 10)"),
    },
    async ({ query, kinds, project, domain, includeArchived, limit }) => {
      const cfg = b();
      const max = limit ?? 10;
      const scores = new Map<string, { note: Note; score: number }>();
      const add = (notes: Note[], weight: number) => {
        for (const n of notes) {
          const entry = scores.get(n.noteId);
          if (entry) entry.score += weight;
          else scores.set(n.noteId, { note: n, score: weight });
        }
      };
      const run = (q: string, fast = false) =>
        trilium
          .searchNotes(q, {
            ancestorNoteId: cfg.root,
            limit: 30,
            fastSearch: fast,
            includeArchivedNotes: includeArchived ?? false,
          })
          .then((r) => r.results)
          .catch(() => [] as Note[]);

      const slug = slugify(query);
      const tokens = queryTokens(query);
      const [byLabel, byTitle, byText] = await Promise.all([
        slug.length >= 3
          ? run(`#topic=${slug} OR #domain=${slug} OR #project=${slug}`, true)
          : Promise.resolve([] as Note[]),
        tokens.length
          ? run(tokens.map((t) => `note.title *=* '${escapeQueryValue(t)}'`).join(" AND "))
          : Promise.resolve([] as Note[]),
        run(escapeQueryValue(query)),
      ]);
      add(byLabel, 3);
      add(byTitle, 2);
      add(byText, 1);

      const projSlug = project ? slugify(project) : null;
      const domSlug = domain ? slugify(domain) : null;
      const kindSet = kinds?.length ? new Set<string>(kinds) : null;

      const ranked = [...scores.values()]
        .filter(({ note }) => {
          const k = labelOf(note, "noteType");
          if (!k) return false; // structural / untyped notes are not memories
          if (kindSet && !kindSet.has(k)) return false;
          if (projSlug && labelOf(note, "project") !== projSlug) return false;
          if (domSlug && labelOf(note, "domain") !== domSlug) return false;
          return true;
        })
        .sort((a, b2) => b2.score - a.score || (a.note.dateModified < b2.note.dateModified ? 1 : -1))
        .slice(0, max);

      const results = await Promise.all(
        ranked.map(async ({ note }, i) => {
          const base = {
            id: note.noteId,
            title: note.title,
            kind: labelOf(note, "noteType"),
            status: labelOf(note, "status"),
            updated: note.dateModified.slice(0, 10),
            ...(hasLabel(note, "archived") ? { archived: true } : {}),
          };
          if (i < 3) {
            const content = await trilium.getNoteContent(note.noteId).catch(() => "");
            return { ...base, snippet: toText(content, 280) };
          }
          return base;
        })
      );

      return txt({
        results,
        ...(results.length === 0
          ? { note: "No matches. Content may not be stored yet — remember() it if the user provides it." }
          : {}),
      });
    }
  );

  server.tool(
    "read_note",
    "Read one note in full: metadata, labels, relations, and content. Use after recall() when the snippet isn't enough.",
    { noteId: z.string().describe("Note ID") },
    async ({ noteId }) => {
      const [note, content] = await Promise.all([
        trilium.getNote(noteId),
        trilium.getNoteContent(noteId).catch(() => ""),
      ]);
      return txt({
        id: note.noteId,
        title: note.title,
        kind: labelOf(note, "noteType") ?? null,
        status: labelOf(note, "status") ?? null,
        ...compactAttrs(note),
        parents: note.parentNoteIds,
        children: note.childNoteIds,
        created: note.dateCreated.slice(0, 10),
        modified: note.dateModified.slice(0, 10),
        content,
      });
    }
  );

  server.tool(
    "revise",
    `Update an existing note. Default mode appends a dated addendum (the right choice for
threads, projects, people, references); mode=replace rewrites the body. A revision snapshot
is always taken first, so nothing is ever lost. Also use this to log progress on a thread.`,
    {
      noteId: z.string().describe("Note to update"),
      body: z.string().optional().describe("Content to add/replace: plain text, markdown, or HTML"),
      title: z.string().optional().describe("New title (normalized server-side)"),
      mode: z.enum(["append", "replace"]).optional().describe("append (default) | replace"),
      date: z.string().optional().describe("ISO date (default: today)"),
    },
    async ({ noteId, body, title, mode, date }) => {
      if (isStructural(b(), noteId)) throw new Error("Refusing to edit a structural note");
      const d = date ?? today();
      const note = await trilium.getNote(noteId);
      await trilium.createRevision(noteId).catch(() => null);

      if (body) {
        const html = toHtml(body);
        if (mode === "replace") {
          await trilium.updateNoteContent(noteId, html);
        } else {
          const current = await trilium.getNoteContent(noteId).catch(() => "");
          const section = `<h2>Addendum — ${d}</h2>\n${html}`;
          await trilium.updateNoteContent(noteId, insertBeforeResolution(current, section));
        }
      }
      if (title) {
        const { title: cleanTitle } = normalizeTitle(title);
        if (cleanTitle && cleanTitle !== note.title) await trilium.patchNote(noteId, { title: cleanTitle });
      }
      await trilium.updateLabelValue(noteId, "updated", d);

      // Touching a dormant note reactivates it.
      if (labelOf(note, "status") === "dormant") {
        await trilium.updateLabelValue(noteId, "status", "active");
      }

      return txt({ ok: true, noteId, mode: body ? (mode ?? "append") : "metadata-only", date: d });
    }
  );

  server.tool(
    "resolve",
    `Complete something — the ONE way questions get answered, decisions get decided, threads
get closed, and captures get processed. Writes the outcome into the note, sets the status,
archives it in place (it stays where it is, excluded from default recall), and wires
follow-ups: decisions are cloned into Log → Decisions Made automatically; promote=true also
distills the outcome into a durable Knowledge reference wired derivedFrom.
Write a substantive outcome — "done" is not an outcome.`,
    {
      noteId: z.string().describe("The question / decision / thread / capture to complete"),
      outcome: z.string().describe("The answer / decision / resolution — substantive, standalone prose"),
      status: z.enum(["resolved", "superseded"]).optional().describe("Terminal status (default: resolved)"),
      supersededBy: z.string().optional().describe("noteId of the replacement, when status=superseded"),
      promote: z.boolean().optional().describe("Also distill into a Knowledge reference note"),
      promoteDomain: z.string().optional().describe("Domain for the promoted note (default: General)"),
      date: z.string().optional().describe("ISO date (default: today)"),
    },
    async ({ noteId, outcome, status, supersededBy, promote, promoteDomain, date }) => {
      if (isStructural(b(), noteId)) throw new Error("Refusing to resolve a structural note");
      const d = date ?? today();
      const terminal = status ?? "resolved";
      const note = await trilium.getNote(noteId);
      const kind = (labelOf(note, "noteType") as AnyKind | undefined)
        ?? containerKind(b(), note.parentNoteIds[0] ?? "");

      await trilium.createRevision(noteId).catch(() => null);
      const current = await trilium.getNoteContent(noteId).catch(() => "");
      await trilium.updateNoteContent(noteId, applyResolution(current, toHtml(outcome), d));

      if (!labelOf(note, "noteType") && kind) {
        await trilium.updateLabelValue(noteId, "noteType", kind);
      }
      await trilium.updateLabelValue(noteId, "status", terminal);
      await trilium.updateLabelValue(noteId, "closed", d);
      await ensureArchivedFlag(trilium, note);

      const followUps: string[] = [];

      if (kind === "decision" && b().log.decisionsMade) {
        await trilium.cloneNote(noteId, b().log.decisionsMade).catch(() => null);
        followUps.push("cloned into Log → Decisions Made");
      }
      if (supersededBy) {
        await trilium.addRelation(supersededBy, "supersedes", noteId).catch(() => null);
        followUps.push(`superseded by ${supersededBy}`);
      }

      let promoted: { noteId: string; title: string; location: string } | undefined;
      if (promote) {
        const resolved = await resolveParent(trilium, b(), "reference", { domain: promoteDomain ?? "General" });
        const promoTitle = normalizeTitle(note.title).title;
        const promoContent = contentFor("reference", {
          date: d,
          body: `${toHtml(outcome)}\n<p><em>Distilled from: ${escapeHtml(note.title)}</em></p>`,
          domain: resolved.domainTitle,
        });
        const created = await trilium.createNote(resolved.parentId, promoTitle, promoContent);
        for (const l of labelPlan("reference", promoTitle, { domain: promoteDomain ?? "General" }, d)) {
          await trilium.addLabel(created.note.noteId, l.name, l.value);
        }
        await trilium.addRelation(created.note.noteId, "derivedFrom", noteId).catch(() => null);
        promoted = {
          noteId: created.note.noteId,
          title: promoTitle,
          location: locationLabel("reference", {}, resolved.domainTitle),
        };
        followUps.push(`promoted to ${promoted.location}`);
      }

      return txt({
        ok: true,
        noteId,
        kind: kind ?? "note",
        status: terminal,
        archivedInPlace: true,
        ...(followUps.length ? { followUps } : {}),
        ...(promoted ? { promoted } : {}),
      });
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // GRAPH
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "connect",
    `Wire a typed relation between two notes when you notice a real connection.
Vocabulary (closed): ${RelationTypes.join(" | ")}.
worksWith is symmetric and wired in both directions automatically. Existing edges are
detected — calling twice is safe. Use remove=true to delete an edge.`,
    {
      fromNoteId: z.string().describe("Source note"),
      relation: z.enum(RelationTypes).describe("Relation type"),
      toNoteId: z.string().describe("Target note"),
      remove: z.boolean().optional().describe("Delete this relation instead of creating it"),
    },
    async ({ fromNoteId, relation, toNoteId, remove }) => {
      const symmetric = SymmetricRelations.includes(relation);

      if (remove) {
        await trilium.desynapse(fromNoteId, relation, toNoteId).catch(() => null);
        if (symmetric) await trilium.desynapse(toNoteId, relation, fromNoteId).catch(() => null);
        return txt({ ok: true, removed: `${fromNoteId} ~${relation}→ ${toNoteId}` });
      }

      const from = await trilium.getNote(fromNoteId);
      const exists = from.attributes.some(
        (a) => a.type === "relation" && a.name === relation && a.value === toNoteId
      );
      if (!exists) await trilium.addRelation(fromNoteId, relation, toNoteId);
      if (symmetric) {
        const to = await trilium.getNote(toNoteId);
        const reverseExists = to.attributes.some(
          (a) => a.type === "relation" && a.name === relation && a.value === fromNoteId
        );
        if (!reverseExists) await trilium.addRelation(toNoteId, relation, fromNoteId);
      }
      return txt({
        ok: true,
        action: exists ? "already-existed" : "created",
        edge: `${fromNoteId} ~${relation}${symmetric ? "↔" : "→"} ${toNoteId}`,
      });
    }
  );

  server.tool(
    "explore",
    `Walk the knowledge graph around a note.
  mode=links         what this note points to (one hop)
  mode=backlinks     what points to this note (one hop)
  mode=neighborhood  everything within N hops (depth, optional relation filter)
  mode=path          shortest connection between noteId and toNoteId`,
    {
      noteId: z.string().describe("Starting note"),
      mode: z.enum(["links", "backlinks", "neighborhood", "path"]).describe("Traversal mode"),
      toNoteId: z.string().optional().describe("Target note (mode=path)"),
      depth: z.number().optional().describe("Hops for neighborhood (default: 2)"),
      relation: z.string().optional().describe("Restrict to one relation type"),
    },
    async ({ noteId, mode, toNoteId, depth, relation }) => {
      switch (mode) {
        case "links": {
          const note = await trilium.getNote(noteId);
          const rels = note.attributes.filter(
            (a) => a.type === "relation" && a.name !== "template" && !a.name.startsWith("sw_") && (!relation || a.name === relation)
          );
          const linked = await Promise.all(
            rels.map(async (r) => {
              const n = await trilium.getNote(r.value).catch(() => null);
              return n ? { id: n.noteId, title: n.title, via: r.name } : null;
            })
          );
          return txt({ mode, links: linked.filter(Boolean) });
        }
        case "backlinks": {
          const backlinks = await trilium.getBacklinks(noteId);
          return txt({ mode, backlinks: relation ? backlinks.filter((b2) => b2.relationName === relation) : backlinks });
        }
        case "neighborhood": {
          const nodes = await trilium.getNeighborhood(noteId, depth ?? 2, relation);
          return txt({ mode, nodeCount: nodes.length, nodes });
        }
        case "path": {
          if (!toNoteId) throw new Error("mode=path requires toNoteId");
          const path = await trilium.findNeuralPath(noteId, toNoteId, depth ?? 6);
          return txt(path ? { mode, found: true, hops: path.length - 1, path } : { mode, found: false });
        }
      }
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // LIFECYCLE / SYSTEM
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "maintain",
    `Run the maintenance sweep manually. start_session and end_session already run the lite
sweep automatically — call this with deep=true for a full pass (also migrates any legacy v3
data): canonicalizes titles/labels, ages stale items (active → dormant → archived in place),
deletes empty legacy containers, merges duplicate session notes, reports strays and
unconnected notes. dryRun=true previews without changing anything.`,
    {
      deep: z.boolean().optional().describe("Full structural pass (default: false = lite)"),
      dryRun: z.boolean().optional().describe("Report what would change without changing it"),
    },
    async ({ deep, dryRun }) => {
      const report = await sweep(trilium, b(), { deep: deep ?? false, dryRun: dryRun ?? false });
      return txt(report);
    }
  );

  server.tool(
    "forget",
    `Archive a note (default) or hard-delete it (hard=true). Archiving keeps it in place,
hidden from default recall — the safe choice and the only one for anything with history.
Hard delete is refused while other notes still link here (the backlinks are returned so you
can re-wire with connect() first).`,
    {
      noteId: z.string().describe("Note to forget"),
      reason: z.string().optional().describe("Why — recorded in the note before archiving"),
      hard: z.boolean().optional().describe("Permanently delete instead of archive"),
    },
    async ({ noteId, reason, hard }) => {
      if (isStructural(b(), noteId)) throw new Error("Refusing to forget a structural note");
      const note = await trilium.getNote(noteId);

      if (hard) {
        const backlinks = await trilium.getBacklinks(noteId).catch(() => []);
        if (backlinks.length > 0) {
          return txt({
            blocked: true,
            why: "Other notes still link here. Re-wire or remove these relations first (connect with remove=true), or archive instead.",
            backlinks,
          });
        }
        await trilium.deleteNote(noteId);
        return txt({ ok: true, deleted: noteId, title: note.title });
      }

      if (reason) {
        const current = await trilium.getNoteContent(noteId).catch(() => "");
        await trilium.updateNoteContent(noteId, `${current}\n<p><em>Archived ${today()}: ${escapeHtml(reason)}</em></p>`);
      }
      await trilium.updateLabelValue(noteId, "closed", today());
      await ensureArchivedFlag(trilium, note);
      return txt({ ok: true, archived: noteId, title: note.title });
    }
  );

  server.tool(
    "bootstrap_brain",
    `Initialize the brain structure in Trilium (idempotent — safe to re-run; reports and
repairs config if the structure already exists). Creates: Identity (Profile/Preferences/
Context), Working Memory (Inbox/Threads/Decisions/Open Questions), Knowledge (People/
Organizations/Projects + domains on demand), Opinions, Log (Sessions/Decisions Made),
Templates. Writes brain.json with lifecycle policy; active immediately, no restart needed.`,
    {},
    async () => {
      if (b().root) {
        try {
          const existing = await trilium.getNote(b().root);
          const children = await Promise.all(
            existing.childNoteIds.map(async (cid) => {
              const child = await trilium.getNote(cid);
              return { id: child.noteId, title: child.title };
            })
          );
          const saved = saveConfig(brainRef.config);
          return txt({
            status: "already_initialized",
            message: `Brain structure exists. Config refreshed at: ${saved}`,
            root: { id: existing.noteId, title: existing.title },
            children,
          });
        } catch {
          // Stale root ID — fall through to fresh init
        }
      }

      const newConfig = await createBrainStructure(trilium);
      const savedPath = saveConfig(newConfig);
      brainRef.config = newConfig;

      return txt({
        status: "initialized",
        message: `Brain bootstrapped. Config written to: ${savedPath}. Ready to use — no restart needed.`,
        config: newConfig,
      });
    }
  );

  // ── Advanced surface (opt-in) ────────────────────────────────────────────────
  if (mode === "full") {
    registerAdvancedTools(server, trilium, brainRef);
  }
}

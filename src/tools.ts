/**
 * tools.ts — Trilium Brain MCP tool registrations
 *
 * TOKEN ECONOMY
 * ─────────────
 * • List / search → id + title only. No content.
 * • Single-note retrieval → metadata OR content, not both, unless get_note_with_content is used.
 * • Write tools → return only changed / created identifiers.
 * • Bulk tools accept arrays so the LLM batches in one call.
 *
 * NAMING SCHEME
 * ─────────────
 * Tool names follow Trilium ETAPI naming conventions (verb_noun style, Trilium vocabulary).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TriliumClient } from "./trilium.js";
import { type BrainConfig, saveConfig } from "./config.js";
import { SynapseTypes } from "./types.js";
import {
  threadContent,
  decisionContent,
  conceptContent,
  personContent,
  projectContent,
  opinionContent,
  domainContent,
} from "./templates.js";

// ── Output shape helpers ───────────────────────────────────────────────────────

const noteStub = (n: { noteId: string; title: string; type?: string }) => ({
  id: n.noteId,
  title: n.title,
  ...(n.type ? { type: n.type } : {}),
});

const attrStub = (a: { attributeId: string; noteId: string; type: string; name: string; value: string }) => ({
  id: a.attributeId,
  noteId: a.noteId,
  type: a.type,
  name: a.name,
  value: a.value,
});

const branchStub = (br: { branchId: string; noteId: string; parentNoteId: string }) => ({
  id: br.branchId,
  noteId: br.noteId,
  parentNoteId: br.parentNoteId,
});

const revStub = (r: { revisionId: string; noteId: string; title: string; utcDateCreated: string; contentLength: number }) => ({
  id: r.revisionId,
  noteId: r.noteId,
  title: r.title,
  date: r.utcDateCreated,
  size: r.contentLength,
});

const attachStub = (a: { attachmentId: string; title: string; mime: string; contentLength: number }) => ({
  id: a.attachmentId,
  title: a.title,
  mime: a.mime,
  size: a.contentLength,
});

const txt = (obj: unknown) => ({
  content: [{ type: "text" as const, text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }],
});

const today = () => new Date().toISOString().slice(0, 10);

// ── Registration ───────────────────────────────────────────────────────────────

export function registerTools(server: McpServer, trilium: TriliumClient, brainRef: { config: BrainConfig }): void {
  // b() always returns the latest config — updated live by bootstrap_brain
  const b = () => brainRef.config;

  // ════════════════════════════════════════════════════════════════════════════
  // SESSION / ORIENTATION
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "start_brain_session",
    `Boot the Trilium Brain session. Returns the full three-level brain tree with note IDs
for every structural node so the model can navigate without further round-trips.
Call ONCE at the start of every session. Never repeat mid-session.

Returns: { id, title, noteType, children[] } — three levels deep.`,
    {},
    async () => {
      const root = await trilium.getNote(b().root);
      const children = await Promise.all(
        root.childNoteIds.map(async (cid) => {
          const child = await trilium.getNote(cid);
          const grandchildren = await Promise.all(
            child.childNoteIds.map(async (gcid) => {
              const gc = await trilium.getNote(gcid);
              return { id: gc.noteId, title: gc.title };
            })
          );
          return {
            id: child.noteId,
            title: child.title,
            ...(grandchildren.length ? { children: grandchildren } : {}),
          };
        })
      );
      // Surface any uninitialized structural IDs so the LLM knows to bootstrap
      const cfg = b();
      const uninitializedNodes: string[] = [];
      const checkFlat = (obj: Record<string, unknown>, prefix: string) => {
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === "string" && !v) uninitializedNodes.push(`${prefix}.${k}`);
          else if (typeof v === "object" && v) checkFlat(v as Record<string, unknown>, `${prefix}.${k}`);
        }
      };
      checkFlat(cfg as unknown as Record<string, unknown>, "brain");

      return txt({
        id: root.noteId,
        title: root.title,
        children,
        structuralIds: {
          identity: cfg.identity,
          workingMemory: cfg.workingMemory,
          knowledge: cfg.knowledge,
          opinions: cfg.opinions,
          log: cfg.log,
          templates: cfg.templates,
        },
        configStatus: uninitializedNodes.length === 0
          ? "complete"
          : { incomplete: true, uninitializedNodes },
      });
    }
  );

  server.tool(
    "log_session",
    `Persist a structured session summary into Log → Sessions. Call at the end of every session.
Creates a properly formatted session note with summary, decisions, modified notes, and open questions.
Returns the new session noteId.`,
    {
      title: z.string().optional().describe("Session title (default: YYYY-MM-DD)"),
      summary: z.string().describe("What happened this session — factual, concise"),
      decisions: z.array(z.string()).optional().describe("Decisions made (list of strings)"),
      modified: z.array(z.string()).optional().describe("Note titles created or modified"),
      openQuestions: z.array(z.string()).optional().describe("Unresolved questions carried forward"),
      date: z.string().optional().describe("ISO date YYYY-MM-DD (default: today)"),
    },
    async ({ title, summary, decisions, modified, openQuestions, date }) => {
      const d = date ?? today();
      const sessionTitle = title ?? d;
      const parentId = b().log.sessions || b().log.root;

      // Build structured HTML content
      let html = `<p><strong>Date:</strong> ${d}</p>`;
      html += `<h2>Summary</h2><p>${summary}</p>`;

      if (decisions?.length) {
        html += `<h2>Decisions Made</h2><ul>${decisions.map((x) => `<li>${x}</li>`).join("")}</ul>`;
      }
      if (modified?.length) {
        html += `<h2>Notes Modified</h2><ul>${modified.map((x) => `<li>${x}</li>`).join("")}</ul>`;
      }
      if (openQuestions?.length) {
        html += `<h2>Open Questions</h2><ul>${openQuestions.map((x) => `<li>${x}</li>`).join("")}</ul>`;
      }

      const result = await trilium.createNote(parentId, sessionTitle, html);
      const nid = result.note.noteId;
      await trilium.addLabel(nid, "noteType", "session");
      await trilium.addLabel(nid, "sessionDate", d);
      return txt({ noteId: nid, title: sessionTitle, parentId });
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // SCAN / SEARCH
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "search_notes",
    `Full-power search across the brain. Supports Trilium's native query language:
  • Plain text: "machine learning"
  • Label filter: #topic=AI  |  #status!=done  |  #noteType=concept
  • Date operators: #dateModified =* MONTH  |  #dateCreated >= 2026-01-01
  • Scope: ancestorNoteId limits search to a subtree
  • fastSearch=true skips body scan (much faster for label-only queries)
Returns id+title+type stubs only — call get_note_content or get_note_with_content for content.`,
    {
      query: z.string().describe("Trilium search query"),
      ancestorNoteId: z.string().optional().describe("Limit to this subtree"),
      ancestorDepth: z.string().optional().describe("Depth filter: eq1, lt3, gt2"),
      limit: z.number().optional().describe("Max results"),
      orderBy: z.string().optional().describe("Sort field: title, dateModified, dateCreated"),
      orderDirection: z.enum(["asc", "desc"]).optional(),
      fastSearch: z.boolean().optional().describe("Skip content body scan"),
      includeArchived: z.boolean().optional().describe("Include archived notes"),
      debug: z.boolean().optional().describe("Return query debug info (useful for troubleshooting search syntax)"),
    },
    async ({ query, ancestorNoteId, ancestorDepth, limit, orderBy, orderDirection, fastSearch, includeArchived, debug }) => {
      const result = await trilium.searchNotes(query, {
        ancestorNoteId: ancestorNoteId ?? b().root,
        ancestorDepth, limit, orderBy, orderDirection,
        fastSearch, includeArchivedNotes: includeArchived,
        debug,
      });
      const out: Record<string, unknown> = { results: result.results.map(noteStub) };
      if (result.debugInfo !== undefined) out.debugInfo = result.debugInfo;
      return txt(out);
    }
  );

  server.tool(
    "search_notes_by_label",
    `Find notes by label name and optional exact value. Scoped to the brain by default.
Shorthand for search_notes with #label syntax. Use for structured retrieval.
Examples: labelName="noteType" labelValue="decision" → all decision records.`,
    {
      labelName: z.string().describe("Label name (no # prefix)"),
      labelValue: z.string().optional().describe("Exact value to match"),
      ancestorNoteId: z.string().optional().describe("Scope to subtree (default: brain root)"),
      limit: z.number().optional().describe("Max results (default: 50)"),
    },
    async ({ labelName, labelValue, ancestorNoteId, limit }) => {
      const query = labelValue != null ? `#${labelName}=${labelValue}` : `#${labelName}`;
      const result = await trilium.searchNotes(query, {
        ancestorNoteId: ancestorNoteId ?? b().root,
        limit: limit ?? 50,
        fastSearch: true,
      });
      return txt(result.results.map(noteStub));
    }
  );

  server.tool(
    "get_recent_notes",
    `Return the most recently modified notes (up to 50), newest-first. Scoped to the brain by default.
Use to resume context after a gap: "what changed since last session?"
Returns id+title+date triples.`,
    {
      ancestorNoteId: z.string().optional().describe("Scope to subtree (default: brain root)"),
    },
    async ({ ancestorNoteId }) => {
      const changes = await trilium.getNoteHistory(ancestorNoteId ?? b().root);
      const seen = new Set<string>();
      const deduped = changes
        .filter((c) => {
          if (seen.has(c.noteId)) return false;
          seen.add(c.noteId);
          return !c.current_isDeleted;
        })
        .slice(0, 50);
      return txt(deduped.map((c) => ({ id: c.noteId, title: c.current_title, date: c.utcDate })));
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // NOTE CRUD
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "get_note",
    `Get full metadata for a note: id, title, type, mime, attributes (labels + relations),
parent/child IDs, dates. Does NOT return content — call get_note_content separately.
Use to inspect structure, labels, and relations before acting.`,
    { noteId: z.string().describe("Note ID") },
    async ({ noteId }) => {
      const note = await trilium.getNote(noteId);
      return txt({
        id: note.noteId,
        title: note.title,
        type: note.type,
        mime: note.mime,
        isProtected: note.isProtected,
        attributes: note.attributes.map(attrStub),
        parents: note.parentNoteIds,
        children: note.childNoteIds,
        dateCreated: note.dateCreated,
        dateModified: note.dateModified,
      });
    }
  );

  server.tool(
    "get_note_content",
    `Return the raw content of a note. Text notes return HTML; code notes return plain text.
Only call when you need to reason over the body — keeps context lean.`,
    { noteId: z.string().describe("Note ID") },
    async ({ noteId }) => {
      const content = await trilium.getNoteContent(noteId);
      return txt(content);
    }
  );

  server.tool(
    "get_note_with_content",
    `Get both metadata AND content in one call.
Use when you need to read then immediately act (e.g. update). For inspection only, prefer get_note.`,
    { noteId: z.string().describe("Note ID") },
    async ({ noteId }) => {
      const [note, content] = await Promise.all([
        trilium.getNote(noteId),
        trilium.getNoteContent(noteId),
      ]);
      return txt({
        id: note.noteId,
        title: note.title,
        type: note.type,
        attributes: note.attributes.map(attrStub),
        parents: note.parentNoteIds,
        children: note.childNoteIds,
        dateModified: note.dateModified,
        content,
      });
    }
  );

  server.tool(
    "create_note",
    `Create a raw note at any location. For structured memory use create_* tools instead.
Supported types: text, code, book, canvas, mermaid, relationMap, render, search, file, image.
For code notes specify mime e.g. "application/javascript", "text/x-python".
Returns the new noteId and branchId.`,
    {
      parentNoteId: z.string().describe("Parent note ID"),
      title: z.string().describe("Note title"),
      content: z.string().describe("Body (HTML for text, plain for code)"),
      type: z.enum(["text","code","book","canvas","mermaid","relationMap","render","search","file","image"]).optional(),
      mime: z.string().optional().describe("MIME type (required for code / file / image)"),
    },
    async ({ parentNoteId, title, content, type, mime }) => {
      const result = await trilium.createNote(parentNoteId, title, content, type ?? "text", mime);
      return txt({ noteId: result.note.noteId, branchId: result.branch.branchId, title: result.note.title });
    }
  );

  server.tool(
    "update_note_content",
    `Replace the full content of an existing note.
For text notes use HTML; for code notes use plain text.
Does NOT guarantee a pre-write snapshot — call create_note_revision first if you need one.`,
    {
      noteId: z.string().describe("Note ID"),
      content: z.string().describe("New full content"),
    },
    async ({ noteId, content }) => {
      await trilium.updateNoteContent(noteId, content);
      return txt({ ok: true, noteId });
    }
  );

  server.tool(
    "patch_note",
    `Mutate note metadata: title, type, or mime. Does not touch content.
Use to rename, reclassify type, or fix MIME after creation.
Changing type (e.g. text → code) changes how Trilium renders the note.`,
    {
      noteId: z.string().describe("Note ID"),
      title: z.string().optional().describe("New title"),
      type: z.string().optional().describe("New note type (text, code, book, canvas, mermaid…)"),
      mime: z.string().optional().describe("New MIME type"),
    },
    async ({ noteId, title, type, mime }) => {
      const fields: { title?: string; type?: string; mime?: string } = {};
      if (title != null) fields.title = title;
      if (type  != null) fields.type  = type;
      if (mime  != null) fields.mime  = mime;
      const note = await trilium.patchNote(noteId, fields);
      return txt({ noteId: note.noteId, title: note.title, type: note.type });
    }
  );

  server.tool(
    "delete_note",
    `Delete a note and all its branches. If it is the last branch the note is erased permanently.
Prefer adding #archived label over deletion to preserve knowledge history.`,
    { noteId: z.string().describe("Note ID to delete") },
    async ({ noteId }) => {
      await trilium.deleteNote(noteId);
      return txt({ ok: true, deleted: noteId });
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // STRUCTURE / BRANCHING
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "clone_note",
    `Place an existing note into an additional location (multi-parent branching).
Does NOT copy — both locations share the same content. Useful for cross-domain indexing
without duplication. Use add_relation for semantic linking when a relation is more appropriate.`,
    {
      noteId: z.string().describe("Note to clone"),
      parentNoteId: z.string().describe("Target parent"),
      prefix: z.string().optional().describe("Optional branch prefix label"),
    },
    async ({ noteId, parentNoteId, prefix }) => {
      const branch = await trilium.cloneNote(noteId, parentNoteId, prefix);
      return txt(branchStub(branch));
    }
  );

  server.tool(
    "move_note",
    `Move a note to a new parent. Deletes the old branch, creates a new one.
Never leaves the note orphaned — new branch is created before old is removed.`,
    {
      noteId: z.string().describe("Note to move"),
      fromParentNoteId: z.string().describe("Current parent note ID"),
      toParentNoteId: z.string().describe("Destination parent note ID"),
    },
    async ({ noteId, fromParentNoteId, toParentNoteId }) => {
      const newBranch = await trilium.cloneNote(noteId, toParentNoteId);
      const fresh = await trilium.getNote(noteId);
      for (const bid of fresh.parentBranchIds) {
        if (bid === newBranch.branchId) continue;
        const branch = await trilium.getBranch(bid);
        if (branch.parentNoteId === fromParentNoteId) {
          await trilium.deleteBranch(bid);
          break;
        }
      }
      return txt({ ok: true, noteId, movedTo: toParentNoteId, newBranchId: newBranch.branchId });
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // ATTRIBUTES (labels & relations)
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "add_label",
    `Add a #label (key-value tag) to a note. Labels are the primary metadata and search mechanism.
Common patterns:
  #noteType=concept | #status=active | #topic=AI | #domain=Technology
  #confidence=high | #reviewed=2026-03-31 | #source=session
Set isInheritable=true to propagate the label down to all child notes.`,
    {
      noteId: z.string().describe("Target note ID"),
      name: z.string().describe("Label name (no # prefix)"),
      value: z.string().optional().describe("Label value (empty = boolean flag)"),
      isInheritable: z.boolean().optional().describe("Propagate to children (default: false)"),
    },
    async ({ noteId, name, value, isInheritable }) => {
      const attr = await trilium.addLabel(noteId, name, value ?? "", isInheritable ?? false);
      return txt(attrStub(attr));
    }
  );

  server.tool(
    "update_label",
    `Update the value of an existing label in place (atomic — preserves attributeId).
Preferred over delete_attribute + add_label when changing a label's value.
Get the attributeId from get_note's attributes array.`,
    {
      attributeId: z.string().describe("Attribute ID to update"),
      value: z.string().describe("New value"),
    },
    async ({ attributeId, value }) => {
      const attr = await trilium.updateAttribute(attributeId, { value });
      return txt(attrStub(attr));
    }
  );

  server.tool(
    "add_relation",
    `Create a typed directional relation between two notes.
Relations are the edges of the knowledge graph — use them to wire the connectome.

Canonical relation types:
  relatesTo | extends | contradicts | supports | causes | references
  partOf | worksWith | mentors | instanceOf | supersedes | implements | inspiredBy | sourceOf

Custom types are allowed but prefer the canonical vocabulary for traversal consistency.
Returns the created attribute stub.`,
    {
      fromNoteId: z.string().describe("Source note ID"),
      relationName: z.string().describe("Relation name (e.g. relatesTo, extends, contradicts)"),
      toNoteId: z.string().describe("Target note ID"),
      bidirectional: z.boolean().optional().describe("Also create reverse relation (default: false)"),
      isInheritable: z.boolean().optional().describe("Propagate to child notes (default: false)"),
    },
    async ({ fromNoteId, relationName, toNoteId, bidirectional, isInheritable }) => {
      const fwd = await trilium.addRelation(fromNoteId, relationName, toNoteId, isInheritable ?? false);
      const result: Record<string, unknown> = { forward: attrStub(fwd) };

      if (bidirectional) {
        const rev = await trilium.addRelation(toNoteId, relationName, fromNoteId, isInheritable ?? false);
        result.reverse = attrStub(rev);
      }

      return txt(result);
    }
  );

  server.tool(
    "delete_relation",
    `Remove a specific named relation between two notes.
Requires the relation name and both note IDs — more ergonomic than delete_attribute.
Use delete_attribute if you only have the attributeId.`,
    {
      fromNoteId: z.string().describe("Source note ID"),
      relationName: z.string().describe("Relation name to remove"),
      toNoteId: z.string().describe("Target note ID"),
    },
    async ({ fromNoteId, relationName, toNoteId }) => {
      await trilium.desynapse(fromNoteId, relationName, toNoteId);
      return txt({ ok: true, removed: `${fromNoteId} ~${relationName}→ ${toNoteId}` });
    }
  );

  server.tool(
    "delete_attribute",
    `Delete any label or relation attribute by its raw attributeId.
Get the attributeId from get_note's attributes array.
For removing a named relation, delete_relation is more ergonomic.`,
    { attributeId: z.string().describe("Attribute ID to delete") },
    async ({ attributeId }) => {
      await trilium.deleteAttribute(attributeId);
      return txt({ ok: true, deleted: attributeId });
    }
  );

  server.tool(
    "strengthen_relation",
    `Increment the synaptic weight between two notes (Hebbian reinforcement).
Each call adds 1 to a #sw_{type}_{targetId} label on the source note.
Weight reflects how often a pathway has been traversed / activated.
Returns the updated strength value and label ID.`,
    {
      fromNoteId: z.string().describe("Source note ID"),
      relationName: z.string().describe("Relation name to strengthen"),
      toNoteId: z.string().describe("Target note ID"),
    },
    async ({ fromNoteId, relationName, toNoteId }) => {
      const result = await trilium.strengthenSynapse(fromNoteId, relationName, toNoteId);
      return txt({ fromNoteId, relationName, toNoteId, ...result });
    }
  );

  server.tool(
    "get_relation_types",
    `Discover all distinct relation type names currently in use across the brain (or a subtree).
Useful for understanding the vocabulary of the knowledge graph before traversal.
Returns a sorted list of type names.`,
    {
      ancestorNoteId: z.string().optional().describe("Scope to subtree (default: entire brain)"),
    },
    async ({ ancestorNoteId }) => {
      const types = await trilium.listSynapseTypes(ancestorNoteId ?? b().root);
      return txt({ relationTypes: types, canonical: SynapseTypes });
    }
  );

  server.tool(
    "get_related_notes",
    `Find all notes connected to a given note via a specific relation type.
direction=outbound (default): notes this note points TO via relationName
direction=inbound: notes that point TO this note via relationName`,
    {
      noteId: z.string().describe("Source note ID"),
      relationName: z.string().describe("Relation name to follow"),
      direction: z.enum(["outbound", "inbound"]).optional().describe("Traversal direction (default: outbound)"),
    },
    async ({ noteId, relationName, direction }) => {
      const notes = await trilium.queryBySynapse(noteId, relationName, direction ?? "outbound");
      return txt(notes);
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // GRAPH / CONNECTOME TRAVERSAL
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "get_outgoing_relations",
    `Return all notes this note points TO via any outgoing relation.
One hop only — use get_note_neighborhood for multi-hop traversal.
Returns id+title pairs with the relation name.`,
    { noteId: z.string().describe("Source note ID") },
    async ({ noteId }) => {
      const note = await trilium.getNote(noteId);
      const rels = note.attributes.filter((a) => a.type === "relation" && !a.name.startsWith("sw_"));
      // Build weight map from sw_{type}_{targetId} labels already on this note — no extra API calls
      const weightMap: Record<string, number> = {};
      note.attributes
        .filter((a) => a.type === "label" && a.name.startsWith("sw_"))
        .forEach((a) => { weightMap[a.name] = parseInt(a.value) || 0; });
      const linked = await Promise.all(
        rels.map(async (r) => {
          try {
            const n = await trilium.getNote(r.value);
            return { id: n.noteId, title: n.title, via: r.name, weight: weightMap[`sw_${r.name}_${r.value}`] ?? 0 };
          } catch {
            return null;
          }
        })
      );
      return txt(linked.filter(Boolean));
    }
  );

  server.tool(
    "get_incoming_relations",
    `Return all notes that point INTO this note — reverse relation traversal (backlinks).
Shows what is linked TO this note, which get_outgoing_relations cannot reveal.
Returns id+title+relationName triples.`,
    { noteId: z.string().describe("Target note ID") },
    async ({ noteId }) => {
      const backlinks = await trilium.getBacklinks(noteId);
      return txt(backlinks);
    }
  );

  server.tool(
    "find_relation_path",
    `Find the shortest relation path connecting two notes in the knowledge graph.
Uses BFS — returns the chain of notes and the relation names that link them.
Returns null if no path exists within maxDepth hops.

Useful for: "how is concept A connected to concept B?"`,
    {
      fromNoteId: z.string().describe("Starting note ID"),
      toNoteId: z.string().describe("Target note ID"),
      maxDepth: z.number().optional().describe("Maximum hops to search (default: 6)"),
    },
    async ({ fromNoteId, toNoteId, maxDepth }) => {
      const path = await trilium.findNeuralPath(fromNoteId, toNoteId, maxDepth ?? 6);
      if (!path) return txt({ found: false, message: "No path found within maxDepth" });
      return txt({ found: true, hops: path.length - 1, path });
    }
  );

  server.tool(
    "get_note_neighborhood",
    `Return all notes reachable from a starting note within N relation hops.
Builds a local subgraph — useful for understanding the context around a note.
The center node itself is included at depth=0. Optionally filter by a specific relation type.
Returns nodes with depth and the relation that led to them.`,
    {
      noteId: z.string().describe("Starting note ID"),
      depth: z.number().optional().describe("Number of hops (default: 2, max recommended: 3)"),
      relationType: z.string().optional().describe("Filter to a specific relation type"),
    },
    async ({ noteId, depth, relationType }) => {
      const nodes = await trilium.getNeighborhood(noteId, depth ?? 2, relationType);
      return txt({ center: noteId, nodeCount: nodes.length, nodes });
    }
  );

  server.tool(
    "traverse_graph",
    `Walk the knowledge graph from a starting note with full controls.
direction: outbound (follow relations), inbound (follow backlinks), both
relationType: restrict traversal to one relation type (e.g. "extends")
maxDepth: how many hops deep (default: 3)
maxNodes: circuit-breaker for large graphs (default: 50)

Use for: domain mapping, impact analysis, lineage tracing.`,
    {
      noteId: z.string().describe("Starting note ID"),
      direction: z.enum(["outbound", "inbound", "both"]).optional().describe("Traversal direction (default: outbound)"),
      relationType: z.string().optional().describe("Filter to one relation type"),
      maxDepth: z.number().optional().describe("Max hops (default: 3)"),
      maxNodes: z.number().optional().describe("Max nodes to visit (default: 50)"),
    },
    async ({ noteId, direction, relationType, maxDepth, maxNodes }) => {
      const nodes = await trilium.traverseConnectome(noteId, {
        direction: direction ?? "outbound",
        relationType,
        maxDepth: maxDepth ?? 3,
        maxNodes: maxNodes ?? 50,
      });
      return txt({ start: noteId, nodeCount: nodes.length, nodes });
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // STRUCTURED NOTE CREATION (typed note creation)
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "create_thread",
    `Create a properly formatted reasoning thread in Working Memory → Threads.
Threads are active, ephemeral chains of thought. They should eventually be resolved
and either archived or consolidated into Knowledge.

Automatically adds: #noteType=thread  #status=active  #dateOpened`,
    {
      title: z.string().describe("Thread title"),
      context: z.string().optional().describe("Why this thread exists (opening context)"),
      topic: z.string().optional().describe("Topic label value"),
      date: z.string().optional().describe("ISO date (default: today)"),
    },
    async ({ title, context, topic, date }) => {
      const d = date ?? today();
      const parentId = b().workingMemory.threads || b().workingMemory.root;
      const result = await trilium.createNote(parentId, title, threadContent(context ?? "", d));
      const nid = result.note.noteId;
      await Promise.all([
        trilium.addLabel(nid, "noteType", "thread"),
        trilium.addLabel(nid, "status", "active"),
        trilium.addLabel(nid, "dateOpened", d),
        ...(topic ? [trilium.addLabel(nid, "topic", topic)] : []),
        ...(b().templates.thread ? [trilium.addRelation(nid, "template", b().templates.thread)] : []),
      ]);
      return txt({ noteId: nid, title, status: "active", parentId });
    }
  );

  server.tool(
    "create_decision",
    `Create a structured Decision Record in Working Memory → Decisions.
Use the ADR (Architectural Decision Record) format: context → options → decision → rationale → consequences.
Decisions should be promoted to Log → Decisions Made once resolved.

Automatically adds: #noteType=decision  #status=pending  #dateOpened`,
    {
      title: z.string().describe("Decision title (start with 'Decide:' or 'Choose:')"),
      context: z.string().optional().describe("Situation requiring a decision"),
      topic: z.string().optional().describe("Topic label value"),
      date: z.string().optional().describe("ISO date (default: today)"),
    },
    async ({ title, context, topic, date }) => {
      const d = date ?? today();
      const parentId = b().workingMemory.decisions || b().workingMemory.root;
      const result = await trilium.createNote(parentId, title, decisionContent(context ?? ""));
      const nid = result.note.noteId;
      await Promise.all([
        trilium.addLabel(nid, "noteType", "decision"),
        trilium.addLabel(nid, "status", "pending"),
        trilium.addLabel(nid, "dateOpened", d),
        ...(topic ? [trilium.addLabel(nid, "topic", topic)] : []),
        ...(b().templates.decision ? [trilium.addRelation(nid, "template", b().templates.decision)] : []),
      ]);
      return txt({ noteId: nid, title, status: "pending", parentId });
    }
  );

  server.tool(
    "create_concept",
    `Create an atomic concept note in Knowledge → [domain] → Concepts.
Concepts are evergreen, atomic definitions. One concept per note.
If the domain subtree does not exist, call create_domain first.

Automatically adds: #noteType=concept  #domain={domain}`,
    {
      title: z.string().describe("Concept name"),
      domain: z.string().describe("Knowledge domain (e.g. Technology, Philosophy, Business)"),
      domainNoteId: z.string().optional().describe("Parent domain note ID (overrides domain name lookup)"),
      topic: z.string().optional().describe("Topic label for finer grouping"),
    },
    async ({ title, domain, domainNoteId, topic }) => {
      // Locate the domain's Concepts/ subfolder, or fall back to domain root, then knowledge root
      let parentId = domainNoteId;
      if (!parentId) {
        try {
          const res = await trilium.searchNotes(`#noteType=domain #domain="${domain}"`, {
            ancestorNoteId: b().knowledge.root,
            fastSearch: true,
            limit: 1,
          });
          if (res.results[0]) {
            const conceptsRes = await trilium.searchNotes(
              'note.title = "Concepts"',
              { ancestorNoteId: res.results[0].noteId, ancestorDepth: "eq1", fastSearch: false, limit: 1 }
            );
            parentId = conceptsRes.results[0]?.noteId ?? res.results[0].noteId;
          }
        } catch {
          // Fall back to knowledge root
        }
      }
      parentId = parentId ?? b().knowledge.root;

      const result = await trilium.createNote(parentId, title, conceptContent(domain));
      const nid = result.note.noteId;
      await Promise.all([
        trilium.addLabel(nid, "noteType", "concept"),
        trilium.addLabel(nid, "domain", domain),
        ...(topic ? [trilium.addLabel(nid, "topic", topic)] : []),
        ...(b().templates.concept ? [trilium.addRelation(nid, "template", b().templates.concept)] : []),
      ]);
      return txt({ noteId: nid, title, domain, parentId });
    }
  );

  server.tool(
    "create_domain",
    `Create a new knowledge domain subtree under Knowledge.
Each domain gets root + Concepts + References + Notes subdirectories.
Returns all created note IDs for immediate use.`,
    {
      name: z.string().describe("Domain name (e.g. Technology, Philosophy, Finance)"),
    },
    async ({ name }) => {
      const domainRoot = await trilium.createNote(b().knowledge.root, name, domainContent(name));
      const did = domainRoot.note.noteId;
      await Promise.all([
        trilium.addLabel(did, "noteType", "domain"),
        trilium.addLabel(did, "domain", name),
        ...(b().templates.domain ? [trilium.addRelation(did, "template", b().templates.domain)] : []),
      ]);

      // Create standard subdirectories
      const [concepts, references, notes] = await Promise.all([
        trilium.createNote(did, "Concepts", ""),
        trilium.createNote(did, "References", ""),
        trilium.createNote(did, "Notes", ""),
      ]);

      return txt({
        domain: name,
        noteId: did,
        subtree: {
          concepts: concepts.note.noteId,
          references: references.note.noteId,
          notes: notes.note.noteId,
        },
      });
    }
  );

  server.tool(
    "create_opinion",
    `Create a blog/diary-style opinion entry directly under Opinions (no subtrees).
Opinions are prose — stream of consciousness, argument, or stance.
Format: date · mood  →  prose body  →  tags.

Automatically adds: #noteType=opinion  #mood={mood}  #dateWritten`,
    {
      title: z.string().describe("Entry title (can be the thesis or a short label)"),
      mood: z.string().optional().describe("Tone: contemplative | passionate | uncertain | analytical"),
      topics: z.array(z.string()).optional().describe("Topic tags"),
      date: z.string().optional().describe("ISO date (default: today)"),
    },
    async ({ title, mood, topics, date }) => {
      const d = date ?? today();
      const result = await trilium.createNote(b().opinions, title, opinionContent(d, mood ?? "contemplative"));
      const nid = result.note.noteId;
      await Promise.all([
        trilium.addLabel(nid, "noteType", "opinion"),
        trilium.addLabel(nid, "mood", mood ?? "contemplative"),
        trilium.addLabel(nid, "dateWritten", d),
        ...(topics ?? []).map((t) => trilium.addLabel(nid, "topic", t)),
        ...(b().templates.opinion ? [trilium.addRelation(nid, "template", b().templates.opinion)] : []),
      ]);
      return txt({ noteId: nid, title, mood: mood ?? "contemplative", date: d });
    }
  );

  server.tool(
    "create_project",
    `Create a project note with a structured brief under Knowledge → Projects.
Each project gets: Brief root + Decisions subdirectory + Notes subdirectory.

Automatically adds: #noteType=project  #status=active  #dateStarted`,
    {
      title: z.string().describe("Project name"),
      goal: z.string().optional().describe("One-line project goal"),
      topic: z.string().optional().describe("Topic / domain label"),
      date: z.string().optional().describe("ISO start date (default: today)"),
    },
    async ({ title, goal, topic, date }) => {
      const d = date ?? today();
      const projectsId = b().knowledge.projects || b().knowledge.root;
      const root = await trilium.createNote(projectsId, title, projectContent(goal ?? "", d));
      const pid = root.note.noteId;
      await Promise.all([
        trilium.addLabel(pid, "noteType", "project"),
        trilium.addLabel(pid, "status", "active"),
        trilium.addLabel(pid, "dateStarted", d),
        ...(topic ? [trilium.addLabel(pid, "topic", topic)] : []),
        ...(goal ? [trilium.addLabel(pid, "goal", goal)] : []),
        ...(b().templates.projectBrief ? [trilium.addRelation(pid, "template", b().templates.projectBrief)] : []),
      ]);

      const [decisions, notes] = await Promise.all([
        trilium.createNote(pid, "Decisions", ""),
        trilium.createNote(pid, "Notes", ""),
      ]);

      return txt({
        noteId: pid,
        title,
        subtree: {
          decisions: decisions.note.noteId,
          notes: notes.note.noteId,
        },
      });
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // MEMORY / RECALL
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "recall_memory",
    `Search the brain's memory sections for relevant context. Returns content snippets for
top 3 matches and id+title stubs for the rest.
Use at session start to orient before acting, and before creating new notes (avoid duplicates).`,
    {
      query: z.string().describe("What to recall"),
      section: z.enum(["identity","workingMemory","knowledge","opinions","log","all"]).optional(),
      limit: z.number().optional().describe("Max results (default: 10)"),
    },
    async ({ query, section, limit }) => {
      const sectionMap: Record<string, string> = {
        identity:      b().identity.root,
        workingMemory: b().workingMemory.root,
        knowledge:     b().knowledge.root,
        opinions:      b().opinions,
        log:           b().log.root,
      };
      const ancestorNoteId = (!section || section === "all") ? b().root : sectionMap[section];
      const result = await trilium.searchNotes(query, { ancestorNoteId, limit: limit ?? 10 });

      const tops = result.results.slice(0, 3);
      const withContent = await Promise.all(
        tops.map(async (n) => {
          try {
            const content = await trilium.getNoteContent(n.noteId);
            return { id: n.noteId, title: n.title, snippet: content.slice(0, 800) };
          } catch {
            return { id: n.noteId, title: n.title, snippet: "" };
          }
        })
      );

      return txt({ topResults: withContent, otherMatches: result.results.slice(3).map(noteStub) });
    }
  );

  server.tool(
    "store_memory",
    `Persist a new note into the appropriate memory section with standard labels.
  • identity      → facts about the user / system
  • workingMemory → active threads, open questions, current decisions
  • knowledge     → durable facts, how-to, reference material
  • opinions      → use create_opinion for proper diary format
Adds #noteType, #dateStored, and optional #topic label automatically.`,
    {
      section: z.enum(["identity","workingMemory","knowledge","opinions"]).describe("Target section"),
      title: z.string().describe("Short descriptive title"),
      content: z.string().describe("Content to store (plain text or HTML)"),
      topic: z.string().optional().describe("Topic label"),
      subsectionId: z.string().optional().describe("Specific sub-note ID to nest under"),
    },
    async ({ section, title, content, topic, subsectionId }) => {
      const parentMap: Record<string, string> = {
        identity:      b().identity.root,
        workingMemory: b().workingMemory.root,
        knowledge:     b().knowledge.root,
        opinions:      b().opinions,
      };
      const parentNoteId = subsectionId ?? parentMap[section];
      const result = await trilium.createNote(parentNoteId, title, content);
      const nid = result.note.noteId;
      await trilium.addLabel(nid, "noteType", section);
      await trilium.addLabel(nid, "dateStored", today());
      if (topic) await trilium.addLabel(nid, "topic", topic);
      return txt({ noteId: nid, title, section });
    }
  );

  server.tool(
    "update_memory",
    `Update an existing memory note. Snapshots the prior version as a revision first,
then overwrites content. Adds #dateUpdated label.
Use to correct, expand, or supersede stored knowledge rather than creating duplicates.`,
    {
      noteId: z.string().describe("ID of the note to update"),
      content: z.string().describe("New full content"),
      title: z.string().optional().describe("New title (optional)"),
    },
    async ({ noteId, content, title }) => {
      await trilium.createRevision(noteId);
      await trilium.updateNoteContent(noteId, content);
      if (title) await trilium.patchNote(noteId, { title });
      await trilium.addLabel(noteId, "dateUpdated", today());
      return txt({ ok: true, noteId });
    }
  );

  server.tool(
    "manage_thread",
    `Manage reasoning threads in Working Memory → Threads.
  • append — add a timestamped log entry to an existing thread
  • close — mark resolved + append resolution summary
  • list  — return all active threads
Use create_thread to create a new thread with proper formatting.`,
    {
      action: z.enum(["append","close","list"]).describe("Thread action"),
      noteId: z.string().optional().describe("Thread note ID (for append / close)"),
      entry: z.string().optional().describe("Log entry text (for append)"),
      resolution: z.string().optional().describe("Resolution summary (for close)"),
      date: z.string().optional().describe("ISO date (default: today)"),
    },
    async ({ action, noteId, entry, resolution, date }) => {
      const d = date ?? today();

      if (action === "list") {
        const result = await trilium.searchNotes("#noteType=thread #status=active", {
          ancestorNoteId: b().workingMemory.root,
          fastSearch: true,
        });
        return txt(result.results.map(noteStub));
      }

      if (action === "append") {
        if (!noteId) throw new Error("noteId required to append");
        const existing = await trilium.getNoteContent(noteId);
        const entryHtml = `<h3>${d}</h3><p>${entry ?? ""}</p>`;
        // Insert before Resolution section if present
        const updated = existing.includes("<h2>Resolution</h2>")
          ? existing.replace("<h2>Resolution</h2>", `${entryHtml}<h2>Resolution</h2>`)
          : existing + entryHtml;
        await trilium.updateNoteContent(noteId, updated);
        return txt({ ok: true, noteId, action: "appended", date: d });
      }

      if (action === "close") {
        if (!noteId) throw new Error("noteId required to close a thread");
        const existing = await trilium.getNoteContent(noteId);
        const resHtml = `<p>${resolution ?? "Resolved."}</p>`;
        const hasResBlock = /<h2>Resolution<\/h2>/i.test(existing);
        const finalContent = hasResBlock
          ? existing.replace(/<h2>Resolution<\/h2>[\s\S]*$/, `<h2>Resolution</h2>${resHtml}`)
          : existing + `<h2>Resolution</h2>${resHtml}`;
        await trilium.updateNoteContent(noteId, finalContent);
        // Replace #status=active with #status=resolved so list action no longer surfaces this thread
        await trilium.updateLabelValue(noteId, "status", "resolved");
        await trilium.addLabel(noteId, "dateClosed", d);
        return txt({ noteId, action: "closed", date: d });
      }

      throw new Error(`Unknown action: ${action}`);
    }
  );

  server.tool(
    "triage_inbox",
    `Process items from Working Memory → Inbox.
  • list    — return all items currently in the inbox
  • promote — move an item to a proper brain section (threads, knowledge, opinions, or a specific note)
  • discard — permanently delete an inbox item

Use get_inbox_note to find today's Trilium inbox note, or use the static inbox from Working Memory.`,
    {
      action: z.enum(["list","promote","discard"]).describe("Triage action"),
      noteId: z.string().optional().describe("Inbox item note ID (required for promote / discard)"),
      targetSection: z.enum(["workingMemory","knowledge","opinions"]).optional().describe("Destination section (for promote; workingMemory → Threads)"),
      targetNoteId: z.string().optional().describe("Explicit destination note ID (overrides targetSection)"),
    },
    async ({ action, noteId, targetSection, targetNoteId }) => {
      const inboxId = b().workingMemory.inbox || b().workingMemory.root;

      if (action === "list") {
        const inbox = await trilium.getNote(inboxId);
        const items = await Promise.all(
          inbox.childNoteIds.map((cid) => trilium.getNote(cid).catch(() => null))
        );
        return txt(items.filter(Boolean).map((n) => noteStub(n!)));
      }

      if (!noteId) throw new Error("noteId required for promote/discard");

      if (action === "discard") {
        await trilium.deleteNote(noteId);
        return txt({ ok: true, discarded: noteId });
      }

      if (action === "promote") {
        const sectionMap: Record<string, string> = {
          workingMemory: b().workingMemory.threads || b().workingMemory.root,
          knowledge:     b().knowledge.root,
          opinions:      b().opinions,
        };
        const destId = targetNoteId ?? (targetSection ? sectionMap[targetSection] : b().workingMemory.root);
        // Capture existing branch IDs before cloning so we remove all source locations,
        // whether the item came from the static WM inbox or a calendar inbox note.
        const before = await trilium.getNote(noteId);
        const originalBranchIds = [...before.parentBranchIds];
        const newBranch = await trilium.cloneNote(noteId, destId);
        for (const bid of originalBranchIds) {
          await trilium.deleteBranch(bid).catch(() => null);
        }
        await trilium.addLabel(noteId, "status", "triaged");
        return txt({ ok: true, noteId, movedTo: destId, newBranchId: newBranch.branchId });
      }

      throw new Error(`Unknown action: ${action}`);
    }
  );

  server.tool(
    "promote_to_knowledge",
    `Promote a Working Memory note (thread or decision) into durable Knowledge.
Creates a properly labelled Knowledge note from the working memory note,
links them via ~derivedFrom relation (knowledge ← thread), and optionally closes the original thread.

Use when a thread has yielded reusable knowledge worth preserving.`,
    {
      sourceNoteId: z.string().describe("Working memory note to promote"),
      targetTitle: z.string().optional().describe("Title for the new Knowledge note (default: same as source)"),
      domain: z.string().optional().describe("Knowledge domain to nest under"),
      domainNoteId: z.string().optional().describe("Explicit parent note ID (overrides domain lookup)"),
      closeSource: z.boolean().optional().describe("Close / archive the source thread after promotion (default: true)"),
    },
    async ({ sourceNoteId, targetTitle, domain, domainNoteId, closeSource }) => {
      const [sourceMeta, sourceContent] = await Promise.all([
        trilium.getNote(sourceNoteId),
        trilium.getNoteContent(sourceNoteId),
      ]);

      // Determine target parent
      let parentId = domainNoteId;
      if (!parentId && domain) {
        try {
          const res = await trilium.searchNotes(`#noteType=domain #domain="${domain}"`, {
            ancestorNoteId: b().knowledge.root, fastSearch: true, limit: 1,
          });
          parentId = res.results[0]?.noteId;
        } catch {
          // Fall through to knowledge root
        }
      }
      parentId = parentId ?? b().knowledge.root;

      const newTitle = targetTitle ?? sourceMeta.title;
      const result = await trilium.createNote(parentId, newTitle, sourceContent);
      const nid = result.note.noteId;

      const topicLabel = sourceMeta.attributes.find((a) => a.name === "topic");
      const labelResults = await Promise.allSettled([
        trilium.addLabel(nid, "noteType", "knowledge"),
        trilium.addLabel(nid, "dateConsolidated", today()),
        ...(domain ? [trilium.addLabel(nid, "domain", domain)] : []),
        ...(topicLabel ? [trilium.addLabel(nid, "topic", topicLabel.value)] : []),
        trilium.addRelation(nid, "derivedFrom", sourceNoteId),
      ]);
      const labelFailed = labelResults.filter(r => r.status === "rejected").length;

      if (closeSource !== false) {
        // Replace any active/pending status so the thread no longer surfaces in manage_thread list
        await trilium.updateLabelValue(sourceNoteId, "status", "consolidated");
      }

      return txt({ consolidated: nid, source: sourceNoteId, parentId, title: newTitle, labelFailed });
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // MAINTENANCE
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "find_orphan_notes",
    `Find notes in the brain that have no outgoing relations and no meaningful labels.
These are disconnected notes — candidates for linking, enriching, or deleting.
Searches within ancestorNoteId scope (default: knowledge root).`,
    {
      ancestorNoteId: z.string().optional().describe("Subtree to scan (default: knowledge root)"),
      limit: z.number().optional().describe("Max orphans to return (default: 30)"),
    },
    async ({ ancestorNoteId, limit }) => {
      const scopeId = ancestorNoteId ?? b().knowledge.root;
      const result = await trilium.searchNotes("#noteType", { ancestorNoteId: scopeId, limit: 200, fastSearch: true });

      const orphans: Array<{ id: string; title: string; type?: string }> = [];
      for (const n of result.results) {
        try {
          const full = await trilium.getNote(n.noteId);
          const hasRelations = full.attributes.some((a) => a.type === "relation");
          const BOOKKEEPING = new Set([
            "noteType","status","dateStored","dateUpdated","dateConsolidated",
            "dateOpened","dateStarted","dateWritten","dateClosed","sessionDate","mood",
          ]);
          const hasMeaningfulLabels = full.attributes.some(
            (a) => a.type === "label" && !BOOKKEEPING.has(a.name) && !a.name.startsWith("sw_")
          );
          if (!hasRelations && !hasMeaningfulLabels) {
            orphans.push(noteStub(full));
          }
          if (orphans.length >= (limit ?? 30)) break;
        } catch {
          // Skip
        }
      }

      return txt({ orphanCount: orphans.length, orphans });
    }
  );

  server.tool(
    "suggest_connections",
    `Find candidate notes to connect to a given note based on shared labels.
Returns notes that share topic / domain / other labels but have no existing relation.
Ranked by number of shared labels (most similar first).`,
    {
      noteId: z.string().describe("Source note to find connection candidates for"),
      ancestorNoteId: z.string().optional().describe("Scope to subtree (default: knowledge root)"),
      limit: z.number().optional().describe("Max suggestions (default: 10)"),
    },
    async ({ noteId, ancestorNoteId, limit }) => {
      const scopeId = ancestorNoteId ?? b().knowledge.root;
      const suggestions = await trilium.suggestSynapses(noteId, scopeId, limit ?? 10);
      return txt({ suggestions });
    }
  );

  server.tool(
    "bulk_add_label",
    `Apply a label to multiple notes in one call.
Useful for batch-tagging search results, marking a set of notes as reviewed, etc.
Returns counts of successes and failures.`,
    {
      noteIds: z.array(z.string()).describe("Array of note IDs to label"),
      labelName: z.string().describe("Label name"),
      labelValue: z.string().optional().describe("Label value (default: empty flag)"),
      isInheritable: z.boolean().optional().describe("Propagate to children (default: false)"),
    },
    async ({ noteIds, labelName, labelValue, isInheritable }) => {
      const result = await trilium.bulkAddLabel(noteIds, labelName, labelValue ?? "", isInheritable ?? false);
      return txt(result);
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // ATTACHMENTS
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "get_note_attachments",
    "List all attachments on a note. Returns id+title+mime+size stubs.",
    { noteId: z.string().describe("Note ID") },
    async ({ noteId }) => {
      const attachments = await trilium.getNoteAttachments(noteId);
      return txt(attachments.map(attachStub));
    }
  );

  server.tool(
    "get_attachment_content",
    "Return the raw text content of an attachment (for text / code attachments).",
    { attachmentId: z.string().describe("Attachment ID") },
    async ({ attachmentId }) => {
      return txt(await trilium.getAttachmentContent(attachmentId));
    }
  );

  server.tool(
    "create_attachment",
    `Attach a file or text blob to a note.
role: "file" for generic files, "image" for images.
Useful for storing structured exports, diagrams, or supplementary data alongside a note.`,
    {
      ownerId: z.string().describe("Parent note ID"),
      title: z.string().describe("Attachment filename / title"),
      mime: z.string().describe("MIME type e.g. application/json, text/plain, image/png"),
      content: z.string().describe("Text content (base64 for binary)"),
      role: z.enum(["file","image"]).optional().describe("Attachment role (default: file)"),
    },
    async ({ ownerId, title, mime, content, role }) => {
      const att = await trilium.createAttachment(ownerId, title, mime, content, role ?? "file");
      return txt(attachStub(att));
    }
  );

  server.tool(
    "delete_attachment",
    `Permanently delete an attachment from a note. Get attachmentId from get_note_attachments. Irreversible.`,
    { attachmentId: z.string().describe("Attachment ID to delete") },
    async ({ attachmentId }) => {
      await trilium.deleteAttachment(attachmentId);
      return txt({ ok: true, deleted: attachmentId });
    }
  );

  server.tool(
    "update_attachment",
    `Update an attachment's title or MIME type in place.`,
    {
      attachmentId: z.string().describe("Attachment ID"),
      title: z.string().optional().describe("New title"),
      mime: z.string().optional().describe("New MIME type"),
    },
    async ({ attachmentId, title, mime }) => {
      const att = await trilium.updateAttachment(attachmentId, { title, mime });
      return txt(attachStub(att));
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // REVISIONS
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "get_note_revisions",
    "List all saved revisions for a note, newest first. Returns id+title+date+size stubs.",
    { noteId: z.string().describe("Note ID") },
    async ({ noteId }) => {
      const revisions = await trilium.getNoteRevisions(noteId);
      return txt(revisions.map(revStub));
    }
  );

  server.tool(
    "get_revision_content",
    "Return the content of a specific note revision (historical snapshot).",
    { revisionId: z.string().describe("Revision ID from get_note_revisions") },
    async ({ revisionId }) => {
      return txt(await trilium.getRevisionContent(revisionId));
    }
  );

  server.tool(
    "create_note_revision",
    `Manually save a snapshot of a note's current content as a revision.
Always call before making significant automated edits so the prior state is recoverable.`,
    { noteId: z.string().describe("Note ID to snapshot") },
    async ({ noteId }) => {
      await trilium.createRevision(noteId);
      return txt({ ok: true, noteId, snapshotted: new Date().toISOString() });
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // CALENDAR / SPECIAL NOTES
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "get_day_note",
    "Get (or auto-create) today's journal day note. Returns noteId for appending daily records.",
    { date: z.string().optional().describe("YYYY-MM-DD (default: today)") },
    async ({ date }) => txt(await trilium.getDayNote(date ?? today()))
  );

  server.tool(
    "get_week_note",
    "Get (or auto-create) the journal week note. Format: YYYY-Www e.g. 2026-W13.",
    { week: z.string().describe("Week in YYYY-Www format") },
    async ({ week }) => txt(await trilium.getWeekNote(week))
  );

  server.tool(
    "get_month_note",
    "Get (or auto-create) the journal month note. Format: YYYY-MM e.g. 2026-03.",
    { month: z.string().describe("Month in YYYY-MM format") },
    async ({ month }) => txt(await trilium.getMonthNote(month))
  );

  server.tool(
    "get_year_note",
    "Get (or auto-create) the journal year note. Format: YYYY e.g. 2026.",
    { year: z.string().describe("Year in YYYY format") },
    async ({ year }) => txt(await trilium.getYearNote(year))
  );

  server.tool(
    "get_inbox_note",
    `Get the inbox note for a date — the canonical drop zone for unprocessed captures.
Use triage_inbox to process items from here into proper brain sections.`,
    { date: z.string().optional().describe("YYYY-MM-DD (default: today)") },
    async ({ date }) => txt(await trilium.getInboxNote(date ?? today()))
  );

  // ════════════════════════════════════════════════════════════════════════════
  // SYSTEM
  // ════════════════════════════════════════════════════════════════════════════

  server.tool(
    "get_brain_config",
    `Return the current brain structural config (all section root IDs) without any API calls.
Use to verify IDs between sessions without re-running start_brain_session.`,
    {},
    async () => txt(b())
  );

  server.tool(
    "get_app_info",
    "Return Trilium Brain server version, DB version, and runtime metadata. Use for diagnostics.",
    {},
    async () => txt(await trilium.getAppInfo())
  );

  server.tool(
    "create_backup",
    `Trigger a named database backup. Backup file is named brain-{date}.db.
Call at the end of sessions that made significant structural changes.`,
    { date: z.string().optional().describe("ISO date YYYY-MM-DD (default: today)") },
    async ({ date }) => {
      const d = date ?? today();
      await trilium.createBackup(d);
      return txt({ ok: true, backup: `brain-${d}.db` });
    }
  );

  server.tool(
    "bootstrap_brain",
    `Initialize the full Trilium Brain note hierarchy from scratch.
Safe to call on any instance — checks if a brain root already exists before creating anything.

If already initialized: reports live structure, updates brain.json, and reloads config in-place.
If fresh instance: creates the full tree, writes brain.json, and activates config immediately
  — no manual ID copying, no rebuild, no server restart required.

Structure created:
  root → 🧠 Trilium Brain
    ├── 👤 Identity/  (Profile · Preferences · Context)
    ├── 🔄 Working Memory/  (Inbox · Threads · Decisions · Open Questions)
    ├── 📚 Knowledge/  (People · Organizations · Projects)
    ├── 💭 Opinions  (flat — blog/diary)
    ├── 📅 Log/  (Sessions · Decisions Made)
    └── 🗂️ Templates/  (Thread · Decision · Concept · Project · Person · Opinion · Domain)`,
    {},
    async () => {
      // ── Check if brain root already exists ──────────────────────────────────
      if (b().root) {
        try {
          const existing = await trilium.getNote(b().root);
          const children = await Promise.all(
            existing.childNoteIds.map(async (cid) => {
              const child = await trilium.getNote(cid);
              return { id: child.noteId, title: child.title };
            })
          );
          // Refresh brain.json in case it drifted
          const saved = saveConfig(brainRef.config);
          return txt({
            status: "already_initialized",
            message: `Brain structure exists. Config refreshed at: ${saved}`,
            root: { id: existing.noteId, title: existing.title },
            children,
            config: brainRef.config,
          });
        } catch {
          // Root ID in config is stale — fall through to fresh init
        }
      }

      // ── Fresh initialization ─────────────────────────────────────────────────
      const root = await trilium.createNote("root", "Trilium Brain", "");
      await trilium.addLabel(root.note.noteId, "iconClass", "bx bx-brain");
      const rootId = root.note.noteId;

      const identity = await trilium.createNote(rootId, "Identity", "<p><em>Who I am — persistent facts, preferences, and current context.</em></p>");
      const [profile, preferences, context] = await Promise.all([
        trilium.createNote(identity.note.noteId, "Profile", ""),
        trilium.createNote(identity.note.noteId, "Preferences", ""),
        trilium.createNote(identity.note.noteId, "Context", ""),
      ]);

      const wm = await trilium.createNote(rootId, "Working Memory", "<p><em>Ephemeral — threads get resolved, decisions get promoted, inbox gets triaged.</em></p>");
      const [inbox, threads, decisions, openQ] = await Promise.all([
        trilium.createNote(wm.note.noteId, "Inbox", ""),
        trilium.createNote(wm.note.noteId, "Threads", ""),
        trilium.createNote(wm.note.noteId, "Decisions", ""),
        trilium.createNote(wm.note.noteId, "Open Questions", ""),
      ]);

      const knowledge = await trilium.createNote(rootId, "Knowledge", "<p><em>Durable — atomic, evergreen notes organized by domain.</em></p>");
      const [people, orgs, projects] = await Promise.all([
        trilium.createNote(knowledge.note.noteId, "People", ""),
        trilium.createNote(knowledge.note.noteId, "Organizations", ""),
        trilium.createNote(knowledge.note.noteId, "Projects", ""),
      ]);

      const opinions = await trilium.createNote(rootId, "Opinions", "<p><em>Blog/diary entries — prose, arguments, stances. No subtrees.</em></p>");

      const log = await trilium.createNote(rootId, "Log", "<p><em>Temporal records — sessions and promoted decisions.</em></p>");
      const [sessions, decisionsMade] = await Promise.all([
        trilium.createNote(log.note.noteId, "Sessions", ""),
        trilium.createNote(log.note.noteId, "Decisions Made", ""),
      ]);

      const templates = await trilium.createNote(rootId, "Templates", "<p><em>Structural templates — used by create_* tools.</em></p>");
      const [tThread, tDecision, tConcept, tProject, tPerson, tOpinion, tDomain] = await Promise.all([
        trilium.createNote(templates.note.noteId, "Thread",        threadContent("", today())),
        trilium.createNote(templates.note.noteId, "Decision",      decisionContent("")),
        trilium.createNote(templates.note.noteId, "Concept",       conceptContent("general")),
        trilium.createNote(templates.note.noteId, "Project Brief", projectContent("", today())),
        trilium.createNote(templates.note.noteId, "Person",        personContent("", "")),
        trilium.createNote(templates.note.noteId, "Opinion",       opinionContent(today(), "contemplative")),
        trilium.createNote(templates.note.noteId, "Domain",        domainContent("general")),
      ]);

      // ── Build and activate config ────────────────────────────────────────────
      const newConfig = {
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
        },
      };

      // Write to disk and update the live config so all subsequent tool calls
      // in this session use the new IDs immediately — no restart needed.
      const savedPath = saveConfig(newConfig);
      brainRef.config = newConfig;

      return txt({
        status: "initialized",
        message: `Brain bootstrapped. Config written to: ${savedPath}. Ready to use — no restart needed.`,
        config: newConfig,
      });
    }
  );
}

/**
 * tools.ts — MCP tool registrations for the Trilium brain server.
 *
 * TOKEN ECONOMY PHILOSOPHY
 * ────────────────────────
 * Every tool returns the *minimum* data needed for the LLM to act.
 * • List/search tools → id + title (+ type where useful). No content.
 * • Single-note tools → metadata + content only when explicitly requested.
 * • Write tools → echo back only the created/changed identifiers.
 * • Bulk operations accept arrays so the LLM can batch in one call.
 * This keeps context windows lean without losing any capability.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TriliumClient } from "./trilium.js";
import { Trilium } from "./constants.js";

// ── Shared mini-mappers (compact output shapes) ────────────────────────────

const noteStub   = (n: { noteId: string; title: string; type?: string }) =>
  ({ id: n.noteId, title: n.title, ...(n.type ? { type: n.type } : {}) });

const attrStub   = (a: { attributeId: string; noteId: string; type: string; name: string; value: string }) =>
  ({ id: a.attributeId, noteId: a.noteId, type: a.type, name: a.name, value: a.value });

const branchStub = (b: { branchId: string; noteId: string; parentNoteId: string }) =>
  ({ id: b.branchId, noteId: b.noteId, parentNoteId: b.parentNoteId });

const revStub    = (r: { revisionId: string; noteId: string; title: string; utcDateCreated: string; contentLength: number }) =>
  ({ id: r.revisionId, noteId: r.noteId, title: r.title, date: r.utcDateCreated, size: r.contentLength });

const attachStub = (a: { attachmentId: string; title: string; mime: string; contentLength: number }) =>
  ({ id: a.attachmentId, title: a.title, mime: a.mime, size: a.contentLength });

const txt = (obj: unknown) => ({
  content: [{ type: "text" as const, text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }],
});

// ──────────────────────────────────────────────────────────────────────────────
// REGISTRATION
// ──────────────────────────────────────────────────────────────────────────────

export function registerTools(server: McpServer, trilium: TriliumClient): void {

  // ── SESSION / ORIENTATION ──────────────────────────────────────────────────

  server.tool(
    "start_session",
    `Orient the LLM at session start. Returns a compact two-level tree of the Trilium root so
the model knows what note IDs exist before taking any action. Call this once at the beginning
of every session; avoid re-calling it mid-session to save tokens.`,
    {},
    async () => {
      const root = await trilium.getNote(Trilium.root);
      const children = await Promise.all(
        root.childNoteIds.map(async (cid) => {
          const child = await trilium.getNote(cid);
          const grandchildren = await Promise.all(
            child.childNoteIds.map(async (gcid) => {
              const gc = await trilium.getNote(gcid);
              return { id: gc.noteId, title: gc.title };
            })
          );
          return { id: child.noteId, title: child.title, children: grandchildren };
        })
      );
      return txt({ id: root.noteId, title: root.title, children });
    }
  );

  server.tool(
    "log_session",
    `Persist a plain-text summary of what happened this session into the Log section.
Call at the end of every session. The summary becomes durable memory for future sessions.
Keep it factual: decisions made, notes created/modified, open questions left.`,
    {
      summary: z.string().describe("Plain-text summary of this session's activity"),
      date: z.string().optional().describe("ISO date YYYY-MM-DD (defaults to today)"),
    },
    async ({ summary, date }) => {
      const title = date ?? new Date().toISOString().slice(0, 10);
      const result = await trilium.createNote(Trilium.log, title, summary);
      return txt({ noteId: result.note.noteId, title: result.note.title });
    }
  );

  // ── SEARCH ────────────────────────────────────────────────────────────────

  server.tool(
    "search_notes",
    `Full-power Trilium search. Supports:
  • Plain text: "machine learning"
  • Label filter: #topic=AI, #status!=done
  • Date operators: #dateModified =* MONTH, #dateCreated >= 2026-01-01
  • Ancestor scope: limit to a subtree via ancestorNoteId
  • Ordering: orderBy + orderDirection (asc/desc)
  • fastSearch=true skips full-text body scan (much faster for label-only queries)
Returns only id+title+type — call get_note for full content.`,
    {
      query: z.string().describe("Trilium search query"),
      ancestorNoteId: z.string().optional().describe("Limit to this subtree"),
      ancestorDepth: z.string().optional().describe("Depth filter e.g. eq1, lt3, gt2"),
      limit: z.number().optional().describe("Max results (default: unlimited)"),
      orderBy: z.string().optional().describe("Field: title, dateModified, dateCreated, etc."),
      orderDirection: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
      fastSearch: z.boolean().optional().describe("Skip content body scan"),
      includeArchivedNotes: z.boolean().optional().describe("Include archived notes"),
    },
    async ({ query, ancestorNoteId, ancestorDepth, limit, orderBy, orderDirection, fastSearch, includeArchivedNotes }) => {
      const result = await trilium.searchNotes(query, {
        ancestorNoteId, ancestorDepth, limit, orderBy, orderDirection, fastSearch, includeArchivedNotes,
      });
      return txt(result.results.map(noteStub));
    }
  );

  server.tool(
    "search_by_label",
    `Find notes by label name and optional exact value. Shorthand for search_notes with #label syntax.
More concise than constructing the query manually.
Examples: labelName="topic" labelValue="AI" → finds all #topic=AI notes.`,
    {
      labelName: z.string().describe("Label name (no # prefix)"),
      labelValue: z.string().optional().describe("Exact value to match"),
      ancestorNoteId: z.string().optional().describe("Limit to this subtree"),
      limit: z.number().optional().describe("Max results"),
    },
    async ({ labelName, labelValue, ancestorNoteId, limit }) => {
      const query = labelValue != null ? `#${labelName}=${labelValue}` : `#${labelName}`;
      const result = await trilium.searchNotes(query, { ancestorNoteId, limit, fastSearch: true });
      return txt(result.results.map(noteStub));
    }
  );

  server.tool(
    "get_recent_changes",
    `Return the most recently created/modified notes across the whole tree (or a subtree).
Useful for resuming context after a gap: "what changed since last session?"
Returns id+title+date triples, ordered newest-first (up to 50 entries).`,
    {
      ancestorNoteId: z.string().optional().describe("Scope to this subtree (default: entire tree)"),
    },
    async ({ ancestorNoteId }) => {
      const changes = await trilium.getNoteHistory(ancestorNoteId);
      // deduplicate by noteId, keep first (most recent) occurrence
      const seen = new Set<string>();
      const deduped = changes.filter((c) => {
        if (seen.has(c.noteId)) return false;
        seen.add(c.noteId);
        return true;
      }).slice(0, 50);
      return txt(deduped.map((c) => ({ noteId: c.noteId, title: c.current_title, date: c.utcDate })));
    }
  );

  // ── NOTE CRUD ─────────────────────────────────────────────────────────────

  server.tool(
    "get_note",
    `Get full metadata for a note: id, title, type, mime, attributes, parent/child IDs, dates.
Does NOT return content — call get_note_content separately if needed.
Use this to inspect relations, labels, and structure before acting.`,
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
    `Return the raw content of a note. For text notes this is HTML; for code notes it is plain text.
Only call this when you actually need to read or reason over the body — saves tokens vs always bundling metadata+content.`,
    { noteId: z.string().describe("Note ID") },
    async ({ noteId }) => {
      const content = await trilium.getNoteContent(noteId);
      return txt(content);
    }
  );

  server.tool(
    "get_note_with_content",
    `Get both metadata and content for a note in a single call.
Use when you need to read AND act on the note (e.g. update it). For read-only inspection prefer get_note.`,
    { noteId: z.string().describe("Note ID") },
    async ({ noteId }) => {
      const [note, content] = await Promise.all([trilium.getNote(noteId), trilium.getNoteContent(noteId)]);
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
    `Create a new note. Supported types: text, code, book, canvas, mermaid, relationMap, render, search, file, image.
For code notes specify mime e.g. "application/javascript", "text/x-python", "text/x-sql".
Returns the new noteId and branchId only.`,
    {
      parentNoteId: z.string().describe("Parent note ID"),
      title: z.string().describe("Note title"),
      content: z.string().describe("Note body (HTML for text, plain for code)"),
      type: z.enum(["text","code","book","canvas","mermaid","relationMap","render","search","file","image"]).optional().describe("Note type (default: text)"),
      mime: z.string().optional().describe("MIME type (required for code/file/image)"),
    },
    async ({ parentNoteId, title, content, type, mime }) => {
      const result = await trilium.createNote(parentNoteId, title, content, type ?? "text", mime);
      return txt({ noteId: result.note.noteId, branchId: result.branch.branchId, title: result.note.title });
    }
  );

  server.tool(
    "update_note_content",
    `Replace the full content of an existing note. For text notes use HTML; for code notes use plain text.
Trilium auto-saves a revision before update when the note has changed — so history is preserved.`,
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
    `Update note metadata: title, type, or mime. Does not touch content.
Use to rename notes, reclassify their type, or fix MIME after creation.`,
    {
      noteId: z.string().describe("Note ID"),
      title: z.string().optional().describe("New title"),
      type: z.string().optional().describe("New note type"),
      mime: z.string().optional().describe("New MIME type"),
    },
    async ({ noteId, title, type, mime }) => {
      const fields: { title?: string; type?: string; mime?: string } = {};
      if (title != null) fields.title = title;
      if (type  != null) fields.type  = type;
      if (mime  != null) fields.mime  = mime;
      const note = await trilium.patchNote(noteId, fields);
      return txt({ noteId: note.noteId, title: note.title, type: note.type, mime: note.mime });
    }
  );

  server.tool(
    "delete_note",
    `Delete a note and all its branches. If it is the last branch the note is erased; otherwise only the branch is removed.
Prefer archiving (add #archived label) over deletion for knowledge preservation.`,
    { noteId: z.string().describe("Note ID to delete") },
    async ({ noteId }) => {
      await trilium.deleteNote(noteId);
      return txt({ ok: true, deleted: noteId });
    }
  );

  // ── STRUCTURE / CLONING ────────────────────────────────────────────────────

  server.tool(
    "clone_note",
    `Place an existing note into an additional location in the tree (multi-parent branching).
This does NOT copy the note — both locations share the same content. Useful for cross-linking
knowledge into multiple categories without duplication.`,
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
    `Move a note to a new parent by deleting its current branch and creating a new one.
Use when restructuring the knowledge hierarchy.`,
    {
      noteId: z.string().describe("Note to move"),
      fromParentNoteId: z.string().describe("Current parent note ID"),
      toParentNoteId: z.string().describe("Destination parent note ID"),
    },
    async ({ noteId, fromParentNoteId, toParentNoteId }) => {
      // 1. Clone into new parent first (so the note is never orphaned)
      const newBranch = await trilium.cloneNote(noteId, toParentNoteId);
      // 2. Re-fetch to get updated branch list including the new branch
      const freshNote = await trilium.getNote(noteId);
      // 3. Find and delete the old branch from fromParentNoteId
      for (const bid of freshNote.parentBranchIds) {
        if (bid === newBranch.branchId) continue; // skip the one we just created
        const branch = await trilium.getBranch(bid);
        if (branch.parentNoteId === fromParentNoteId) {
          await trilium.deleteBranch(bid);
          break;
        }
      }
      return txt({ ok: true, noteId, movedTo: toParentNoteId, newBranchId: newBranch.branchId });
    }
  );

  // ── ATTRIBUTES ────────────────────────────────────────────────────────────

  server.tool(
    "add_label",
    `Add a #label (key-value tag) to a note. Labels are the primary metadata and search mechanism.
Common patterns for LLM memory:
  #topic=AI, #status=active, #type=decision, #confidence=high
  #reviewed=2026-03-31, #source=claude-session
Set isInheritable=true to propagate the label to all child notes.`,
    {
      noteId: z.string().describe("Target note ID"),
      name: z.string().describe("Label name (no # prefix)"),
      value: z.string().optional().describe("Label value (default: empty = flag label)"),
      isInheritable: z.boolean().optional().describe("Propagate to children (default: false)"),
    },
    async ({ noteId, name, value, isInheritable }) => {
      const attr = await trilium.addLabel(noteId, name, value ?? "", isInheritable ?? false);
      return txt(attrStub(attr));
    }
  );

  server.tool(
    "add_relation",
    `Link two notes via a ~relation. Relations are directional typed edges in the knowledge graph.
Common patterns:
  ~relatedTo, ~supports, ~contradicts, ~dependsOn, ~implements, ~followsUp
  ~template (link note to a template), ~internalLink (soft link)
Relations are traversable — use get_linked_notes to follow them.`,
    {
      fromNoteId: z.string().describe("Source note ID"),
      name: z.string().describe("Relation name (no ~ prefix)"),
      toNoteId: z.string().describe("Target note ID"),
      isInheritable: z.boolean().optional().describe("Propagate to children (default: false)"),
    },
    async ({ fromNoteId, name, toNoteId, isInheritable }) => {
      const attr = await trilium.addRelation(fromNoteId, name, toNoteId, isInheritable ?? false);
      return txt(attrStub(attr));
    }
  );

  server.tool(
    "delete_attribute",
    `Remove a label or relation by its attributeId.
Get the attributeId from get_note's attributes array. Use to clean up stale metadata.`,
    { attributeId: z.string().describe("Attribute ID to delete") },
    async ({ attributeId }) => {
      await trilium.deleteAttribute(attributeId);
      return txt({ ok: true, deleted: attributeId });
    }
  );

  server.tool(
    "get_linked_notes",
    `Return all notes that a given note points to via ~relations.
Use to traverse the knowledge graph: find what a decision depends on, what a concept relates to, etc.
Returns id+title pairs only.`,
    { noteId: z.string().describe("Source note ID") },
    async ({ noteId }) => {
      const notes = await trilium.getLinkedNotes(noteId);
      return txt(notes.map(noteStub));
    }
  );

  // ── ATTACHMENTS ───────────────────────────────────────────────────────────

  server.tool(
    "get_note_attachments",
    `List all attachments on a note (files, images, embedded binaries).
Returns id+title+mime+size. Call get_attachment_content to read one.`,
    { noteId: z.string().describe("Note ID") },
    async ({ noteId }) => {
      const attachments = await trilium.getNoteAttachments(noteId);
      return txt(attachments.map(attachStub));
    }
  );

  server.tool(
    "get_attachment_content",
    "Return the raw text content of an attachment (for text/code attachments).",
    { attachmentId: z.string().describe("Attachment ID") },
    async ({ attachmentId }) => {
      const content = await trilium.getAttachmentContent(attachmentId);
      return txt(content);
    }
  );

  server.tool(
    "create_attachment",
    `Attach a file or text blob to a note. Useful for storing structured data, exports, or
supplementary files alongside a note without polluting its content.
role: "file" for generic files, "image" for images.`,
    {
      ownerId: z.string().describe("Parent note ID"),
      title: z.string().describe("Attachment filename/title"),
      mime: z.string().describe("MIME type e.g. application/json, text/plain, image/png"),
      content: z.string().describe("Text content (base64 for binary)"),
      role: z.enum(["file","image"]).optional().describe("Attachment role (default: file)"),
    },
    async ({ ownerId, title, mime, content, role }) => {
      const att = await trilium.createAttachment(ownerId, title, mime, content, role ?? "file");
      return txt(attachStub(att));
    }
  );

  // ── REVISIONS ─────────────────────────────────────────────────────────────

  server.tool(
    "get_note_revisions",
    `List all saved revisions for a note, newest first.
Revisions are immutable snapshots — useful for auditing what the LLM changed.
Returns id+title+date+size. Call get_revision_content to read a specific version.`,
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
      const content = await trilium.getRevisionContent(revisionId);
      return txt(content);
    }
  );

  server.tool(
    "create_revision",
    `Manually snapshot a note's current content as a named revision.
Call before making significant automated edits so the prior version is always recoverable.`,
    { noteId: z.string().describe("Note ID to snapshot") },
    async ({ noteId }) => {
      await trilium.createRevision(noteId);
      return txt({ ok: true, noteId, snapshotted: new Date().toISOString() });
    }
  );

  // ── CALENDAR / JOURNAL ────────────────────────────────────────────────────

  server.tool(
    "get_day_note",
    `Get (or auto-create) today's journal day note. Returns its noteId so you can append
thoughts, decisions, or summaries to the daily record. Defaults to today.`,
    { date: z.string().optional().describe("YYYY-MM-DD (default: today)") },
    async ({ date }) => {
      const d = date ?? new Date().toISOString().slice(0, 10);
      return txt(await trilium.getDayNote(d));
    }
  );

  server.tool(
    "get_week_note",
    "Get (or auto-create) the journal week note for a given week. Format: YYYY-Www e.g. 2026-W13.",
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
    `Get the inbox note for a date — the canonical drop zone for unprocessed ideas.
If a #inbox-labelled note exists it is returned; otherwise the day note is used.`,
    { date: z.string().optional().describe("YYYY-MM-DD (default: today)") },
    async ({ date }) => {
      const d = date ?? new Date().toISOString().slice(0, 10);
      return txt(await trilium.getInboxNote(d));
    }
  );

  // ── MEMORY / KNOWLEDGE SECTION SHORTCUTS ──────────────────────────────────

  server.tool(
    "memory_recall",
    `Search within the LLM's own memory sections (Identity, Working Memory, Knowledge, Opinions).
More focused than search_notes — scoped to the Trilium root subtree and returns content snippets.
Use at session start to recall relevant context before answering.`,
    {
      query: z.string().describe("What to recall"),
      section: z.enum(["identity","workingMemory","knowledge","opinions","all"]).optional().describe("Which section to search (default: all)"),
      limit: z.number().optional().describe("Max results (default: 10)"),
    },
    async ({ query, section, limit }) => {
      const ancestorMap: Record<string, string> = {
        identity: Trilium.identity,
        workingMemory: Trilium.workingMemory.root,
        knowledge: Trilium.knowledge,
        opinions: Trilium.opinions,
      };
      const ancestorNoteId = (!section || section === "all") ? Trilium.root : ancestorMap[section];
      const result = await trilium.searchNotes(query, { ancestorNoteId, limit: limit ?? 10 });
      // For recall, include content of top results (up to 3, truncated to 800 chars each)
      const tops = result.results.slice(0, 3);
      const withContent = await Promise.all(
        tops.map(async (n) => {
          try {
            const content = await trilium.getNoteContent(n.noteId);
            return { id: n.noteId, title: n.title, content: content.slice(0, 800) };
          } catch {
            return { id: n.noteId, title: n.title, content: "" };
          }
        })
      );
      const rest = result.results.slice(3).map(noteStub);
      return txt({ topResults: withContent, otherMatches: rest });
    }
  );

  server.tool(
    "memory_store",
    `Persist a piece of information into the appropriate memory section.
  • identity → facts about the user/system/personality
  • workingMemory → active threads, open questions, current decisions
  • knowledge → durable facts, how-to, reference material
  • opinions → preferences, evaluations, stances
Automatically adds #llmMemory label + a #topic label if provided.
Returns the new noteId.`,
    {
      section: z.enum(["identity","workingMemory","knowledge","opinions"]).describe("Which section to store in"),
      title: z.string().describe("Short descriptive title"),
      content: z.string().describe("The information to store (plain text or HTML)"),
      topic: z.string().optional().describe("Topic label value e.g. 'AI', 'project-x'"),
      subsection: z.string().optional().describe("Optional sub-note ID within the section to nest under"),
    },
    async ({ section, title, content, topic, subsection }) => {
      const parentMap: Record<string, string> = {
        identity: Trilium.identity,
        workingMemory: Trilium.workingMemory.root,
        knowledge: Trilium.knowledge,
        opinions: Trilium.opinions,
      };
      const parentNoteId = subsection ?? parentMap[section];
      const result = await trilium.createNote(parentNoteId, title, content);
      const noteId = result.note.noteId;
      // Tag with standard labels
      await trilium.addLabel(noteId, "llmMemory", section);
      if (topic) await trilium.addLabel(noteId, "topic", topic);
      await trilium.addLabel(noteId, "dateStored", new Date().toISOString().slice(0, 10));
      return txt({ noteId, title, section });
    }
  );

  server.tool(
    "memory_update",
    `Update an existing memory note's content. Automatically snapshots the previous version as a revision first.
Use to correct, expand, or supersede stored knowledge rather than creating duplicates.`,
    {
      noteId: z.string().describe("ID of the memory note to update"),
      content: z.string().describe("New full content"),
      title: z.string().optional().describe("New title (optional)"),
    },
    async ({ noteId, content, title }) => {
      await trilium.createRevision(noteId); // snapshot before overwriting
      await trilium.updateNoteContent(noteId, content);
      if (title) await trilium.patchNote(noteId, { title });
      await trilium.addLabel(noteId, "dateUpdated", new Date().toISOString().slice(0, 10));
      return txt({ ok: true, noteId });
    }
  );

  server.tool(
    "working_memory_thread",
    `Manage active threads in Working Memory. An "active thread" is an ongoing task or topic
the LLM is tracking across sessions. Action:
  • open  — create a new thread note under Active Threads
  • close — add #status=closed label + move to Decisions if resolved
  • list  — return all open threads`,
    {
      action: z.enum(["open","close","list"]).describe("What to do"),
      title: z.string().optional().describe("Thread title (for open)"),
      content: z.string().optional().describe("Thread description (for open)"),
      noteId: z.string().optional().describe("Thread noteId (for close)"),
      resolution: z.string().optional().describe("Resolution summary (for close)"),
    },
    async ({ action, title, content, noteId, resolution }) => {
      if (action === "list") {
        const result = await trilium.searchNotes("#llmThread #status!=closed", {
          ancestorNoteId: Trilium.workingMemory.activeThreads,
          fastSearch: true,
        });
        return txt(result.results.map(noteStub));
      }

      if (action === "open") {
        if (!title) throw new Error("title is required to open a thread");
        const result = await trilium.createNote(Trilium.workingMemory.activeThreads, title, content ?? "");
        const nid = result.note.noteId;
        await trilium.addLabel(nid, "llmThread", "");
        await trilium.addLabel(nid, "status", "open");
        await trilium.addLabel(nid, "dateOpened", new Date().toISOString().slice(0, 10));
        return txt({ noteId: nid, title, action: "opened" });
      }

      if (action === "close") {
        if (!noteId) throw new Error("noteId is required to close a thread");
        if (resolution) {
          const existing = await trilium.getNoteContent(noteId);
          await trilium.updateNoteContent(noteId, existing + `\n\n## Resolution\n${resolution}`);
        }
        await trilium.addLabel(noteId, "status", "closed");
        await trilium.addLabel(noteId, "dateClosed", new Date().toISOString().slice(0, 10));
        return txt({ noteId, action: "closed" });
      }

      throw new Error(`Unknown action: ${action}`);
    }
  );

  // ── SYSTEM / BACKUP ────────────────────────────────────────────────────────

  server.tool(
    "get_app_info",
    "Return Trilium version, DB version, and server metadata. Useful for diagnostics.",
    {},
    async () => {
      const info = await trilium.getAppInfo();
      return txt(info);
    }
  );

  server.tool(
    "create_backup",
    `Trigger a named database backup. The backup file will be named brain-{date}.db.
Call at the end of sessions that made significant changes to the knowledge base.`,
    { date: z.string().optional().describe("ISO date YYYY-MM-DD (default: today)") },
    async ({ date }) => {
      const d = date ?? new Date().toISOString().slice(0, 10);
      await trilium.createBackup(d);
      return txt({ ok: true, backup: `brain-${d}.db` });
    }
  );

  // ── INITIALISATION ────────────────────────────────────────────────────────

  server.tool(
    "initialize_trilium",
    `Bootstrap the full Trilium note structure from scratch. Safe to call on any environment:
  • If the structure already exists (constants.ts IDs are valid) it reports the live IDs and skips creation.
  • If this is a fresh Trilium instance it creates the full hierarchy and returns all new noteIds.

After running on a fresh instance:
  1. Copy the returned noteIds into constants.ts
  2. Run: bun run build
  3. Restart the MCP server

Structure created:
  root → Trilium (#iconClass=bx bx-brain)
    ├── Identity
    ├── Working Memory
    │   ├── Active Threads
    │   ├── Decisions
    │   └── Open Questions
    ├── Knowledge
    ├── Opinions
    └── Log`,
    {},
    async () => {
      // ── 1. Check if the structure already exists ──────────────────────────
      const { Trilium: T } = await import("./constants.js");
      try {
        const existing = await trilium.getNote(T.root);
        // Root exists — report live state without creating anything
        const children = await Promise.all(
          existing.childNoteIds.map(async (cid) => {
            const child = await trilium.getNote(cid);
            return { id: child.noteId, title: child.title };
          })
        );
        return txt({
          status: "already_initialized",
          message: "Structure already exists. No changes made.",
          root: { id: existing.noteId, title: existing.title },
          children,
          constants: {
            root: T.root,
            identity: T.identity,
            workingMemory: T.workingMemory,
            knowledge: T.knowledge,
            opinions: T.opinions,
            log: T.log,
          },
        });
      } catch {
        // Root note not found — proceed with fresh initialization
      }

      // ── 2. Fresh initialization ───────────────────────────────────────────
      const created: Record<string, string> = {};

      const root = await trilium.createNote("root", "Trilium", "");
      created["Trilium"] = root.note.noteId;
      await trilium.addLabel(root.note.noteId, "iconClass", "bx bx-brain");

      const sections = ["Identity", "Working Memory", "Knowledge", "Opinions", "Log"] as const;
      const sectionIds: Record<string, string> = {};
      for (const s of sections) {
        const r = await trilium.createNote(root.note.noteId, s, "");
        sectionIds[s] = r.note.noteId;
        created[s] = r.note.noteId;
      }

      const wmChildren = ["Active Threads", "Decisions", "Open Questions"] as const;
      for (const s of wmChildren) {
        const r = await trilium.createNote(sectionIds["Working Memory"], s, "");
        created[s] = r.note.noteId;
      }

      // ── 3. Build the constants.ts snippet for easy copy-paste ─────────────
      const wmId = created["Working Memory"];
      const constantsSnippet = `export const Trilium = {
  root: "${created["Trilium"]}",
  identity: "${created["Identity"]}",
  workingMemory: {
    root: "${wmId}",
    activeThreads: "${created["Active Threads"]}",
    decisions: "${created["Decisions"]}",
    openQuestions: "${created["Open Questions"]}",
  },
  knowledge: "${created["Knowledge"]}",
  opinions: "${created["Opinions"]}",
  log: "${created["Log"]}",
} as const;`;

      return txt({
        status: "initialized",
        message: "Structure created. Copy constants below into src/constants.ts then run: bun run build",
        noteIds: created,
        constants_ts: constantsSnippet,
      });
    }
  );
}

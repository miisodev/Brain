/**
 * tools-advanced.ts — low-level surface, registered only with BRAIN_MODE=full
 *
 * These are the v3 power tools: raw CRUD, attribute surgery, attachments,
 * revisions, calendar notes, graph internals. The core surface (tools.ts)
 * covers every routine memory operation — this exists for debugging,
 * data surgery, and users who want direct ETAPI access.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TriliumClient } from "./trilium.js";
import type { BrainConfig } from "./config.js";
import { SynapseTypes } from "./types.js";

const txt = (obj: unknown) => ({
  content: [{ type: "text" as const, text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }],
});
const today = () => new Date().toISOString().slice(0, 10);

const noteStub = (n: { noteId: string; title: string; type?: string }) => ({
  id: n.noteId,
  title: n.title,
  ...(n.type ? { type: n.type } : {}),
});

const attrStub = (a: { attributeId: string; noteId: string; type: string; name: string; value: string }) => ({
  id: a.attributeId, noteId: a.noteId, type: a.type, name: a.name, value: a.value,
});

export function registerAdvancedTools(
  server: McpServer,
  trilium: TriliumClient,
  brainRef: { config: BrainConfig }
): void {
  const b = () => brainRef.config;

  // ── Search ──────────────────────────────────────────────────────────────────

  server.tool(
    "search_notes",
    `Raw Trilium query search (advanced). Supports the native query language:
#label=value, note.title =* "x", date operators, AND/OR. Prefer recall() for memory lookup.`,
    {
      query: z.string().describe("Trilium search query"),
      ancestorNoteId: z.string().optional().describe("Limit to this subtree"),
      limit: z.number().optional(),
      orderBy: z.string().optional().describe("title | dateModified | dateCreated"),
      orderDirection: z.enum(["asc", "desc"]).optional(),
      fastSearch: z.boolean().optional().describe("Skip content body scan"),
      includeArchived: z.boolean().optional(),
      debug: z.boolean().optional().describe("Return query parse debug info"),
    },
    async ({ query, ancestorNoteId, limit, orderBy, orderDirection, fastSearch, includeArchived, debug }) => {
      const result = await trilium.searchNotes(query, {
        ancestorNoteId: ancestorNoteId ?? b().root,
        limit, orderBy, orderDirection, fastSearch,
        includeArchivedNotes: includeArchived, debug,
      });
      const out: Record<string, unknown> = { results: result.results.map(noteStub) };
      if (result.debugInfo !== undefined) out.debugInfo = result.debugInfo;
      return txt(out);
    }
  );

  server.tool(
    "get_recent_notes",
    "Most recently modified notes (up to 50), newest first. Scoped to the brain by default.",
    { ancestorNoteId: z.string().optional() },
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

  // ── Raw note CRUD ───────────────────────────────────────────────────────────

  server.tool(
    "create_note",
    "Create a raw note at an explicit location (advanced — remember() routes automatically). Supports code/canvas/mermaid/etc types.",
    {
      parentNoteId: z.string(),
      title: z.string(),
      content: z.string(),
      type: z.enum(["text","code","book","canvas","mermaid","relationMap","render","search","file","image"]).optional(),
      mime: z.string().optional(),
    },
    async ({ parentNoteId, title, content, type, mime }) => {
      const result = await trilium.createNote(parentNoteId, title, content, type ?? "text", mime);
      return txt({ noteId: result.note.noteId, branchId: result.branch.branchId, title: result.note.title });
    }
  );

  server.tool(
    "update_note_content",
    "Replace a note's full content without snapshotting (advanced — prefer revise()).",
    { noteId: z.string(), content: z.string() },
    async ({ noteId, content }) => {
      await trilium.updateNoteContent(noteId, content);
      return txt({ ok: true, noteId });
    }
  );

  server.tool(
    "patch_note",
    "Mutate note metadata: title, type, or mime (advanced).",
    {
      noteId: z.string(),
      title: z.string().optional(),
      type: z.string().optional(),
      mime: z.string().optional(),
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
    "Hard-delete a note immediately (advanced — prefer forget(), which archives and checks backlinks).",
    { noteId: z.string() },
    async ({ noteId }) => {
      await trilium.deleteNote(noteId);
      return txt({ ok: true, deleted: noteId });
    }
  );

  // ── Structure ───────────────────────────────────────────────────────────────

  server.tool(
    "clone_note",
    "Place a note in an additional location (multi-parent branch; shared content, no copy).",
    { noteId: z.string(), parentNoteId: z.string(), prefix: z.string().optional() },
    async ({ noteId, parentNoteId, prefix }) => {
      const branch = await trilium.cloneNote(noteId, parentNoteId, prefix);
      return txt({ id: branch.branchId, noteId: branch.noteId, parentNoteId: branch.parentNoteId });
    }
  );

  server.tool(
    "move_note",
    "Move a note to a new parent (new branch created before old is removed).",
    { noteId: z.string(), fromParentNoteId: z.string(), toParentNoteId: z.string() },
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

  // ── Attributes ──────────────────────────────────────────────────────────────

  server.tool(
    "set_label",
    "Set a #label to a value — updates in place if it exists (deduping extras), adds otherwise.",
    {
      noteId: z.string(),
      name: z.string().describe("Label name (no # prefix)"),
      value: z.string().optional().describe("Value (empty = boolean flag)"),
    },
    async ({ noteId, name, value }) => {
      const attr = await trilium.updateLabelValue(noteId, name, value ?? "");
      return txt(attrStub(attr));
    }
  );

  server.tool(
    "add_relation",
    "Create a raw relation with any name (advanced — connect() enforces the canonical vocabulary).",
    {
      fromNoteId: z.string(),
      relationName: z.string(),
      toNoteId: z.string(),
      isInheritable: z.boolean().optional(),
    },
    async ({ fromNoteId, relationName, toNoteId, isInheritable }) => {
      const attr = await trilium.addRelation(fromNoteId, relationName, toNoteId, isInheritable ?? false);
      return txt(attrStub(attr));
    }
  );

  server.tool(
    "delete_attribute",
    "Delete any label or relation by raw attributeId (from read_note / get_note output).",
    { attributeId: z.string() },
    async ({ attributeId }) => {
      await trilium.deleteAttribute(attributeId);
      return txt({ ok: true, deleted: attributeId });
    }
  );

  server.tool(
    "strengthen_relation",
    "Increment the Hebbian weight on a relation (sw_* label) after a traversal proved useful.",
    { fromNoteId: z.string(), relationName: z.string(), toNoteId: z.string() },
    async ({ fromNoteId, relationName, toNoteId }) => {
      const result = await trilium.strengthenSynapse(fromNoteId, relationName, toNoteId);
      return txt({ fromNoteId, relationName, toNoteId, ...result });
    }
  );

  server.tool(
    "weaken_relation",
    "Decrement the Hebbian weight on a relation; the weight label is removed at zero.",
    { fromNoteId: z.string(), relationName: z.string(), toNoteId: z.string(), by: z.number().int().min(1).optional() },
    async ({ fromNoteId, relationName, toNoteId, by }) => {
      const result = await trilium.weakenSynapse(fromNoteId, relationName, toNoteId, by ?? 1);
      return txt({ fromNoteId, relationName, toNoteId, ...result });
    }
  );

  server.tool(
    "get_relation_types",
    "All distinct relation names in use across the brain, plus the canonical vocabulary.",
    { ancestorNoteId: z.string().optional() },
    async ({ ancestorNoteId }) => {
      const types = await trilium.listSynapseTypes(ancestorNoteId ?? b().root);
      return txt({ relationTypes: types, canonical: SynapseTypes });
    }
  );

  // ── Maintenance helpers ─────────────────────────────────────────────────────

  server.tool(
    "bulk_set_label",
    "Apply a label to many notes in one call (uses set semantics per note — no duplicates).",
    {
      noteIds: z.array(z.string()),
      labelName: z.string(),
      labelValue: z.string().optional(),
    },
    async ({ noteIds, labelName, labelValue }) => {
      const success: string[] = [];
      const failed: string[] = [];
      await Promise.all(
        noteIds.map(async (id) => {
          try {
            await trilium.updateLabelValue(id, labelName, labelValue ?? "");
            success.push(id);
          } catch {
            failed.push(id);
          }
        })
      );
      return txt({ success, failed });
    }
  );

  server.tool(
    "suggest_connections",
    "Candidate connections for a note based on shared labels, ranked by overlap.",
    {
      noteId: z.string(),
      ancestorNoteId: z.string().optional(),
      limit: z.number().optional(),
    },
    async ({ noteId, ancestorNoteId, limit }) => {
      const suggestions = await trilium.suggestSynapses(noteId, ancestorNoteId ?? b().knowledge.root, limit ?? 10);
      return txt({ suggestions });
    }
  );

  // ── Attachments ─────────────────────────────────────────────────────────────

  server.tool(
    "get_note_attachments",
    "List attachments on a note (id + title + mime + size).",
    { noteId: z.string() },
    async ({ noteId }) => {
      const attachments = await trilium.getNoteAttachments(noteId);
      return txt(attachments.map((a) => ({ id: a.attachmentId, title: a.title, mime: a.mime, size: a.contentLength })));
    }
  );

  server.tool(
    "get_attachment_content",
    "Read the raw content of a text/code attachment.",
    { attachmentId: z.string() },
    async ({ attachmentId }) => txt(await trilium.getAttachmentContent(attachmentId))
  );

  server.tool(
    "create_attachment",
    "Attach a file or text blob to a note (role: file | image).",
    {
      ownerId: z.string(),
      title: z.string(),
      mime: z.string(),
      content: z.string().describe("Text content (base64 for binary)"),
      role: z.enum(["file", "image"]).optional(),
    },
    async ({ ownerId, title, mime, content, role }) => {
      const att = await trilium.createAttachment(ownerId, title, mime, content, role ?? "file");
      return txt({ id: att.attachmentId, title: att.title, mime: att.mime, size: att.contentLength });
    }
  );

  server.tool(
    "delete_attachment",
    "Permanently delete an attachment. Irreversible.",
    { attachmentId: z.string() },
    async ({ attachmentId }) => {
      await trilium.deleteAttachment(attachmentId);
      return txt({ ok: true, deleted: attachmentId });
    }
  );

  // ── Revisions ───────────────────────────────────────────────────────────────

  server.tool(
    "get_note_revisions",
    "List saved revisions for a note, newest first.",
    { noteId: z.string() },
    async ({ noteId }) => {
      const revisions = await trilium.getNoteRevisions(noteId);
      return txt(revisions.map((r) => ({ id: r.revisionId, title: r.title, date: r.utcDateCreated, size: r.contentLength })));
    }
  );

  server.tool(
    "get_revision_content",
    "Content of a historical revision snapshot.",
    { revisionId: z.string() },
    async ({ revisionId }) => txt(await trilium.getRevisionContent(revisionId))
  );

  server.tool(
    "create_note_revision",
    "Manually snapshot a note's current content as a revision.",
    { noteId: z.string() },
    async ({ noteId }) => {
      await trilium.createRevision(noteId);
      return txt({ ok: true, noteId });
    }
  );

  // ── Calendar ────────────────────────────────────────────────────────────────

  server.tool(
    "get_day_note",
    "Get (or auto-create) the Trilium journal day note. Format: YYYY-MM-DD.",
    { date: z.string().optional() },
    async ({ date }) => txt(await trilium.getDayNote(date ?? today()))
  );

  server.tool(
    "get_week_note",
    "Get (or auto-create) the journal week note. Format: YYYY-Www.",
    { week: z.string() },
    async ({ week }) => txt(await trilium.getWeekNote(week))
  );

  server.tool(
    "get_month_note",
    "Get (or auto-create) the journal month note. Format: YYYY-MM.",
    { month: z.string() },
    async ({ month }) => txt(await trilium.getMonthNote(month))
  );

  server.tool(
    "get_year_note",
    "Get (or auto-create) the journal year note. Format: YYYY.",
    { year: z.string() },
    async ({ year }) => txt(await trilium.getYearNote(year))
  );

  // ── System ──────────────────────────────────────────────────────────────────

  server.tool(
    "get_brain_config",
    "Current brain structural config (all section IDs + lifecycle policy). No API calls.",
    {},
    async () => txt(b())
  );

  server.tool(
    "get_app_info",
    "Trilium server version, DB version, runtime metadata.",
    {},
    async () => txt(await trilium.getAppInfo())
  );

  server.tool(
    "create_backup",
    "Trigger a named database backup (brain-{date}.db). end_session does this automatically.",
    { date: z.string().optional() },
    async ({ date }) => {
      const d = date ?? today();
      await trilium.createBackup(d);
      return txt({ ok: true, backup: `brain-${d}.db` });
    }
  );
}

# Full Mode — Advanced Tool Reference

`BRAIN_MODE=full` is active. These tools are available alongside the core surface.

**Ground rule:** Use the core surface (`remember`, `recall`, `revise`, `resolve`, `connect`, `forget`) for all routine memory operations. Reach for full-mode only when the high-level path genuinely cannot do the job — these tools bypass the server's normalization, lifecycle, and dedup guarantees, so correctness is on you.

---

## Search & Discovery

| Tool | Signature | Use when |
|---|---|---|
| `search_notes` | `(query, ancestorNoteId?, limit?, orderBy?, orderDirection?, fastSearch?, includeArchived?, debug?)` | Raw Trilium query language — when `recall()` isn't precise enough. |
| `get_recent_notes` | `(ancestorNoteId?)` | Up to 50 most recently modified notes, newest first. Scoped to the brain by default. |

**`search_notes` query language:** `#noteType=reference`, `#status=active`, `note.title =* "brain"` (contains), `note.dateModified > MONTH-1`, `#topic=ai-tooling`. Combine with `AND`/`OR`.

---

## Raw Note CRUD

These bypass `remember()`'s routing, dedup, and lifecycle. Use only for note types or locations the high-level surface cannot express — code notes, canvas, mermaid diagrams, explicit placement under a non-brain parent.

| Tool | Signature | Notes |
|---|---|---|
| `create_note` | `(parentNoteId, title, content, type?, mime?)` | `type` ∈ `text` `code` `book` `canvas` `mermaid` `relationMap` `render` `search` `file` `image`. No dedup, no lifecycle labels. |
| `update_note_content` | `(noteId, content)` | Full replace, no snapshot. Prefer `revise()` which auto-snapshots first. |
| `patch_note` | `(noteId, title?, type?, mime?)` | Mutate metadata only — does not touch content or labels. |
| `delete_note` | `(noteId)` | Hard-delete immediately. Prefer `forget()` which checks backlinks and archives in place. |

---

## Structure

| Tool | Signature | Notes |
|---|---|---|
| `clone_note` | `(noteId, parentNoteId, prefix?)` | Multi-parent branch — shared content, not a copy. Both locations show the same note. |
| `move_note` | `(noteId, fromParentNoteId, toParentNoteId)` | Creates the new branch then removes the old one. |

---

## Attributes

| Tool | Signature | Notes |
|---|---|---|
| `set_label` | `(noteId, name, value?)` | Upsert a `#label` — updates in place if it exists, deduplicates extras. `value` omitted = boolean flag. |
| `add_relation` | `(fromNoteId, relationName, toNoteId, isInheritable?)` | Any relation name — bypasses the closed vocabulary. Use `connect()` for canonical relations. |
| `delete_attribute` | `(attributeId)` | Remove any label or relation by raw `attributeId` (from `read_note` output). |
| `get_relation_types` | `(ancestorNoteId?)` | All distinct relation names in use, plus the canonical vocabulary. |

---

## Hebbian Weights

Synaptic weights (`#sw_{type}_{targetId}` labels) record how many times a relation traversal proved useful. They decay to zero and the label is removed. Use these when you want the graph to reflect actual retrieval utility over time — not just that a connection exists, but that it keeps paying off.

| Tool | Signature | Notes |
|---|---|---|
| `strengthen_relation` | `(fromNoteId, relationName, toNoteId)` | Increment weight +1 after a traversal proved useful. |
| `weaken_relation` | `(fromNoteId, relationName, toNoteId, by?)` | Decrement weight (default -1). Label removed at zero. |
| `suggest_connections` | `(noteId, ancestorNoteId?, limit?)` | Candidate connections ranked by shared-label overlap. Surfaces non-obvious links worth wiring with `connect()`. |

---

## Bulk Operations

| Tool | Signature | Notes |
|---|---|---|
| `bulk_set_label` | `(noteIds[], labelName, labelValue?)` | Apply a label to many notes in one call. Upsert semantics per note — no duplicates. Returns `{ success[], failed[] }`. |

---

## Attachments

Attachments live on a note but are not part of its content body. Use for binary files, images, or large text blobs that shouldn't be inline.

| Tool | Signature | Notes |
|---|---|---|
| `get_note_attachments` | `(noteId)` | List all attachments: `{ id, title, mime, size }`. |
| `get_attachment_content` | `(attachmentId)` | Read raw content of a text or code attachment. |
| `create_attachment` | `(ownerId, title, mime, content, role?)` | Attach to a note. `role` ∈ `file` (default) `image`. `content` is text or base64 for binary. |
| `delete_attachment` | `(attachmentId)` | Permanent hard-delete. Irreversible. |

---

## Revisions

`revise()` snapshots automatically before every write. These tools give you manual control and read access to the history — useful when you need to audit what changed or recover from a bad `update_note_content` call.

| Tool | Signature | Notes |
|---|---|---|
| `get_note_revisions` | `(noteId)` | List saved snapshots, newest first: `{ id, title, date, size }`. |
| `get_revision_content` | `(revisionId)` | Read the content of a historical snapshot. |
| `create_note_revision` | `(noteId)` | Manually snapshot current content before a destructive write. |

---

## Calendar / Journal

Trilium's built-in journal creates one note per day/week/month/year, auto-created on first access. These are standard Trilium notes — attach content, labels, or relations to them normally.

| Tool | Signature | Notes |
|---|---|---|
| `get_day_note` | `(date?)` | Format: `YYYY-MM-DD`. Defaults to today. |
| `get_week_note` | `(week)` | Format: `YYYY-Www` (e.g. `2026-W23`). |
| `get_month_note` | `(month)` | Format: `YYYY-MM`. |
| `get_year_note` | `(year)` | Format: `YYYY`. |

---

## System

| Tool | Signature | Notes |
|---|---|---|
| `get_brain_config` | `()` | All structural note IDs + lifecycle `policy` block. No API calls — reads from `brain.json`. |
| `get_app_info` | `()` | Trilium server version, DB schema version, runtime metadata. |
| `create_backup` | `(date?)` | Named DB backup (`brain-{date}.db`). `end_session` does this automatically — call manually before bulk surgery. |

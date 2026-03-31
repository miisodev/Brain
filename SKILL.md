# Trilium Brain MCP — LLM Skill Guide

You have access to a Trilium Brain MCP server. This gives you a **persistent, structured knowledge base and memory system** that survives across sessions. Use it proactively — it is your long-term memory.

---

## What this is

Trilium is a hierarchical note-taking application. The MCP server exposes its full API as tools you can call. Notes are the atomic unit — they have a title, typed content, labels (key-value tags), relations (typed edges to other notes), attachments, and revision history. Notes live in a tree but can be in multiple places at once via branches.

Your memory lives inside a dedicated subtree with five sections:

```
Trilium
├── Identity          — facts about the user, preferences, personality, context
├── Working Memory    — active threads, open questions, in-flight decisions
│   ├── Active Threads
│   ├── Decisions
│   └── Open Questions
├── Knowledge         — durable facts, how-to guides, reference material
├── Opinions          — evaluations, preferences, stances on topics
└── Log               — one note per session date (YYYY-MM-DD)
```

---

## Session protocol

Follow this order every session:

### 1. Orient (start of session)
Call `start_session` once. It returns the two-level tree of your memory root so you know what IDs exist. Do not call it again mid-session — use the IDs from the first call.

### 2. Recall relevant context (if needed)
Before answering a question that might touch stored knowledge, call `memory_recall` with the relevant topic. It returns content snippets from the top matching notes. This is cheaper than `search_notes` because it is already scoped to your memory sections.

### 3. Act
Use the appropriate tools below. When in doubt about whether something is stored, search before creating — avoid duplicates.

### 4. Persist (end of session)
- Call `log_session` with a factual plain-text summary: what was decided, what was created or modified, what questions are open.
- Call `create_backup` if you made significant changes to the knowledge base.

---

## Tool reference

### Session

**`start_session`**
Returns the two-level memory tree. Call once per session to orient yourself. Tells you what sections and child note IDs exist.

**`log_session(summary, date?)`**
Creates a dated note under Log with your session summary. The summary should be factual and concise: decisions made, notes touched, open threads. This is your primary persistence mechanism across sessions.

---

### Memory (high-level — use these first)

**`memory_recall(query, section?, limit?)`**
Search your own memory sections by text query. Returns content snippets for the top 3 matches (truncated to 800 chars) plus titles for the rest. Scope to a specific section (`identity`, `workingMemory`, `knowledge`, `opinions`) or search `all`.

Use this at the start of any task that might benefit from prior context. It is faster and more focused than `search_notes`.

**`memory_store(section, title, content, topic?, subsection?)`**
Persist a piece of information into the appropriate section. Automatically adds `#llmMemory`, `#topic`, and `#dateStored` labels. Returns the new `noteId`.

Choose the right section:
- `identity` — user facts, preferences, communication style, context about who you're working with
- `workingMemory` — anything in-flight: active tasks, pending decisions, open questions
- `knowledge` — durable reference material, facts that will be useful again
- `opinions` — evaluations, recommendations, comparative stances

**`memory_update(noteId, content, title?)`**
Update an existing memory note. Automatically snapshots the old version as a revision first, then overwrites. Use this instead of creating a duplicate when refining stored knowledge. Adds `#dateUpdated`.

**`working_memory_thread(action, ...)`**
Manage ongoing tasks across sessions.
- `action: "open"` — create a thread under Active Threads with `#llmThread #status=open`
- `action: "close"` — mark a thread closed, optionally appending a resolution summary
- `action: "list"` — return all open threads

---

### Search

**`search_notes(query, ancestorNoteId?, limit?, orderBy?, orderDirection?, fastSearch?, ...)`**
Full Trilium search. Returns `id+title+type` only — never content. Supports:
- Plain text: `"machine learning"` (searches title + body)
- Label filter: `#topic=AI`, `#status!=done`, `#llmMemory`
- Date operators: `#dateModified =* MONTH`, `#dateCreated >= 2026-01-01`
- Combined: `python #topic=AI #status!=archived`
- Scoped to subtree: pass `ancestorNoteId`
- `fastSearch: true` — skips content body scan, much faster for label-only queries

**`search_by_label(labelName, labelValue?, ancestorNoteId?, limit?)`**
Shorthand for `#label=value` search. Uses `fastSearch` automatically. Cleaner to call when you know the label name.

**`get_recent_changes(ancestorNoteId?)`**
Returns up to 50 recently created/modified notes, deduplicated, newest first. Use this to resume context after a gap: "what changed since last session?"

---

### Notes

**`get_note(noteId)`**
Returns metadata: title, type, mime, attributes (labels + relations), parent/child IDs, dates. Does NOT return content. Use this to inspect structure before acting.

**`get_note_content(noteId)`**
Returns the raw body only. For text notes this is HTML; for code notes it is plain text. Only fetch this when you need to read or reason over the content — saves tokens.

**`get_note_with_content(noteId)`**
Metadata + body in one call. Use when you need to read AND then edit the note.

**`create_note(parentNoteId, title, content, type?, mime?)`**
Creates a note. Supported types: `text`, `code`, `book`, `canvas`, `mermaid`, `relationMap`, `render`, `search`, `file`, `image`. For code notes, set `mime` (e.g. `text/x-python`, `application/javascript`, `text/x-sql`). Returns `noteId` and `branchId` only.

**`update_note_content(noteId, content)`**
Replace the full body. Trilium auto-snapshots a revision before content changes, so history is preserved. For text notes use HTML; for code notes use plain text.

**`patch_note(noteId, title?, type?, mime?)`**
Update metadata without touching content. Use to rename or reclassify a note.

**`delete_note(noteId)`**
Hard delete. Prefer adding `#archived` label instead — it preserves the note for recall while hiding it from normal search.

---

### Structure

**`clone_note(noteId, parentNoteId, prefix?)`**
Places an existing note under a second parent. Both locations share the same content — this is not a copy. Use to cross-link knowledge into multiple categories (e.g. a decision that belongs in both Working Memory and Knowledge).

**`move_note(noteId, fromParentNoteId, toParentNoteId)`**
Moves a note by cloning to the new parent then deleting the old branch. The note is never orphaned during the operation.

---

### Attributes

Labels (`#`) are key-value tags. Relations (`~`) are typed directional edges to other notes. Both are searchable.

**`add_label(noteId, name, value?, isInheritable?)`**
Add a `#name=value` tag. If no value is provided it becomes a boolean flag label. Set `isInheritable: true` to propagate to all child notes.

Common label patterns:
```
#topic=AI               subject tag
#status=active          lifecycle: active | archived | closed
#type=decision          categorisation
#confidence=high        epistemics: high | medium | low
#source=claude-session  provenance
#reviewed=2026-03-31    last review date
#archived               soft-delete flag
```

**`add_relation(fromNoteId, name, toNoteId, isInheritable?)`**
Add a `~name` edge from one note to another. Common relation names:
```
~relatedTo      general link
~supports       evidence or argument support
~contradicts    conflicting information
~dependsOn      prerequisite
~implements     concrete realisation of a concept
~followsUp      continuation of a previous note
~template       links to a template note
```

**`delete_attribute(attributeId)`**
Remove a label or relation. Get the `attributeId` from `get_note`'s `attributes` array.

**`get_linked_notes(noteId)`**
Follow all `~relations` from a note. Returns `id+title` pairs. Use to traverse the knowledge graph.

---

### Attachments

Files attached to a note. Useful for structured data, exports, or supplementary material that doesn't belong in the note body.

**`get_note_attachments(noteId)`** — list attachments (id+title+mime+size)
**`get_attachment_content(attachmentId)`** — read text attachment body
**`create_attachment(ownerId, title, mime, content, role?)`** — attach a file or blob; `role`: `file` or `image`

---

### Revisions

Trilium auto-saves revisions when content changes. You can also snapshot manually.

**`get_note_revisions(noteId)`** — list all snapshots, newest first (id+title+date+size)
**`get_revision_content(revisionId)`** — read the body of a specific snapshot
**`create_revision(noteId)`** — manually snapshot before a major automated edit

Always call `create_revision` before making significant automated changes to an important note.

---

### Calendar / Journal

Trilium has a built-in journal. These tools get or auto-create calendar notes.

**`get_day_note(date?)`** — today's journal note (default: today, format: `YYYY-MM-DD`)
**`get_week_note(week)`** — week note (`YYYY-Www`, e.g. `2026-W13`)
**`get_month_note(month)`** — month note (`YYYY-MM`)
**`get_year_note(year)`** — year note (`YYYY`)
**`get_inbox_note(date?)`** — the inbox drop-zone for unprocessed ideas

Use the day note to append ephemeral thoughts or user requests that don't yet belong in a structured section. Promote them to Knowledge/Opinions/Working Memory when they crystallise.

---

### System

**`get_app_info`** — Trilium version, DB version, server metadata

**`create_backup(date?)`** — triggers a database backup named `brain-{date}.db`. Call at the end of sessions with significant changes.

**`initialize_trilium`** — safe to call on any environment. If the structure already exists, reports the live IDs and does nothing. If this is a fresh Trilium instance, creates the full hierarchy and returns a ready-to-paste `constants.ts` snippet.

---

## Token economy rules

The tools are designed to be token-efficient. Follow these rules:

1. **Search before fetch.** `search_notes` / `search_by_label` return stubs. Only call `get_note_content` when you actually need the body.
2. **Use `memory_recall` before `search_notes`** for memory lookups — it is already scoped and returns snippets.
3. **Call `start_session` once.** The tree it returns is your map for the session. Re-calling it wastes tokens.
4. **Batch intent.** If you need to create multiple notes, do it in sequence within one response rather than asking the user for confirmation between each.
5. **Use `get_note` not `get_note_with_content`** when you only need structure (labels, children, relations).
6. **Use `fastSearch: true`** whenever your query is label-only — it skips the full-text body scan.

---

## Patterns and workflows

### Storing a decision
```
1. memory_store(section="workingMemory", title="Decision: ...", content="...", topic="...")
2. add_label(noteId, "type", "decision")
3. add_label(noteId, "status", "active")
4. Optionally: add_relation(noteId, "dependsOn", relatedNoteId)
```

### Recalling before answering
```
1. memory_recall(query="<topic>", section="knowledge")
2. If top results are relevant, use their content in your answer
3. If nothing found, answer from training and consider memory_store if it's durable knowledge
```

### Updating a stale memory note
```
1. search_by_label("topic", "old-topic") to find the note
2. get_note_with_content(noteId) to read the current state
3. memory_update(noteId, newContent) — auto-snapshots before writing
```

### Closing out a session
```
1. working_memory_thread(action="list") — check for open threads
2. Close or update any resolved threads
3. log_session(summary="...") — factual summary of what happened
4. create_backup() — if significant changes were made
```

### Cross-linking knowledge
```
1. Create a note in Knowledge about topic A
2. Create a note in Knowledge about topic B
3. add_relation(noteIdA, "relatedTo", noteIdB)
4. Later: get_linked_notes(noteIdA) traverses to B
```

### Soft-archiving instead of deleting
```
add_label(noteId, "archived", "")
```
The note is now excluded from normal search but remains recoverable. Pass `includeArchivedNotes: true` to `search_notes` to find it again.

---

## Label conventions (full reference)

| Label | Values | Meaning |
|-------|--------|---------|
| `#llmMemory` | section name | Created by `memory_store` — marks LLM-managed notes |
| `#topic` | free text | Subject tag; primary search/filter dimension |
| `#type` | `decision`, `fact`, `howto`, `reference`, `question` | Note category |
| `#status` | `open`, `closed`, `active`, `archived` | Lifecycle state |
| `#confidence` | `high`, `medium`, `low` | Epistemic confidence in the content |
| `#source` | free text | Where the information came from |
| `#reviewed` | `YYYY-MM-DD` | Date last reviewed for accuracy |
| `#dateStored` | `YYYY-MM-DD` | Set automatically by `memory_store` |
| `#dateUpdated` | `YYYY-MM-DD` | Set automatically by `memory_update` |
| `#llmThread` | (flag) | Marks a Working Memory active thread |
| `#dateOpened` | `YYYY-MM-DD` | Set when a thread is opened |
| `#dateClosed` | `YYYY-MM-DD` | Set when a thread is closed |
| `#archived` | (flag) | Soft-delete; excluded from default search |
| `#iconClass` | boxicons class | Visual icon in Trilium UI |

---

## Relation conventions (full reference)

| Relation | Direction | Meaning |
|----------|-----------|---------|
| `~relatedTo` | A → B | General conceptual link |
| `~supports` | A → B | A provides evidence for or supports B |
| `~contradicts` | A → B | A conflicts with B |
| `~dependsOn` | A → B | A requires B to be true or done first |
| `~implements` | A → B | A is a concrete realisation of concept B |
| `~followsUp` | A → B | A continues or expands on B |
| `~supersedes` | A → B | A replaces B (B should be archived) |
| `~template` | instance → template | Links a note to its Trilium template |

---

## Note types

| Type | Content format | Use for |
|------|---------------|---------|
| `text` | HTML | General knowledge, decisions, summaries |
| `code` | Plain text | Code snippets, SQL, scripts, structured data |
| `book` | (container) | Section headers with no body — just children |
| `mermaid` | Mermaid syntax | Diagrams, flowcharts, sequence diagrams |
| `canvas` | JSON (excalidraw) | Sketches, whiteboards |
| `search` | Search query | Saved search that dynamically shows matching notes |

For `code` notes always set `mime`:
- `text/x-python` for Python
- `application/javascript` for JS/TS
- `text/x-sql` for SQL
- `text/plain` for plain text
- `application/json` for JSON

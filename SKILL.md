---
name: trilium-brain
description: "Persistent memory and knowledge graph via Trilium Brain MCP. Activate at the start of every session without exception — governs orientation, recall, capture, session logging, graph wiring, label discipline, and relation hygiene. Trigger immediately on any first user message. Also trigger whenever: memory is referenced, something needs to be remembered or recalled, a decision is confirmed, a question surfaces, an opinion forms, context from a prior session is needed, a project is onboarded, a person or organisation is introduced, or any Trilium operation is requested. Do not improvise memory operations without reading this skill."
---

# Trilium Brain — Operational Skill

Persistent memory that survives across sessions. Treat it as your own mind: read it at session start, write the moment something matters, wire relations immediately, log every session without exception.

---

## Architecture — Canonical Brain Tree

Discovered at session start via `start_session`, which returns all structural IDs. IDs vary per installation — always use the IDs returned by `start_session`, never hardcode them.

```
Trilium Brain                       ← brain root
├── Identity/                       — who the user is: persistent facts, preferences, active context
│   ├── Profile                     — durable biographical facts
│   ├── Preferences                 — working style, stated preferences
│   └── Context                     — current life/work situation
├── Working Memory/                 — ephemeral: threads resolve, decisions promote, inbox triages
│   ├── Inbox/                      — unprocessed captures land here (triage with triage_inbox)
│   ├── Threads/                    — thread notes land here (create_thread)
│   ├── Decisions/                  — decision notes land here (create_decision)
│   └── Open Questions/             — question notes land here; archive in place when resolved, never move
├── Knowledge/                      — durable, atomic, evergreen
│   ├── People                      — person notes (create manually, see People section below)
│   ├── Organizations               — org notes (create manually, see People section below)
│   ├── Projects                    — structured project briefs (create_project)
│   └── [domain]/                   — create_domain creates: Technology, Philosophy, Finance, etc.
│       ├── Concepts/               — atomic definitions (create_concept)
│       ├── References/             — source material, links, documents
│       └── Notes/                  — freeform domain notes
├── Opinions                        — flat blog/diary entries; no subtrees (create_opinion)
├── Log/                            — temporal record
│   ├── Sessions                    — one per session (log_session)
│   └── Decisions Made              — promoted resolved decisions
└── Templates/                      — structural templates, auto-wired by create_* tools
    ├── Thread · Decision · Concept · Project Brief · Person · Opinion · Domain
```

**IDs returned by `start_session` — capture and use throughout:**
- `structuralIds.identity.*` — Profile, Preferences, Context IDs
- `structuralIds.workingMemory.*` — Inbox, Threads, Decisions, Open Questions IDs
- `structuralIds.knowledge.*` — People, Organizations, Projects IDs
- `structuralIds.opinions` — Opinions root ID
- `structuralIds.log.*` — Sessions, Decisions Made IDs
- `structuralIds.templates.*` — all template note IDs

**Structural rules — never violate:**
- Threads → always under Working Memory → Threads (`create_thread`)
- Decisions → always under Working Memory → Decisions (`create_decision`)
- Questions → always inside Working Memory → Open Questions/ (`create_note(parentNoteId=<workingMemory.openQuestions>)`); archive in place when resolved, never move
- Concepts → under Knowledge → [domain] → Concepts (`create_concept` with domain)
- Opinions → direct children of Opinions, never nested (`create_opinion`)
- Sessions → one per session under Log → Sessions (`log_session`)
- People → under Knowledge → People (`create_note` with `#noteType=person`)
- Organizations → under Knowledge → Organizations (`create_note` with `#noteType=organisation`)
- Never store notes directly under Working Memory root or Knowledge root

---

## Session Protocol

### START — run in this exact order before responding to anything

1. `start_session` — once, first thing. Returns full tree + all structural IDs. Capture all IDs. Never call again mid-session.
2. `recall_memory(query=<topic of first message>)` — always, before responding. Surfaces relevant context and prevents duplicates.
3. `manage_thread(action="list")` — check what threads are active; decide if the current topic continues an open thread.

> If `start_session` returns `configStatus.incomplete`, run `bootstrap_brain` immediately before anything else.

### DURING — write the moment something matters, not at the end

| Event | Action |
|-------|--------|
| Decision confirmed | `create_decision` immediately |
| Question surfaces unanswered | `create_note(parentNoteId=<openQuestionsId>, ...)` immediately |
| Opinion formed | `create_opinion` immediately |
| Durable fact / concept learned | `recall_memory` first → if no match: `create_concept` or `store_memory(section="knowledge")` |
| New person introduced | `recall_memory(query=<name>)` → if new: `create_note` under People (see People section) |
| New organisation introduced | `recall_memory(query=<name>)` → if new: `create_note` under Organizations |
| New project discussed | `create_project` immediately |
| User shares a fact about themselves | `recall_memory` first → `update_memory` if exists, `store_memory(section="identity")` if new |
| Question resolved | `update_memory` with resolution; `add_label(#status=resolved)`; `add_label(#archived)`; leave in place |
| Decision superseded | `update_memory` old body + `add_label(#status=superseded)` + `add_label(#archived)`; `create_decision` new; `add_relation(new, supersedes, old)` |
| Multi-session effort begins | `create_thread` immediately |
| Thread has a new development | `manage_thread(action="append", noteId=..., entry=...)` |
| Thread resolves | `manage_thread(action="close", noteId=..., resolution=...)` |
| Thread yields reusable knowledge | `promote_to_knowledge` then optionally `create_concept` or `store_memory(section="knowledge")` |
| Item lands in inbox | `triage_inbox(action="promote")` to correct section immediately |
| Relations implied | `add_relation` immediately after creating or updating — never batch to later |
| Path traversed successfully | `strengthen_relation` on each traversed edge |

**Opinions:** Write whenever you form a genuine view — stance, reasoning, caveats. Don't sanitise or hedge into uselessness.

### END — session is not complete until all three are done

1. `manage_thread(action="list")` → close resolved threads with substantive resolution summaries (not "done").
2. Check for duplicate: `search_notes_by_label("noteType", "session")` filtered to today — only call `log_session` if none exists.
3. `log_session(summary=..., decisions=[], modified=[], openQuestions=[], date=<today>)` — one per session.
4. `create_backup(date=<today>)` — after any session that created or modified notes.

---

## Capture → Triage → Promote Cycle

The brain's daily rhythm. Captures flow in, get triaged, and valuable ones get promoted.

```
Capture (quick)
  └── store_memory(section="workingMemory") or get_inbox_note → append to day note

Triage (within session or next session)
  └── triage_inbox(action="list")
      ├── Worth keeping?  → triage_inbox(action="promote", targetSection=...)
      └── Noise?          → triage_inbox(action="discard")

Promote (when durable value is confirmed)
  ├── Thread with insight → promote_to_knowledge(domain=...)
  ├── Thread with decision → clone_note to Log → Decisions Made
  └── Raw note → create_concept / store_memory(section="knowledge")
```

**Inbox sources:**
- `b().workingMemory.inbox` — the static WM inbox (always available)
- `get_inbox_note(date=<today>)` — Trilium's calendar inbox for today (date-scoped)

Both are valid; use the calendar inbox for date-tagged captures, the WM inbox for session-scoped items.

---

## Label System

All `create_*` and `store_memory` tools auto-apply base labels. Add domain labels immediately after creation.

### Base labels — applied automatically

| Label | Who sets it | Values |
|-------|-------------|--------|
| `#noteType` | all create_* tools | `thread` / `decision` / `concept` / `domain` / `project` / `person` / `organisation` / `opinion` / `session` / `knowledge` |
| `#status` | relevant create_* tools | `active` / `pending` / `resolved` / `consolidated` / `triaged` / `superseded` |
| `#dateOpened` | create_thread, create_decision | ISO date |
| `#dateStarted` | create_project | ISO date |
| `#dateWritten` | create_opinion | ISO date |
| `#dateStored` | store_memory | ISO date |
| `#sessionDate` | log_session | ISO date — find sessions by date |
| `#mood` | create_opinion | `contemplative` / `passionate` / `uncertain` / `analytical` |
| `#goal` | create_project (when goal provided) | one-line goal string |

### Manual labels — add immediately after creation

| Label | Value | Use for |
|-------|-------|---------|
| `#topic` | free text | Subject tag — always set on every note |
| `#domain` | e.g. `Technology`, `Philosophy` | Domain concepts and projects |
| `#confidence` | `high` / `medium` / `low` | Epistemic certainty of a claim |
| `#archived` | (flag, no value) | Soft-delete — resolved questions, superseded decisions |
| `#dateUpdated` | ISO date | Set every time you call `update_memory` |
| `#source` | free text | Where this knowledge came from |
| `#iconClass` | BoxIcons class string | Trilium UI icon — copy from similar existing notes |

### Inheritable labels — use `isInheritable=true`

Set on a container note so all children inherit automatically:
- `#domain=Technology` on a domain root → all child concepts carry the domain
- `#project=<name>` on a project root → all sub-notes tagged to the project
- `#archived` on a subtree root → archives the whole subtree at once

### Synaptic weight labels — managed automatically

`#sw_{relationName}_{targetNoteId} = <integer>` — Hebbian counter.
- `strengthen_relation` increments after useful traversals
- `weaken_relation` decrements when a path was misleading; label is deleted at zero, relation preserved

---

## Relation System

Wire immediately after creating or updating. Use the most specific type available. Never batch to later.

### Canonical relation vocabulary

| Relation | Direction | Use when |
|----------|-----------|----------|
| `relatesTo` | A → B | Generic connection — last resort; nothing more specific fits |
| `extends` | A → B | A elaborates, expands, or builds on B |
| `contradicts` | A → B | A conflicts with or undermines B |
| `supports` | A → B | A provides evidence, reasoning, or justification for B |
| `causes` | A → B | A produces or leads to B |
| `references` | A → B | A cites B as a source or authority |
| `partOf` | A → B | A structurally belongs inside B |
| `worksWith` | A ↔ B | A and B cooperate or are used together — **use `bidirectional=true`** |
| `mentors` | A → B | A teaches, shapes, or guides B |
| `instanceOf` | A → B | A is a concrete example or realisation of B |
| `supersedes` | A → B | A replaces B entirely — archive B with `#status=superseded` |
| `implements` | A → B | A is the concrete realisation of concept B |
| `inspiredBy` | A → B | A was conceptually influenced by B |
| `sourceOf` | A → B | A is the origin or provenance of B |
| `derivedFrom` | A → B | A was synthesised from B (auto-wired by `promote_to_knowledge`) |

> `~template` is Trilium-internal — auto-wired by `create_*` tools. Never wire it manually.

### Decision logic — ask in order before wiring

1. Structural containment? → `partOf`
2. Synthesised from content of B? → `derivedFrom`
3. Concrete implementation of concept in B? → `implements`
4. Requires B to function or be valid? → `worksWith` (bidirectional)
5. Provides evidence or reasoning for B? → `supports`
6. Next iteration or continuation of B? → `extends`
7. Replaces B entirely? → `supersedes`
8. Conflicts with B? → `contradicts`
9. Same domain, nothing more specific? → `relatesTo`

### Standard wiring patterns

**Working Memory lifecycle:**
- Decision → `extends` → Thread it resolved
- Decision → `supports` → Question it answered
- Knowledge note → `derivedFrom` → Thread (auto-wired by `promote_to_knowledge`)

**Knowledge structure:**
- Concept → `partOf` → domain note (its parent in the tree is already structural; `partOf` adds semantic weight)
- Project → `partOf` → Projects container
- Person A → `worksWith` → Person B (bidirectional)
- Person → `mentors` → other Person

**People & Organisations:**
- Person → `partOf` → People
- Organisation → `partOf` → Organizations
- Person → `worksWith` → Organisation they belong to (bidirectional)

**Identity:**
- Identity facts → `partOf` → relevant Identity sub-note (Profile, Preferences, or Context)

**Opinions:**
- Opinion → `supports` → notes that informed it (optional, when clear)
- Opinion → `contradicts` → a prior opinion if stance changed

---

## Search Query Syntax

`search_notes` uses Trilium's native query language. Pass `debug=true` if a query returns unexpected results — it surfaces the parsed query and any errors.

```
# Label presence / value
#noteType                          has the label (any value)
#noteType=concept                  exact value match
#domain="Machine Learning"         quote values containing spaces
#status!=resolved                  not equal

# Note properties
note.title = "Exact Title"         exact title match
note.title =* "brain"              title contains "brain" (case-insensitive)
note.type = text                   note type filter

# Subtree scope — pass as ancestorNoteId param, not in query string
ancestorNoteId=<id>                constrain search to this subtree

# Boolean
#noteType=concept AND #domain=Technology
#status=active OR #status=pending
NOT #archived

# Date comparisons (note properties, not user labels)
note.dateModified >= TODAY-7       modified in the last 7 days
note.dateCreated >= MONTH-1        created in the last month
note.dateCreated >= 2026-01-01     since a fixed date

# Attribute existence
note.ownedAttributes.type = "relation" AND note.ownedAttributes.name = "supports"
```

**Quick decision — which search tool to use:**

| Goal | Tool |
|------|------|
| Find by rough topic / content | `recall_memory(query=<keywords>)` — returns content snippets |
| Find by exact label value | `search_notes_by_label("noteType", "decision")` — fastest |
| Complex query with multiple filters | `search_notes(query=...)` with `fastSearch=true` for label-only |
| What changed since last session | `get_recent_notes()` — no query needed |
| Find all active threads | `search_notes_by_label("status", "active")` scoped to WM root |

Always scope to a subtree via `ancestorNoteId` for performance — searching the whole brain is expensive.

---

## Graph Intelligence

The knowledge graph only has value if it is maintained. Apply these rules on every traversal.

### When to strengthen a relation
Call `strengthen_relation(fromNoteId, relationName, toNoteId)` after any traversal where the path was **useful**:
- You followed a relation and the connected note was directly relevant to the user's question
- `find_relation_path` surfaced a non-obvious connection the user acted on
- `get_note_neighborhood` revealed a cluster that meaningfully informed the response

### When to weaken a relation
Call `weaken_relation(fromNoteId, relationName, toNoteId)` when a path was **misleading or stale**:
- The connected note is no longer relevant to the source (concepts diverged)
- A `suggest_connections` candidate was explicitly rejected by the user
- A concept was refactored and the old edge no longer accurately describes the relationship

**Never delete a relation solely because weight is low** — weight reflects traversal frequency, not correctness. Use `delete_relation` only when the relationship itself is semantically wrong.

### Traversal decision tree

```
I need to find a specific note                    → recall_memory / search_notes_by_label
I have a note, want what it links to              → get_outgoing_relations (1 hop)
I have a note, want what links to it              → get_incoming_relations (backlinks)
How are two notes connected?                      → find_relation_path (BFS, up to 6 hops)
What's the conceptual neighbourhood of a note?   → get_note_neighborhood (depth=1–2)
Map all notes reachable from a starting point     → traverse_graph (direction, type filter, cap)
What relation types does this brain use?          → get_relation_types
```

### Concrete use cases

| Goal | Tool + params |
|------|--------------|
| Lineage: what did this knowledge derive from? | `get_incoming_relations` filtered to `derivedFrom` |
| Impact: what does changing this concept affect? | `traverse_graph(direction="inbound")` |
| Domain mapping | `traverse_graph(noteId=<domain root>, direction="outbound", maxDepth=2)` |
| Shortest path between two ideas | `find_relation_path(fromNoteId, toNoteId, maxDepth=6)` |
| Find all concepts a person is connected to | `get_note_neighborhood(noteId=<person>, depth=2)` |
| Find orphaned notes to reconnect | `find_orphan_notes(ancestorNoteId=<scope>)` |
| Find connection candidates for a note | `suggest_connections(noteId=..., limit=10)` |

---

## Note Format Templates

All notes use structured HTML. `create_*` tools generate these formats automatically. Use them when writing manually via `create_note` or `store_memory`.

### Thread
```html
<p><strong>Opened:</strong> YYYY-MM-DD · <strong>Status:</strong> active</p>
<hr>
<h2>Context</h2><p>[Why this thread exists — what problem it's tracking]</p>
<h2>Log</h2><p><em>— append entries with manage_thread(action="append") —</em></p>
<h2>Resolution</h2><p><em>— pending —</em></p>
```

### Decision (ADR format)
```html
<h2>Context</h2><p>[Situation requiring a decision — what forces are at play]</p>
<hr>
<h2>Options Considered</h2>
<ul><li><strong>Option A</strong> — [description, pros, cons]</li></ul>
<h2>Decision</h2><p>[Unambiguous statement of what was decided]</p>
<h2>Rationale</h2><p>[What drove this choice over alternatives]</p>
<h2>Consequences</h2><p>[What this constrains, enables, or commits to]</p>
```

### Concept
```html
<h2>Definition</h2><p>[Atomic, precise definition — one concept per note]</p>
<hr>
<h2>Domain</h2><p>[domain]</p>
<h2>Examples</h2><ul><li>[Concrete example]</li></ul>
<h2>Related Concepts</h2><p><em>— wire via add_relation —</em></p>
<h2>Notes</h2><p></p>
```

### Project Brief
```html
<p><strong>Started:</strong> YYYY-MM-DD · <strong>Status:</strong> active</p>
<h2>Goal</h2><p>[One-line statement of what success looks like]</p>
<hr>
<h2>Scope</h2><p>[What's in / out of scope]</p>
<h2>Milestones</h2><ul><li>[Key deliverable]</li></ul>
<h2>Risks</h2><p>[Known unknowns and blockers]</p>
<h2>Notes</h2><p></p>
```

### Person
```html
<h2>Overview</h2><p>[Who this person is — role, context, relationship to user]</p>
<hr>
<h2>Key Facts</h2><ul><li>[Fact]</li></ul>
<h2>Shared History</h2><p>[Relevant interactions and context]</p>
<h2>Notes</h2><p></p>
```

### Opinion (blog/diary)
```html
<p><strong>Written:</strong> YYYY-MM-DD · <strong>Mood:</strong> [mood]</p>
<hr>
<h2>Stance</h2><p>[Your actual position — don't hedge into uselessness]</p>
<h2>Reasoning</h2><p>[Evidence and logic — be specific]</p>
<h2>Caveats</h2><p>[What would change your mind]</p>
<h2>Revision History</h2><p>[Note when and why this changed, if it did]</p>
```

### Session (Log)
```html
<p><strong>Date:</strong> YYYY-MM-DD</p>
<h2>Summary</h2><p>[What happened — factual and concise]</p>
<h2>Decisions Made</h2><ul><li>[Decision]</li></ul>
<h2>Notes Modified</h2><ul><li>[Title]</li></ul>
<h2>Open Questions</h2><ul><li>[Question still unresolved]</li></ul>
```

---

## People & Organisations

There are no dedicated `create_person` / `create_organisation` tools — create these manually:

```
# Create a person note
create_note(
  parentNoteId = <knowledge.people>,
  title        = "Firstname Lastname",
  content      = <Person HTML template above>
)
→ add_label(noteId, "noteType", "person")
→ add_label(noteId, "topic", <name>)
→ add_relation(noteId, "partOf", <knowledge.people>)

# Create an organisation note
create_note(
  parentNoteId = <knowledge.organizations>,
  title        = "Organisation Name",
  content      = "<h2>Overview</h2><p>[What this org does]</p>"
)
→ add_label(noteId, "noteType", "organisation")
→ add_label(noteId, "topic", <name>)
→ add_relation(noteId, "partOf", <knowledge.organizations>)
```

**Wire immediately after creation:**
- Person → `worksWith` → their Organisation (bidirectional)
- Person → `mentors` → another Person (if applicable)
- Person → `worksWith` → Project they're involved in (bidirectional)

---

## Calendar Integration

Trilium's calendar notes (day/week/month/year) integrate with the brain's Working Memory.

```
get_day_note(date="YYYY-MM-DD")    → noteId of today's journal note
get_inbox_note(date="YYYY-MM-DD")  → noteId of today's calendar inbox
```

**Daily capture pattern:**
1. `get_inbox_note()` — get today's calendar inbox
2. `clone_note(noteId=<capture>, parentNoteId=<wm.inbox>)` — or append directly to the day note
3. At triage time: `triage_inbox(action="promote", ...)` to route to the right section

**Cross-referencing sessions with calendar:**
- After `log_session`, clone the session note to the day note:
  `clone_note(noteId=<session>, parentNoteId=<dayNoteId>)` — no duplication, shared content
- Search sessions by date: `search_notes_by_label("sessionDate", "YYYY-MM-DD")`

**Week reviews:**
```
get_week_note(week="YYYY-Www")
→ recall_memory(query="this week", section="log")
→ review all sessions, promote any lingering threads
```

---

## Deduplication

Before creating any note:

```
1. recall_memory(query=<topic keywords>, section=<targeted section>)
   → content snippet match?  update_memory — do not create a duplicate

2. For typed notes, also check:
   search_notes_by_label("noteType", "<type>") scoped to the right subtree
   → title match?  update_memory — do not create a duplicate

3. No match anywhere → proceed with create_* or store_memory
```

**Merging discovered duplicates:**
1. `get_note_with_content` on both
2. Merge into the more complete note with `update_memory`
3. `delete_note` the redundant one
4. Transfer any unique relations from deleted note to survivor via `add_relation`
5. Wire `relatesTo` on any notes that linked to the deleted note

---

## Hygiene Rules

**On creation:**
- [ ] Correct structural location per architecture above
- [ ] `#noteType` and `#topic` set immediately
- [ ] At least one typed relation wired (unless the note is a structural container)
- [ ] Structured HTML — no prose blobs for anything except Opinions and raw store_memory captures
- [ ] `bidirectional=true` used for `worksWith` relations

**On update:**
- [ ] Use `update_memory` (auto-snapshots) not `update_note_content` directly for knowledge notes
- [ ] `add_label(noteId, "dateUpdated", today)` every time
- [ ] If superseding: label old `#status=superseded` + `#archived`, create new, wire `supersedes`

**On deletion:**
- [ ] Prefer `add_label(#archived)` over `delete_note` for all knowledge notes
- [ ] If hard-deleting: check `get_incoming_relations` first — re-wire any backlinks to a successor
- [ ] Never hard-delete threads or decisions — they are the audit trail

**Anti-patterns — never:**
- Store a note directly under Working Memory root or Knowledge root
- Create a concept without a domain — always use `create_concept(domain=...)`
- Create a duplicate — `recall_memory` + `search_notes_by_label` first
- Call `log_session` twice for the same date — always check first
- Leave a resolved question without `#status=resolved` + `#archived`
- Move a resolved question — archive in place
- Close a thread with "done" or "resolved" as the resolution — write a substantive summary
- Open a thread for a single-session task — use Working Memory → Inbox or a quick note
- Wire only `relatesTo` when a more specific relation fits
- Call `update_note_content` on a knowledge note without `create_note_revision` first
- Use `add_relation(worksWith)` without `bidirectional=true` — the relation is symmetric
- `clone_note` when `add_relation` is semantically correct — cloning is structural, relations are semantic

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `start_session` returns `configStatus.incomplete` | Run `bootstrap_brain` to create missing structure and refresh brain.json |
| `search_notes` returns unexpected empty results | Add `debug=true` — inspect parsed query and errors in response |
| `search_notes` crashes on a label value with spaces | Quote the value: `#domain="Machine Learning"` not `#domain=Machine Learning` |
| `create_concept` places under wrong parent | Pass `domainNoteId` explicitly; if unknown, `search_notes_by_label("noteType","domain")` first |
| `manage_thread(action="close")` fails | Note must have `#noteType=thread`; verify with `get_note` |
| `promote_to_knowledge` creates a second domain folder | Pass `domainNoteId`; don't rely on domain name lookup alone |
| `strengthen_relation` / `weaken_relation` — "no relation found" | Relation doesn't exist yet — call `add_relation` first |
| `triage_inbox(action="promote")` errors "requires targetNoteId or targetSection" | Always provide a destination — promote requires knowing where to route the note |
| `triage_inbox(action="promote")` leaves original in inbox | Tool clones then deletes all source branches; if it failed mid-way check `get_recent_notes` for orphaned clone |
| `log_session` creates a duplicate for today | Always `search_notes_by_label("sessionDate", "<today>")` before calling |
| `update_label` fails — attribute not found | `get_note` and find the correct attributeId from the `attributes` array |
| `get_note_neighborhood` returns too many nodes | Reduce `depth` to 1 or add `relationType` filter |
| Tool returns stale IDs after re-bootstrap | Call `get_brain_config` to verify; if IDs differ, run `bootstrap_brain` again |
| `add_relation(worksWith)` only creates one direction | Pass `bidirectional=true` — `worksWith` is symmetric |

---

## Tool Reference

### Session / Orientation
| Tool | Signature | Use |
|------|-----------|-----|
| `start_session` | `()` | Boot session. Returns 3-level tree + all structural IDs. Once per session only. |
| `log_session` | `(summary, title?, decisions?, modified?, openQuestions?, date?)` | Persist session to Log → Sessions. Check for duplicate first. |
| `get_brain_config` | `()` | Return current brain config (all IDs) — no API calls. Use for mid-session ID checks. |

### Search
| Tool | Signature | Use |
|------|-----------|-----|
| `search_notes` | `(query, ancestorNoteId?, limit?, fastSearch?, orderBy?, orderDirection?, includeArchived?, debug?)` | Full Trilium query: text, `#label=value`, date ops, subtree scope. Add `debug=true` to troubleshoot. |
| `search_notes_by_label` | `(labelName, labelValue?, ancestorNoteId?, limit?)` | Fast `#label=value` lookup. Best for finding typed notes. |
| `get_recent_notes` | `(ancestorNoteId?)` | Up to 50 recently modified notes, newest first. |

### Note CRUD
| Tool | Signature | Use |
|------|-----------|-----|
| `get_note` | `(noteId)` | Metadata + attributes, no content. Use to inspect labels/relations before acting. |
| `get_note_content` | `(noteId)` | Body only. Call only when you need to reason over content. |
| `get_note_with_content` | `(noteId)` | Metadata + body in one call. Use when you need to read then immediately write. |
| `create_note` | `(parentNoteId, title, content, type?, mime?)` | Raw note anywhere. Use `create_*` for structured types. |
| `update_note_content` | `(noteId, content)` | Replace body. Call `create_note_revision` first for knowledge notes. |
| `patch_note` | `(noteId, title?, type?, mime?)` | Rename or reclassify without touching content. |
| `delete_note` | `(noteId)` | Hard delete. Prefer `#archived` label. Check `get_incoming_relations` first. |

### Structure / Branching
| Tool | Signature | Use |
|------|-----------|-----|
| `clone_note` | `(noteId, parentNoteId, prefix?)` | Multi-parent placement. Shared content. Use for structural indexing, not semantic linking. |
| `move_note` | `(noteId, fromParentNoteId, toParentNoteId)` | Move to new parent. Atomic — new branch created before old removed. |

### Attributes
| Tool | Signature | Use |
|------|-----------|-----|
| `add_label` | `(noteId, name, value?, isInheritable?)` | Add `#name=value` label. Set `isInheritable=true` for container-level tags. |
| `update_label` | `(attributeId, value)` | Update label value in place (atomic PATCH). Get attributeId from `get_note`. |
| `add_relation` | `(fromNoteId, relationName, toNoteId, bidirectional?, isInheritable?)` | Wire typed relation. Use `bidirectional=true` for `worksWith`. |
| `delete_relation` | `(fromNoteId, relationName, toNoteId)` | Remove named relation by endpoint pair. |
| `delete_attribute` | `(attributeId)` | Remove any attribute by raw attributeId. |
| `strengthen_relation` | `(fromNoteId, relationName, toNoteId)` | Increment Hebbian weight (+1). Call after useful traversal. |
| `weaken_relation` | `(fromNoteId, relationName, toNoteId, by?)` | Decrement weight. Label removed at 0. Relation preserved. |
| `get_relation_types` | `(ancestorNoteId?)` | Discover all relation type names in use (+ canonical list). |
| `get_related_notes` | `(noteId, relationName, direction?)` | Notes connected via a specific relation. direction: outbound (default) / inbound. |

### Graph Traversal
| Tool | Signature | Use |
|------|-----------|-----|
| `get_outgoing_relations` | `(noteId)` | Outgoing relations + synaptic weights. One hop. |
| `get_incoming_relations` | `(noteId)` | Backlinks into this note. One hop. |
| `find_relation_path` | `(fromNoteId, toNoteId, maxDepth?)` | Shortest BFS path. Returns null if none within maxDepth. |
| `get_note_neighborhood` | `(noteId, depth?, relationType?)` | All notes within N hops. Center at depth=0. |
| `traverse_graph` | `(noteId, direction?, relationType?, maxDepth?, maxNodes?)` | Full walk: outbound / inbound / both. Use maxNodes to cap large graphs. |

### Structured Note Creation
| Tool | Signature | Use |
|------|-----------|-----|
| `create_thread` | `(title, context?, topic?, date?)` | Reasoning thread in Working Memory → Threads. |
| `create_decision` | `(title, context?, topic?, date?)` | ADR decision record in Working Memory → Decisions. |
| `create_concept` | `(title, domain, domainNoteId?, topic?)` | Atomic concept under Knowledge → [domain] → Concepts. |
| `create_domain` | `(name)` | New domain subtree (Concepts / References / Notes). Returns all created IDs. |
| `create_opinion` | `(title, mood?, topics?, date?)` | Blog/diary opinion under Opinions (flat). |
| `create_project` | `(title, goal?, topic?, date?)` | Project brief under Knowledge → Projects. Returns Decisions + Notes sub-IDs. |

### Memory / Recall
| Tool | Signature | Use |
|------|-----------|-----|
| `recall_memory` | `(query, section?, limit?)` | Scoped search with content snippets for top 3. Always call before creating. |
| `store_memory` | `(section, title, content, topic?, subsectionId?)` | Raw note with auto-labels. For prose or unstructured captures. |
| `update_memory` | `(noteId, content, title?)` | Pre-snapshots then overwrites. Use for all knowledge updates. |
| `manage_thread` | `(action, noteId?, entry?, resolution?, date?)` | `append / close / list`. list returns active threads only. |
| `triage_inbox` | `(action, noteId?, targetSection?, targetNoteId?)` | `list / promote / discard`. promote moves note and labels it `#status=triaged`. |
| `promote_to_knowledge` | `(sourceNoteId, targetTitle?, domain?, domainNoteId?, closeSource?)` | Promotes WM note → Knowledge. Wires `~derivedFrom`. Labels source `#status=consolidated`. |

### Maintenance
| Tool | Signature | Use |
|------|-----------|-----|
| `find_orphan_notes` | `(ancestorNoteId?, limit?)` | Notes with no relations and no meaningful labels. Scope to knowledge root for best results. |
| `suggest_connections` | `(noteId, ancestorNoteId?, limit?)` | Candidate connections by shared label overlap, ranked by similarity. |
| `bulk_add_label` | `(noteIds, labelName, labelValue?, isInheritable?)` | Batch-label multiple notes. Use on `search_notes` result sets. |

### Attachments
| Tool | Signature | Use |
|------|-----------|-----|
| `get_note_attachments` | `(noteId)` | List attachments — id + title + mime + size. |
| `get_attachment_content` | `(attachmentId)` | Read attachment body (text / code). |
| `create_attachment` | `(ownerId, title, mime, content, role?)` | Attach file or text blob. role: file (default) or image. |
| `delete_attachment` | `(attachmentId)` | Permanently delete. Irreversible. |
| `update_attachment` | `(attachmentId, title?, mime?)` | Update title or MIME in place. |

### Revisions
| Tool | Signature | Use |
|------|-----------|-----|
| `get_note_revisions` | `(noteId)` | All revisions, newest first — id + title + date + size. |
| `get_revision_content` | `(revisionId)` | Content of a historical snapshot. |
| `create_note_revision` | `(noteId)` | Manually snapshot before significant edits. |

### Calendar Notes
| Tool | Signature | Use |
|------|-----------|-----|
| `get_day_note` | `(date?)` | Get/create today's journal day note. date: YYYY-MM-DD. |
| `get_week_note` | `(week)` | Get/create week note. Format: YYYY-Www (e.g. 2026-W20). |
| `get_month_note` | `(month)` | Get/create month note. Format: YYYY-MM. |
| `get_year_note` | `(year)` | Get/create year note. Format: YYYY. |
| `get_inbox_note` | `(date?)` | Calendar inbox for a date. Use with triage_inbox. |

### System
| Tool | Signature | Use |
|------|-----------|-----|
| `get_app_info` | `()` | Trilium server + DB version. Diagnostics. |
| `create_backup` | `(date?)` | Trigger named DB backup `brain-{date}.db`. Call at end of significant sessions. |
| `bootstrap_brain` | `()` | Init or inspect brain hierarchy. Writes brain.json. Activates config live. Safe to re-run. |

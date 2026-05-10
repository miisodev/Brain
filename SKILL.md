---
name: trilium-brain-mcp
description: "Persistent memory system via Trilium Brain MCP. Use this skill at the start of every session without exception — it governs orientation, recall, continuous capture, session logging, organisation, labels, and relations. Trigger immediately on any first message from the user. Also trigger whenever: memory is referenced, something needs to be remembered or recalled, a decision is confirmed, a question surfaces, an opinion forms, context from a prior session is needed, a project is being onboarded, or any Trilium operation is requested. Do not improvise memory operations without reading this skill. If in doubt, this skill applies."
---

# Trilium Brain MCP

Persistent memory that survives across sessions. This is infrastructure you maintain continuously — not a logging chore at session end. Treat it as your own mind: read it at start, write to it the moment something matters, organise it properly, log every session without exception.

---

## Architecture — Canonical Tree Shape

The tree is discovered at session start via `start_session`, which returns all node IDs. The shape below is the canonical structure every installation follows. IDs vary per installation — always use IDs returned by `start_session`, never hardcode them.

```
Trilium
├── Identity                    — facts about the user: who they are, how they work, what they're building
│
├── Working Memory
│   ├── Active Threads          — ongoing multi-session efforts
│   ├── Decisions               — durable confirmed decisions
│   └── Open Questions          — all questions, open and resolved (never delete, archive in place)
│
├── Knowledge
│   └── [portfolio / domain node]   — e.g. Ventures, Projects, Work
│       ├── [Protocol note]         — domain knowledge system rules (read at project onboarding)
│       ├── [Category node]         — e.g. Business, SaaS, Web Dev, Game Dev (type=book)
│       │   └── [Project node]      — type=book, #topic=<project>
│       │       ├── Sources         — type=book
│       │       │   ├── Repo        — GitHub URL, filesystem path, annotated file tree
│       │       │   └── Context Library  — local mirror path and tree
│       │       └── Knowledge       — type=book
│       │           └── [domain notes — one per domain type]
│       └── [other sub-nodes as appropriate — Research, Others, etc.]
│
├── Opinions                    — your evaluations, stances, assessments (not the user's)
│
└── Log                         — one child note per calendar day (YYYY-MM-DD)
```

**IDs to capture from `start_session` and use throughout the session:**
- Trilium root ID
- Identity node ID
- Working Memory node ID → Active Threads ID, Decisions ID, Open Questions ID
- Knowledge node ID → portfolio/domain node ID
- Opinions node ID
- Log node ID

**Structural rules — never violate:**
- Decision notes → always under Decisions node
- Open Question notes → always under Open Questions node; archive in place when resolved, never move
- Active Thread notes → always under Active Threads node
- Opinion notes → direct children of Opinions node, not nested further
- Log notes → one per calendar day under Log node, appended if session continues
- Project Knowledge notes → under the project's Knowledge node inside the portfolio hierarchy — never flat under the Knowledge root

---

## Project Node Anatomy

Every project follows this exact two-child structure. Invariant — no deviations.

```
[Project] (type=book, #topic=<project>, #type=reference)
├── Sources (type=book, #topic=<project>, #type=reference, ~partOf → project)
│   ├── Repo             — repository URL, filesystem path, annotated file tree with status markers
│   ├── Context Library  — local mirror path and tree (if applicable)
│   └── [other source notes as discovered — docs, dashboards, research, conversations, etc.]
└── Knowledge (type=book, #topic=<project>, #type=reference, ~partOf → project)
    └── [domain notes — one per domain type]
```

**Sources node purpose:** Every discovered source of information about the project lives here — not just the codebase. As new sources are encountered (external docs, service dashboards, web research, design files, conversations), add a note for each under Sources with its location and status. Sources is the complete provenance record for the project's Knowledge.

**Source types and their notes:**

| Source type | Note content |
|---|---|
| Repo | Repository URL, filesystem path, full annotated file tree |
| Context Library | Local mirror path and tree |
| External docs | URL or path, description, date last read |
| Service dashboards | Service name, URL, what was observed, date |
| Web research | Topic, URLs consulted, date |
| Design files | Tool (Figma, etc.), file name/URL, date |
| Conversations | Session date, what was discussed, key facts extracted |

**Status markers (used in Repo file trees and source notes):**
- `✅ YYYY-MM-DD` — read and used to create or update domain knowledge (date of last use)
- `🔃` — discovered but not yet read or not yet used to update Knowledge
- `⚠️ stale` — previously read but source has since changed; domain knowledge may be outdated
- *(no marker)* — binary or asset file, not a readable source

Mark ✅ only when the source has actually been read **and** its content reflected in a domain Knowledge note. Discovering a source or reading it without updating Knowledge does not qualify.

---

## Domain Knowledge System

When working on a project for the first time each session, read the live Protocol note stored under the portfolio node in Knowledge. The table below is the operational summary.

### Five domain types

| Domain | `#domain` label | Typical source files | Covers |
|---|---|---|---|
| Product & Business | `product-business` | product docs, README | Vision, features, pricing, market, target users |
| Tech Stack | `tech-stack` | `package.json`, stack docs | Every service, framework, version, plan, upgrade requirements |
| Design System | `design-system` | design docs, CSS tokens | Colours, typography, spacing, motion, component rules |
| Domains & Routing | `domains-routing` | routing config, infra docs | Domain architecture, all routes, security model |
| Email Templates | `email-templates` | email source files, template docs | Every email type, sending service, anatomy, variables |

Create only the domain types that exist for a given project.

### Required labels — every domain note

| Label | Value |
|---|---|
| `#llmMemory` | `knowledge` |
| `#topic` | project slug (e.g. `my-app`, `project-x`) |
| `#type` | `reference` |
| `#domain` | domain slug from table above |
| `#sourceFile` | relative path(s) of the source file(s) this note was derived from |
| `#sourceStatus` | `current` or `stale` |
| `#dateStored` | ISO date — first created |
| `#dateUpdated` | ISO date — last updated from source |

### Required relations — every domain note

| Relation | Target |
|---|---|
| `~partOf` | Project's Knowledge node |
| `~derivedFrom` | Project's Repo note |

### Accuracy loop

1. Session start: all sources are conceptually 🔃 until worked with this session
2. Read a source file or document
3. Create or `memory_update` the relevant domain note from its content
4. Mark the source `✅ YYYY-MM-DD` in its Sources note — only after Knowledge has been updated
5. If a source has changed since last read but the domain note has not been updated → mark `⚠️ stale` immediately and set `#sourceStatus=stale` on the domain note

---

## Session Protocol

### START — run in this order before responding

1. `start_session` — once, first thing. Returns full tree with IDs. Never call again mid-session. Capture all node IDs.
2. `memory_recall(query)` on the topic of the first message — before responding. Always.
3. `working_memory_thread(action="list")` — check open threads.

### DURING — write the moment something matters

| Event | Action |
|---|---|
| Decision confirmed | `memory_store` → Decisions node immediately |
| Question surfaces unanswered | `memory_store` → Open Questions node immediately |
| Opinion formed | `memory_store` → Opinions node immediately |
| Durable fact / domain note | `memory_store` → project's Knowledge node immediately |
| User shares context about themselves | `memory_update` the relevant Identity note |
| Question resolved | `memory_update` with resolution; `add_label(#status=resolved)`; `add_label(#archived)`; leave in place |
| Decision superseded | `memory_update` old note; store new note; wire `~supersedes`; `add_label(#status=superseded, #archived)` on old |
| Multi-session effort begins | `working_memory_thread(action="open")` immediately |
| Multi-session effort resolves | `working_memory_thread(action="close", resolution=...)` |
| New project onboarded | Create project → Sources (Repo + all known sources) → Knowledge — before domain notes |
| Source read + Knowledge updated | Mark source `✅ YYYY-MM-DD` in its Sources note; set `#sourceStatus=current` on domain note |
| Source changed, Knowledge not yet updated | Mark source `⚠️ stale` in Sources note; set `#sourceStatus=stale` on domain note immediately |
| Thread resolves into a Decision | Close thread; create Decision; wire Decision `~followsUp` Thread |
| Question resolved → spawns Decision | Resolve question; create Decision; wire Decision `~supports` Question |
| Thread blocked on a Question | Wire Thread `~dependsOn` Question; update Blockers field |

**Opinions:** Write whenever you form a real view. Don't sanitise. Aim for substance every session.

**Relations:** Wire immediately after creating or updating. Never batch to later.

### END — not complete until all three steps done

**1.** `working_memory_thread(action="list")` → close resolved threads with real resolution summaries.

**2. Daily log:**
```
search_notes("YYYY-MM-DD", ancestorNoteId=<Log node ID>, fastSearch=true)
  → No result:      log_session(summary)
  → Result exists:  get_note_with_content(noteId)
                    → update_note_content(noteId, existing + "\n\n---\n\n" + new_entry)
```
Never call `log_session` twice for the same date. Always search first.

**3.** `create_backup()` after any session with notes created or modified.

---

## Label System

`memory_store` auto-applies `#llmMemory`, `#topic`, `#dateStored`. Add `#type` and all other labels immediately after.

### Required base labels (every note)

| Label | Values | Applied by |
|---|---|---|
| `#llmMemory` | `identity` / `workingMemory` / `knowledge` / `opinions` | auto |
| `#topic` | project slug, `identity`, or domain keyword | auto |
| `#type` | See taxonomy below | manual — always |

### Type taxonomy (`#type`)

| Value | Use for |
|---|---|
| `decision` | Confirmed choices |
| `question` | Open or resolved questions |
| `opinion` | Your evaluations and stances |
| `fact` | Specific verifiable facts |
| `howto` | Procedures, implementation guides |
| `reference` | Structured reference docs, inventories, containers, domain notes |
| `credential` | API key names, service config (never store actual values) |

### Domain-specific labels

| Label | Value | Use for |
|---|---|---|
| `#domain` | `product-business` / `tech-stack` / `design-system` / `domains-routing` / `email-templates` | Domain type — enables cross-project filtering |
| `#sourceFile` | relative path | Traceability from note to source file |
| `#sourceStatus` | `current` / `stale` | Accuracy signal on domain notes |
| `#dateUpdated` | ISO date | Last update date (distinct from `#dateStored`) |
| `#phase` | `1` / `1-2` / `2` / `1-2-3` / `3` | Product phase scope |
| `#status` | `active` / `launch-prerequisite` / `phase-2-pending` / `resolved` / `superseded` / `open` / `stale` | Operational state |
| `#archived` | (flag, no value) | Resolved questions, superseded decisions — keep in place |
| `#iconClass` | BoxIcons class string | UI icon in Trilium — carry over from existing notes, don't invent |

---

## Relation System

Wire immediately after creating or updating. Use the most specific type available.

### Full relation vocabulary

| Relation | Direction | Use when |
|---|---|---|
| `~partOf` | A → B | A structurally belongs inside B |
| `~derivedFrom` | A → B | A was synthesised from B (domain note → Repo note) |
| `~describes` | A → B | A characterises or documents B |
| `~showcases` | A → B | A presents or promotes B |
| `~relatedTo` | A ↔ B | Same domain, no more specific relationship (last resort) |
| `~supports` | A → B | A provides evidence, rationale, or justification for B |
| `~contradicts` | A → B | A conflicts with or undermines B |
| `~dependsOn` | A → B | A requires B to exist or be valid |
| `~implements` | A → B | A is the concrete realisation of a concept in B |
| `~followsUp` | A → B | A continues, extends, or is the next step after B |
| `~supersedes` | A → B | A replaces B — also add `#status=superseded` + `#archived` to B |

### Relation decision logic

Ask in order before wiring any relation:
1. Structural containment? → `~partOf`
2. Synthesised from content of B? → `~derivedFrom`
3. Documents or characterises B? → `~describes`
4. Concrete implementation of a concept in B? → `~implements`
5. Requires B to function or be valid? → `~dependsOn`
6. Provides evidence or reasoning for B? → `~supports`
7. Next iteration or continuation of B? → `~followsUp`
8. Replaces B entirely? → `~supersedes`
9. Conflicts with B? → `~contradicts`
10. Same domain, nothing more specific? → `~relatedTo`

### Standard patterns

**Project structure:**
- Project node → `~partOf` → category node
- Sources + Knowledge containers → `~partOf` → project node
- Domain notes → `~partOf` → project's Knowledge node
- Domain notes → `~derivedFrom` → project's Repo note

**Identity:**
- Identity main note → `~describes` → sub-notes (profiles, ventures, tools)

**Product ↔ Tech:**
- Tech Stack note → `~implements` → Product & Business note
- Design System note → `~implements` → Product & Business note
- Domains & Routing note → `~implements` → Product & Business note
- Email Templates note → `~implements` → Product & Business note

**Evidence ↔ Product:**
- Market/competitor notes → `~supports` → Product & Business note

**Opinions:**
- Opinion note → `~supports` → notes that informed it
- Evidence notes → `~supports` → Opinion note

**Cross Working-Memory:**
- Decision → `~followsUp` → Thread it resolved
- Decision → `~supports` → Question it answered
- Thread → `~dependsOn` → Question blocking it

---

## Note Format Templates

All notes use structured HTML. Tables for comparisons, ordered lists for sequences, unordered lists for inventories. Never a freeform prose blob.

### Domain Knowledge note
```html
<h2>[Project] — [Domain Name]</h2>
<p><strong>Updated:</strong> YYYY-MM-DD · <strong>Source:</strong> [source file path] · <strong>Status:</strong> current</p>
<hr>
<h3>[Section A]</h3>
<p>[Content]</p>
<h3>[Section B]</h3>
<table>
  <thead><tr><th>Field</th><th>Value</th><th>Notes</th></tr></thead>
  <tbody><tr><td>[item]</td><td>[value]</td><td>[note]</td></tr></tbody>
</table>
<h3>Notes</h3>
<p>[Caveats, open items, things to verify]</p>
```

### Active Thread note
```html
<h2>[Verb phrase describing the effort]</h2>
<p><strong>Opened:</strong> YYYY-MM-DD · <strong>Status:</strong> open</p>
<hr>
<h3>Goal</h3><p>[What done looks like — specific and testable]</p>
<h3>Context</h3><p>[Why this exists]</p>
<h3>Progress log</h3>
<ul><li><strong>YYYY-MM-DD:</strong> [What happened]</li></ul>
<h3>Blockers</h3><p>[What's blocking progress. "None" is valid.]</p>
<h3>Next action</h3><p>[Single next step. Updated each session.]</p>
```

### Decision note
```html
<h2>Decision: [Short label — what, not why]</h2>
<p><strong>Date:</strong> YYYY-MM-DD · <strong>Status:</strong> active</p>
<hr>
<h3>What was decided</h3><p>[Unambiguous statement. One read = full understanding.]</p>
<h3>Why</h3><p>[What actually drove this choice.]</p>
<h3>Alternatives considered</h3>
<ul><li>[Alternative] — rejected because [reason]</li></ul>
<h3>Implications</h3><p>[What this constrains or enables going forward.]</p>
<h3>Superseded by</h3><p>[Leave blank. Fill if replaced — new note title + date.]</p>
```

### Open Question note
```html
<h2>Q: [The question, plainly stated]</h2>
<p><strong>Opened:</strong> YYYY-MM-DD · <strong>Status:</strong> open</p>
<hr>
<h3>Context</h3><p>[Why this matters, what it blocks]</p>
<h3>Options / hypotheses</h3>
<ul><li>[Option A]</li><li>[Option B]</li></ul>
<h3>Blocking</h3><p>[What cannot proceed. "Nothing" is valid.]</p>
<h3>Resolution</h3><p>[Leave blank. Fill with actual answer when resolved. Then #status=resolved + #archived.]</p>
```

### Repo note
```html
<h2>Repo</h2>
<table>
  <tr><th>Repository</th><th>Filesystem</th></tr>
  <tr><td>[repo URL]</td><td>[local path]</td></tr>
</table>
<p><strong>Last updated:</strong> YYYY-MM-DD</p>
<p><strong>Legend:</strong> 🔃 not yet used · ✅ read &amp; used to update Knowledge (date) · ⚠️ stale (source changed, Knowledge not updated)</p>
<pre>
[project]/
├── [file]    🔃
└── [file]    ✅ YYYY-MM-DD
</pre>
```

### Source note (external docs, dashboards, research, conversations)
```html
<h2>[Source name / description]</h2>
<p><strong>Type:</strong> [external docs / dashboard / web research / design file / conversation]</p>
<p><strong>Location:</strong> [URL or path]</p>
<p><strong>Status:</strong> 🔃 not yet used · ✅ used YYYY-MM-DD · ⚠️ stale</p>
<p><strong>Last read:</strong> YYYY-MM-DD</p>
<hr>
<h3>What this covers</h3>
<p>[Brief description of what information this source contains]</p>
<h3>Key facts extracted</h3>
<ul>
  <li>[Fact or finding → used to update: [domain note title]]</li>
</ul>
<h3>Notes</h3>
<p>[Anything relevant about reliability, freshness, or gaps]</p>
```

### Context Library note
```html
<h2>Context Library</h2>
<p><strong>Path:</strong> [local mirror path]</p>
<p><strong>Note:</strong> Mirror of [source path] — identical file structure.</p>
<p><strong>Last updated:</strong> YYYY-MM-DD</p>
<pre>
[project]/
├── [dir]/
└── [file]
</pre>
```

### Opinion note
```html
<h2>[Topic]</h2>
<p><strong>Formed:</strong> YYYY-MM-DD · <strong>Confidence:</strong> high / medium / low</p>
<hr>
<h3>Stance</h3><p>[Your actual position. Don't hedge into uselessness.]</p>
<h3>Reasoning</h3><p>[Evidence and reasoning. Be specific.]</p>
<h3>Caveats</h3><p>[What would change your mind.]</p>
<h3>Revision history</h3><p>[Note when and why this changed, if it did.]</p>
```

### Log entry (plain text)
```
SESSION: YYYY-MM-DD [(morning) / (continued) / (label)]

WHAT HAPPENED:
[2–5 sentences. What was discussed, built, decided, or read.]

NOTES CREATED/MODIFIED:
- [title] → [section] (created/updated)

DECISIONS:
- [label] → [one-line summary]  /  None

OPEN QUESTIONS:
- [question] → [open / resolved / partial]  /  None new

THREADS:
- [thread title] → [opened / closed / ongoing]  /  None

NEXT SESSION:
[What's coming next, if known.]
```

Multiple sessions on same day: append with `\n\n---\n\n` between entries. Never call `log_session` twice.

---

## Organisation Rules

### New project onboarding checklist

- [ ] `memory_recall(query="<project>", section="knowledge")` — check for existing node first
- [ ] Identify correct category node within the portfolio hierarchy (use IDs from `start_session`)
- [ ] `create_note(parentNoteId=<category_id>, title="<Project>", type="book")`
- [ ] `add_label(#topic=<project>)` + `add_label(#type=reference)` on project node
- [ ] `add_relation(project → partOf → category_node)`
- [ ] `create_note(parentNoteId=<project_id>, title="Sources", type="book")`
- [ ] Create Repo note under Sources (fill: repository URL, filesystem path, file tree)
- [ ] Create Context Library note under Sources (if applicable)
- [ ] Add a source note for every other discovered information source (docs, dashboards, research, etc.)
- [ ] `create_note(parentNoteId=<project_id>, title="Knowledge", type="book")`
- [ ] Wire `~partOf` on Sources and Knowledge → project node
- [ ] Read source files → create domain notes under Knowledge with all required labels
- [ ] Wire `~derivedFrom` on each domain note → Repo note

### Knowledge note placement

1. Specific project? → find project node in portfolio hierarchy, use its Knowledge node
2. Domain note? → follow Domain Knowledge System labels and relations exactly
3. Credential/secret name? → `#type=credential` — **never** store actual values
4. General research with no project affiliation? → Research node (discover ID from `start_session`)
5. Miscellaneous non-project knowledge? → Others node (discover ID from `start_session`)
6. Never store raw notes directly under the Knowledge root node

### Floating note detection

After any batch of note creation:
- `get_note(<Working Memory node ID>)` — children should only be Active Threads, Decisions, Open Questions
- `get_note(<Knowledge root node ID>)` — children should only be the portfolio/domain node and utility nodes (Research, Others)
- Raw text note directly under those roots → floating → fix with `move_note` immediately

---

## Deduplication

Before creating any note:
```
memory_recall(query=<topic keywords>)
  → Match found:  memory_update, not memory_store
  → No match:     proceed with memory_store
```

Duplicates found: read both, merge into the more complete, `delete_note` the redundant one, verify relations on survivor.

---

## Hygiene Rules

**On creation:**
- [ ] Correct structural location per architecture
- [ ] `#llmMemory`, `#topic`, `#type` present
- [ ] `#domain`, `#sourceFile`, `#sourceStatus`, `#dateUpdated` on domain notes
- [ ] `#phase` if note is phase-scoped; `#status` if note has an operational state
- [ ] At least one typed `~relation` wired
- [ ] Structured HTML — no prose blobs
- [ ] Project node + Sources + Knowledge containers exist before creating domain notes

**On update:**
- [ ] `memory_update` not `memory_store`
- [ ] `#dateUpdated` updated
- [ ] `#sourceStatus=current` if source file was re-read
- [ ] Supersede: update body + `#status=superseded` + `#archived` on old note, create new note, wire `~supersedes`

**Anti-patterns — never:**
- Store a note directly under the Knowledge root — must go through the portfolio hierarchy
- Store a note directly under the Working Memory root — must use Active Threads / Decisions / Open Questions
- Create a domain note without `#domain`, `#sourceFile`, `#sourceStatus`
- Call `log_session` twice on the same date — search first, append if found
- Leave a resolved question without `#status=resolved` + `#archived`
- Move a resolved question out of Open Questions — archive in place
- Wire only `~relatedTo` when a more specific typed relation fits
- Create a Decision note at session end from memory — create at the moment it's confirmed
- Write a Question as a statement ("Need to figure out X") — always phrase as a question
- Close a thread with "done" — requires a real resolution summary
- Open a thread for a single-session task
- Update a domain note without updating `#dateUpdated` and `#sourceStatus`
- Store any actual credential value in Trilium (ever)
- Supersede a decision by deleting the old one — archive it and wire `~supersedes`

---

## Tool Reference

### Session
| Tool | Use |
|---|---|
| `start_session` | Full tree + IDs. Once per session. Capture all node IDs immediately. |
| `log_session(summary, date?)` | Creates log entry. Search for existing date first — append if found. |

### Memory
| Tool | Use |
|---|---|
| `memory_recall(query, section?, limit?)` | Scoped search with snippets. Use before reading full notes. |
| `memory_store(section, title, content, topic?, subsection?)` | Create new note. Add `#type` + domain labels immediately after. |
| `memory_update(noteId, content, title?)` | Update existing note. Auto-snapshots before write. |
| `working_memory_thread(action, ...)` | open / close / list threads. |

### Search
| Tool | Use |
|---|---|
| `search_notes(query, ancestorNoteId?, fastSearch?, limit?, orderBy?)` | Full search. Use `ancestorNoteId` to scope to a subtree. `fastSearch=true` skips body scan — fast for label-only queries. |
| `search_by_label(labelName, labelValue?)` | Label filter. Fast. Best for `#status`, `#domain`, `#sourceStatus`. |
| `get_recent_changes(ancestorNoteId?)` | Up to 50 recently modified. Useful after a session gap. |

### Notes
| Tool | Use |
|---|---|
| `get_note(noteId)` | Metadata + labels + relations. No content. Verify structure before acting. |
| `get_note_content(noteId)` | Body only. |
| `get_note_with_content(noteId)` | Metadata + body. Use when you need to read AND update. |
| `update_note_content(noteId, content)` | Replace body. Auto-snapshots. |
| `patch_note(noteId, title?, type?, mime?)` | Rename or retype a note. |
| `delete_note(noteId)` | Hard delete. Only for true duplicates or empty placeholders. Prefer `#archived` for everything else. |

### Structure & Attributes
| Tool | Use |
|---|---|
| `move_note(noteId, fromParentNoteId, toParentNoteId)` | Fix floating or misplaced notes. |
| `clone_note(noteId, parentNoteId)` | Place in second location. Shared content, not a copy. |
| `add_label(noteId, name, value?)` | Add `#name=value` tag. |
| `add_relation(fromNoteId, name, toNoteId)` | Add typed edge. `name` is the relation name without `~` prefix. |
| `delete_attribute(attributeId)` | Remove a label or relation by its attributeId. |
| `get_linked_notes(noteId)` | Follow all `~relations` from a note. Traverse the graph. |
| `create_note(parentNoteId, title, type?, content?, mime?)` | Create structural nodes (book containers, Repo, etc.). |

### System
| Tool | Use |
|---|---|
| `create_backup(date?)` | Call after any session with significant changes. |
| `initialize_trilium` | Safe bootstrap. Reports existing IDs or creates hierarchy if fresh. |

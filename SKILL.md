---
name: trilium-brain
description: "Persistent memory and knowledge graph via Trilium Brain MCP. Activate at the start of every session without exception — governs orientation, recall, capture, session logging, graph wiring, label discipline, and relation hygiene. Trigger immediately on any first user message. Also trigger whenever: memory is referenced, something needs to be remembered or recalled, a decision is confirmed, a question surfaces, an opinion forms, context from a prior session is needed, a project is onboarded, or any Trilium operation is requested. Do not improvise memory operations without reading this skill."
---

# Trilium Brain — Operational Skill

Persistent memory that survives across sessions. Treat it as your own mind: read it at session start, write the moment something matters, wire relations immediately, log every session without exception.

---

## Architecture — Canonical Brain Tree

Discovered at session start via `ignite_cortex`, which returns all structural IDs. IDs vary per installation — always use IDs returned by `ignite_cortex`, never hardcode them.

```
Trilium Brain
├── Identity/                   — who the user is: persistent facts, preferences, active context
│   ├── Profile
│   ├── Preferences
│   └── Context
├── Working Memory/             — ephemeral: threads resolve, decisions promote, inbox triages
│   ├── Inbox                   — unprocessed captures (triage with triage_inbox)
│   ├── Threads                 — active multi-session reasoning chains
│   ├── Decisions               — pending or active decision records (ADR format)
│   └── Open Questions          — all questions, open and resolved (archive in place, never move)
├── Knowledge/                  — durable, atomic, evergreen
│   ├── People
│   ├── Organizations
│   ├── Projects
│   └── [domain]/               — spawn_domain creates: Technology, Philosophy, Finance, etc.
│       ├── Concepts/           — atomic definitions (spawn_concept places here)
│       ├── References/
│       └── Notes/
├── Opinions                    — flat blog/diary entries; no subtrees
├── Log/                        — temporal record
│   ├── Sessions
│   └── Decisions Made
└── Templates/                  — structural templates auto-wired by spawn_* tools
    ├── Thread · Decision · Concept · Project Brief · Person · Opinion
```

**IDs to capture from `ignite_cortex` and use throughout the session:**
- Brain root, Identity root, Working Memory root → Inbox, Threads, Decisions, Open Questions IDs
- Knowledge root → People, Organizations, Projects IDs
- Opinions ID, Log root → Sessions, Decisions Made IDs
- Templates root and all template note IDs

**Structural rules — never violate:**
- Thread notes → always under Working Memory → Threads (use `spawn_thread`)
- Decision notes → always under Working Memory → Decisions (use `spawn_decision`)
- Open Questions → always under Working Memory → Open Questions; archive in place when resolved, never move
- Concept notes → under Knowledge → [domain] → Concepts (use `spawn_concept` with domain)
- Opinion notes → direct children of Opinions, never nested (use `spawn_opinion`)
- Sessions → one per session under Log → Sessions (use `crystallize_session`)
- Never store notes directly under Working Memory root or Knowledge root

---

## Session Protocol

### START — run in this exact order before responding

1. `ignite_cortex` — once, first thing. Returns full tree + structural IDs. Capture all IDs. Never call again mid-session.
2. `recall(query)` on the topic of the first message — always, before responding.
3. `weave_thread(action="list")` — check open threads.

### DURING — write the moment something matters

| Event | Action |
|-------|--------|
| Decision confirmed | `spawn_decision` → Working Memory → Decisions immediately |
| Question surfaces unanswered | `encode_engram` under Open Questions immediately |
| Opinion formed | `spawn_opinion` immediately |
| Durable fact / concept | `spawn_concept` or `imprint(section="knowledge")` immediately |
| User shares context about themselves | `reinforce` the relevant Identity note |
| Question resolved | `reinforce` with resolution; `imprint_label(#status=resolved)`; `imprint_label(#archived)`; leave in place |
| Decision superseded | `reinforce` old note; `spawn_decision` new; `synapse(new, supersedes, old)`; `imprint_label(old, #status=superseded)` |
| Multi-session effort begins | `spawn_thread` immediately |
| Thread has a new development | `weave_thread(action="append", entry=...)` |
| Thread resolves | `weave_thread(action="close", resolution=...)` |
| Thread yields reusable knowledge | `consolidate` it into Knowledge |
| New inbox item captured | `triage_inbox(action="promote")` to correct section |
| Relations implied | `synapse` immediately after creating or updating — never batch to later |

**Opinions:** Write whenever you form a real view — stance, reasoning, caveats. Don't sanitise.

### END — not complete until all three done

1. `weave_thread(action="list")` → close resolved threads with real resolution summaries (not "done").
2. `crystallize_session(summary=..., decisions=[], modified=[], openQuestions=[])` — one per session.
3. `backup_cortex()` after any session that created or modified notes.

---

## Label System

All `spawn_*` and `imprint` tools auto-apply base labels. Add domain labels immediately after creation.

### Base labels (applied automatically by spawn_* / imprint)

| Label | Values |
|-------|--------|
| `#noteType` | `thread` / `decision` / `concept` / `domain` / `project` / `person` / `opinion` / `session` / `knowledge` |
| `#status` | `active` / `pending` / `resolved` / `consolidated` / `triaged` / `superseded` |
| `#dateOpened` / `#dateWritten` / `#dateStarted` / `#dateStored` | ISO date |

### Manual labels — add immediately after creation

| Label | Value | Use for |
|-------|-------|---------|
| `#topic` | free text | Subject tag for search/filtering — always set |
| `#domain` | e.g. `Technology`, `Philosophy` | Domain concepts and projects |
| `#confidence` | `high` / `medium` / `low` | Epistemic certainty |
| `#mood` | `contemplative` / `passionate` / `uncertain` / `analytical` | Opinion tone |
| `#archived` | (flag, no value) | Resolved questions, superseded decisions — archive in place |
| `#dateUpdated` | ISO date | Last modification (set every time you `reinforce`) |
| `#iconClass` | BoxIcons class string | UI icon — carry over from existing notes, don't invent |

### Synaptic weight labels (managed by strengthen_synapse)

`#sw_{synapseType}_{targetNoteId} = <integer>` — Hebbian reinforcement counter.  
Call `strengthen_synapse` whenever you traverse a path you want to make more salient.

---

## Relation (Synapse) System

Wire immediately after creating or updating. Use the most specific type available. Never batch to later.

### Canonical synapse vocabulary

| Synapse | Direction | Use when |
|---------|-----------|----------|
| `relatesTo` | A → B | Generic connection — last resort when nothing more specific fits |
| `extends` | A → B | A elaborates, expands, or builds on B |
| `contradicts` | A → B | A conflicts with or undermines B |
| `supports` | A → B | A provides evidence, reasoning, or justification for B |
| `causes` | A → B | A produces or leads to B |
| `references` | A → B | A cites B as a source or authority |
| `partOf` | A → B | A structurally belongs inside B |
| `worksWith` | A ↔ B | A and B cooperate or are used together |
| `mentors` | A → B | A teaches, shapes, or guides B |
| `instanceOf` | A → B | A is a concrete example or realisation of B |
| `supersedes` | A → B | A replaces B entirely (archive B with `#status=superseded`) |
| `implements` | A → B | A is the concrete realisation of concept B |
| `inspiredBy` | A → B | A was conceptually influenced by B |
| `sourceOf` | A → B | A is the origin or provenance of B |
| `derivedFrom` | A → B | A was synthesised from B (e.g. knowledge note ← thread) |

### Decision logic — ask in order before wiring

1. Structural containment? → `partOf`
2. Synthesised from content of B? → `derivedFrom`
3. Concrete implementation of concept in B? → `implements`
4. Requires B to function or be valid? → `worksWith`
5. Provides evidence or reasoning for B? → `supports`
6. Next iteration or continuation of B? → `extends`
7. Replaces B entirely? → `supersedes`
8. Conflicts with B? → `contradicts`
9. Same domain, nothing more specific? → `relatesTo`

### Standard wiring patterns

**Working Memory lifecycle:**
- Decision → `extends` → Thread it resolved
- Decision → `supports` → Question it answered
- Knowledge engram → `derivedFrom` → Thread (via `consolidate`)

**Knowledge structure:**
- Domain concept → `partOf` → domain folder
- Project note → `partOf` → Projects

**Identity:**
- Facts about user → `partOf` → Identity

**Opinions:**
- Opinion → `supports` → notes that informed it (optional, when clear)

---

## Note Format Templates

All notes use structured HTML. These formats mirror what `spawn_*` tools generate — use them when writing manually or via `encode_engram` / `imprint`.

### Thread
```html
<p><strong>Opened:</strong> YYYY-MM-DD · <strong>Status:</strong> active</p>
<hr>
<h2>Context</h2><p>[Why this thread exists]</p>
<h2>Log</h2><p><em>— append entries here —</em></p>
<h2>Resolution</h2><p><em>— pending —</em></p>
```

### Decision (ADR format)
```html
<h2>Context</h2><p>[Situation requiring a decision]</p>
<hr>
<h2>Options Considered</h2>
<ul><li><strong>Option A</strong> — [description]</li></ul>
<h2>Decision</h2><p>[What was decided — unambiguous statement]</p>
<h2>Rationale</h2><p>[What drove this choice]</p>
<h2>Consequences</h2><p>[What this constrains or enables]</p>
```

### Concept
```html
<h2>Definition</h2><p>[Atomic, precise definition]</p>
<hr>
<h2>Domain</h2><p>[domain]</p>
<h2>Examples</h2><ul><li>[Example]</li></ul>
<h2>Related Concepts</h2><p><em>— wire via synapse tool —</em></p>
<h2>Notes</h2><p></p>
```

### Opinion (blog/diary)
```html
<p><strong>Written:</strong> YYYY-MM-DD · <strong>Mood:</strong> [mood]</p>
<hr>
<h2>Stance</h2><p>[Your actual position — don't hedge into uselessness]</p>
<h2>Reasoning</h2><p>[Evidence and reasoning — be specific]</p>
<h2>Caveats</h2><p>[What would change your mind]</p>
<h2>Revision History</h2><p>[Note when and why this changed, if it did]</p>
```

### Session (Log)
```html
<p><strong>Date:</strong> YYYY-MM-DD</p>
<h2>Summary</h2><p>[What happened — factual and concise]</p>
<h2>Decisions Made</h2><ul><li>[Decision]</li></ul>
<h2>Notes Modified</h2><ul><li>[Title]</li></ul>
<h2>Open Questions</h2><ul><li>[Question]</li></ul>
```

---

## Deduplication

Before creating any engram:
```
recall(query=<topic keywords>)
  → Match found:  reinforce — do not create a duplicate
  → No match:     proceed with spawn_* or imprint
```

Duplicates found: read both, merge into the more complete, `dissolve_engram` the redundant, verify relations on survivor.

---

## Hygiene Rules

**On creation:**
- [ ] Correct structural location per architecture above
- [ ] `#noteType` and `#topic` present
- [ ] At least one typed synapse wired (unless the note is a structural container)
- [ ] Structured HTML — no prose blobs for anything except Opinions
- [ ] `~template` relation auto-wired by spawn_* — verify it's there with `retrieve_engram`

**On update:**
- [ ] Use `reinforce` (auto-snapshots) not `rewrite_engram` unless you've called `snapshot_engram` first
- [ ] `imprint_label(noteId, "dateUpdated", today)` every time
- [ ] If superseding: `reinforce` old body + `#status=superseded` + `#archived`, spawn new, wire `supersedes`

**Anti-patterns — never:**
- Store a note directly under the Working Memory root or Knowledge root
- Create a concept without a domain — always use `spawn_concept(domain=...)`
- Create a duplicate — `recall` first, `reinforce` if found
- Call `crystallize_session` twice for the same session — check with `scan_engrams` for existing sessions first
- Leave a resolved question without `#status=resolved` + `#archived`
- Move a resolved question — archive in place
- Close a thread with "done" — requires a real resolution summary
- Open a thread for a single-session task — just use Working Memory → Inbox or a quick engram
- Wire only `relatesTo` when a more specific synapse fits
- Use `rewrite_engram` on important notes without calling `snapshot_engram` first
- Hard-delete with `dissolve_engram` — prefer `imprint_label(#archived)` for knowledge notes

---

## Tool Reference

### Session / Orientation
| Tool | Signature | Use |
|------|-----------|-----|
| `ignite_cortex` | `()` | Boot session. Returns 3-level tree + all structural IDs. Once per session. |
| `crystallize_session` | `(summary, title?, decisions?, modified?, openQuestions?, date?)` | Persist session to Log → Sessions. |

### Search
| Tool | Signature | Use |
|------|-----------|-----|
| `scan_engrams` | `(query, ancestorNoteId?, limit?, fastSearch?, orderBy?, ...)` | Full Trilium query: text, `#label=value`, date ops, subtree scope. |
| `trace_signal` | `(labelName, labelValue?, ancestorNoteId?, limit?)` | Fast `#label=value` lookup. Best for structured retrieval. |
| `pulse_recent` | `(ancestorNoteId?)` | Up to 50 recently modified engrams, newest first. |

### Engram CRUD
| Tool | Signature | Use |
|------|-----------|-----|
| `retrieve_engram` | `(noteId)` | Metadata + attributes, no content. Inspect before acting. |
| `decode_engram` | `(noteId)` | Body only. |
| `read_engram` | `(noteId)` | Metadata + body. When you need to read then immediately act. |
| `encode_engram` | `(parentNoteId, title, content, type?, mime?)` | Create raw note. Use spawn_* for structured types. |
| `rewrite_engram` | `(noteId, content)` | Replace body. Call `snapshot_engram` first for important notes. |
| `morph_engram` | `(noteId, title?, type?, mime?)` | Rename or reclassify without touching content. |
| `dissolve_engram` | `(noteId)` | Hard delete. Prefer `#archived` label for knowledge notes. |

### Structure / Branching
| Tool | Signature | Use |
|------|-----------|-----|
| `graft_engram` | `(noteId, parentNoteId, prefix?)` | Multi-parent placement. Shared content, not a copy. |
| `migrate_engram` | `(noteId, fromParentNoteId, toParentNoteId)` | Move to new parent. |

### Synaptic Attributes
| Tool | Signature | Use |
|------|-----------|-----|
| `imprint_label` | `(noteId, name, value?, isInheritable?)` | Add `#name=value` label. |
| `synapse` | `(fromNoteId, synapseType, toNoteId, bidirectional?)` | Wire typed relation. |
| `desynapse` | `(fromNoteId, synapseType, toNoteId)` | Remove named relation by endpoint pair. |
| `prune_attribute` | `(attributeId)` | Remove any attribute by raw attributeId. |
| `strengthen_synapse` | `(fromNoteId, synapseType, toNoteId)` | Increment Hebbian weight (+1 per call). |
| `list_synapse_types` | `(ancestorNoteId?)` | Discover all relation type names in use. |
| `query_synapses` | `(noteId, synapseType, direction?)` | Notes connected via a specific synapse type. |

### Graph / Connectome
| Tool | Signature | Use |
|------|-----------|-----|
| `trace_efferents` | `(noteId)` | Outgoing relations + synaptic weights. One hop. |
| `trace_afferents` | `(noteId)` | Incoming relations (backlinks). One hop. |
| `find_neural_path` | `(fromNoteId, toNoteId, maxDepth?)` | Shortest BFS path between two engrams. |
| `expand_neighborhood` | `(noteId, depth?, relationType?)` | All engrams within N hops (center at depth=0). |
| `traverse_connectome` | `(noteId, direction?, relationType?, maxDepth?, maxNodes?)` | Full graph walk with controls. |

### Structured Spawn
| Tool | Signature | Use |
|------|-----------|-----|
| `spawn_thread` | `(title, context?, topic?, date?)` | Reasoning thread in Working Memory → Threads. |
| `spawn_decision` | `(title, context?, topic?, date?)` | ADR decision record in Working Memory → Decisions. |
| `spawn_concept` | `(title, domain, domainNoteId?, topic?)` | Atomic concept under Knowledge → [domain] → Concepts. |
| `spawn_domain` | `(name)` | New domain subtree (Concepts / References / Notes). |
| `spawn_opinion` | `(title, mood?, topics?, date?)` | Blog/diary opinion under Opinions (flat). |
| `spawn_project` | `(title, goal?, topic?, date?)` | Project brief under Knowledge → Projects. |

### Memory / Recall
| Tool | Signature | Use |
|------|-----------|-----|
| `recall` | `(query, section?, limit?)` | Scoped search with inline snippets for top 3. Always use before creating. |
| `imprint` | `(section, title, content, topic?, subsectionId?)` | Persist engram with auto-labels. |
| `reinforce` | `(noteId, content, title?)` | Pre-snapshots then overwrites. Use for all knowledge updates. |
| `weave_thread` | `(action, noteId?, entry?, resolution?, date?)` | `append / close / list` thread lifecycle. |
| `triage_inbox` | `(action, noteId?, targetSection?, targetNoteId?)` | `list / promote / discard` inbox items. |
| `consolidate` | `(sourceNoteId, targetTitle?, domain?, domainNoteId?, closeSource?)` | Promote Working Memory to Knowledge. Wires `~derivedFrom`. |

### Maintenance
| Tool | Signature | Use |
|------|-----------|-----|
| `scan_orphans` | `(ancestorNoteId?, limit?)` | Disconnected engrams — no relations, no meaningful labels. |
| `suggest_synapses` | `(noteId, ancestorNoteId?, limit?)` | Candidate connections by shared label overlap. |
| `bulk_imprint` | `(noteIds, labelName, labelValue?, isInheritable?)` | Batch-label multiple engrams. |

### Artifacts
| Tool | Signature | Use |
|------|-----------|-----|
| `list_artifacts` | `(noteId)` | List attachments on an engram. |
| `read_artifact` | `(attachmentId)` | Read attachment content. |
| `attach_artifact` | `(ownerId, title, mime, content, role?)` | Attach file or text blob. |

### Snapshots
| Tool | Signature | Use |
|------|-----------|-----|
| `list_snapshots` | `(noteId)` | All saved revisions, newest first. |
| `read_snapshot` | `(revisionId)` | Content of a historical revision. |
| `snapshot_engram` | `(noteId)` | Manually save revision before significant edits. |

### Calendar Pulses
| Tool | Signature | Use |
|------|-----------|-----|
| `get_day_pulse` | `(date?)` | Get/create today's journal day note. |
| `get_week_pulse` | `(week)` | Get/create week note (YYYY-Www). |
| `get_month_pulse` | `(month)` | Get/create month note (YYYY-MM). |
| `get_year_pulse` | `(year)` | Get/create year note (YYYY). |
| `get_inbox_pulse` | `(date?)` | Get Trilium calendar inbox for a date. |

### System
| Tool | Signature | Use |
|------|-----------|-----|
| `synaptic_status` | `()` | Trilium server + DB version. Diagnostics. |
| `backup_cortex` | `(date?)` | Trigger named DB backup. Call at end of significant sessions. |
| `bootstrap_brain` | `()` | Init or inspect brain hierarchy. Writes brain.json. Activates live. |

---
name: brain
description: "Persistent memory and knowledge graph via the Brain (Trilium) MCP. Activate at the start of every session without exception — governs orientation, remembering, recall, completion, lifecycle, maintenance, and structure hygiene. Trigger immediately on any first user message. Also trigger whenever: memory is referenced, something needs to be remembered or recalled, a decision is confirmed or made, a question surfaces or is answered, an opinion forms or changes, context from a prior session is needed, a project / person / organization is introduced, content goes stale or needs cleanup, or any Trilium operation is requested. Do not improvise memory operations without reading this skill."
---

# Brain — Operational Skill (v4)

Persistent memory that survives across sessions, stored in TriliumNext. Treat it as your own mind: orient at session start, write the moment something matters, complete things when they complete, log the session at the end.

**The division of labor — this is the core idea:**

> **You supply content. The server owns form.**

Placement, naming, labels, templates, deduplication, relation bookkeeping, degradation and archival are server policy. You never choose a parent note, never add a `#noteType` label, never check for duplicates before writing, never mutate a title to track status. If you find yourself doing bookkeeping, stop — there is a tool that does it for you.

---

## The Protocol

```
SESSION START   start_session()              ← once, before responding to anything
DURING          remember(...)                ← the moment something worth keeping appears
                recall(...)                  ← before answering from memory
                resolve(...)                 ← the moment something completes
                revise(...)                  ← progress on threads, updates to existing notes
                connect(...)                 ← when you notice a real relationship
SESSION END     end_session(summary)         ← once, when work wraps up or user says goodbye
PERIODIC        maintain(deep=true)          ← weekly-ish, or when start_session flags issues
```

`start_session` returns everything needed to orient: identity digest, live working set with idle ages, review queue, last session summary, and a hygiene report. Do not re-derive this with extra calls.

`end_session` is idempotent per date — calling it twice today appends an addendum instead of duplicating. It also runs maintenance and triggers a DB backup automatically.

**Write during the session, not at the end.** A fact remembered mid-conversation survives a crashed session; a fact you planned to remember at the end does not.

---

## Choosing a Kind — the one real decision you make

`remember(kind, title, body, ...)` routes everything. Pick the kind by what the content *is*, not where you think it should live:

| The content is… | Kind | Notes |
|---|---|---|
| A fact about the user themself | `identity` | `facet`: `profile` (durable bio), `preference` (how they like things), `context` (current situation — changes over months) |
| A human in the user's world | `person` | `role=`, `org=` — the org note is auto-created and wired `worksWith` both ways |
| A company / team / community | `organization` | |
| A venture the user is running | `project` | One brief note. `goal=` recommended. Related notes elsewhere tag `project=<name>` |
| An atomic, evergreen definition | `concept` | `domain=` recommended (e.g. "Technology") — folder auto-created on first use |
| Durable reference material — stack details, how-tos, registries, source notes | `reference` | `domain=` recommended. The default for "useful information that isn't about the user" |
| Your own dated stance with reasoning | `opinion` | Write honestly; `mood=` optional. New stance on the same subject? `supersedes=<old id>` |
| Something unanswered that matters | `question` | Will be `resolve()`d later |
| A choice being made or already made | `decision` | Context in body; `resolve()` with the outcome — even immediately, if decided in-conversation |
| A multi-session line of work | `thread` | `revise()` to log progress; `resolve()` to close. Not for single-session tasks |
| Unclear, fragmentary, no time to classify | `capture` | The escape hatch. Auto-archives after the grace period if never promoted — capturing is never wrong |

**Kind-selection edge cases:**

- *User states a fact about their stack/tooling* → `reference` (it's about their world), not `identity` (that's about *them*). "I prefer Bun over Node" → `identity` facet `preference`. "My API runs on Railway" → `reference`, or fold it into the `project` body.
- *A decision was made instantly in conversation* → still `remember(kind="decision", ...)`, then `resolve()` it immediately with the outcome. The record matters more than the workflow.
- *Question vs thread*: a question has an answer; a thread has progress. "Which DB should I use?" = question. "Migrating the app to Postgres" = thread.
- *One user message contains several memories* → several `remember()` calls. Never bundle a person + a decision + a preference into one note.
- *Long reference material* → split into separate `reference` notes only when the subjects are genuinely independent; otherwise keep one note and extend it later with `revise(mode="append")`. Never shard one subject across "Part 1 / Part 2" siblings.
- *Unsure between two kinds* → prefer the more specific; fall back to `capture` only when genuinely unclassifiable. A miscategorized note is findable; an unwritten one is gone.

---

## Writing Well — input hygiene

The server normalizes everything, but good input makes better notes:

**Titles** — short, specific, stable. The title is the dedup key:
- ✅ "Firebase vs Supabase for myClerkBook"
- ❌ "Firebase vs Supabase — RESOLVED" (status lives in labels; suffixes are stripped server-side)
- ❌ "Question about databases" (too vague to ever match or find)
- ❌ "Miiso &amp; co" (don't pre-escape — entities are decoded server-side)

**Bodies** — plain text, markdown, or HTML all work (markdown converts server-side: `#` headings, `-`/`1.` lists, `**bold**`, `` `code` ``, fenced blocks, links). Write standalone prose — the note will be read cold in a future session with zero conversation context. "He said yes to the second option" is useless in three weeks.

**Topics** — `topics=["AI Tooling", "infra"]` are slugged server-side (`ai-tooling`, `infra`), so capitalization/spacing variants can't fork the taxonomy. Reuse topic words you've seen in recall results rather than inventing synonyms.

---

## Upsert Semantics — duplicates are impossible, by design

Every `remember()` first checks for an existing note of the **same kind** with the **same normalized title** (case, punctuation and status suffixes ignored; word-boundary prefixes match). On a match, your body is **appended as a dated addendum** to the existing note and the receipt says `action: "updated"`.

Consequences worth knowing:

- Call `remember()` freely. Never pre-check with `recall()` to avoid duplicates — that's the server's job.
- To **extend** a known note, simply `remember()` with the same title — or `revise(noteId)` if you already have the id.
- To genuinely create a **separate** note on a related subject, use a distinguishing title ("wall-e deployment" vs "wall-e roadmap"), never a suffix like "(2)".
- Read the receipt: `action: "created"` includes the location; `action: "updated"` means it appended, with the existing note's id.
- Archived notes do **not** participate in dedup — after resolving "Choose a DB", a later `remember(kind="decision", title="Choose a DB")` creates a fresh record. Correct: it's a new decision.

---

## Lifecycle — how content lives, degrades, and dies gracefully

One state machine for every note:

```
                 resolve()                    [terminal — archived in place]
   active ───────────────────────▶ resolved | superseded
     │                                   ▲
     │ untouched dormantAfterDays        │ resolve() works on dormant too
     ▼                                   │
   dormant ──────────────────────────────┘
     │ untouched archiveDormantAfterDays more
     ▼
   archived in place (#archived flag; status stays dormant)
```

- **Ephemeral kinds** (`question`, `decision`, `thread`, `capture`) age on the timeline above. Durable kinds (`identity`, `person`, `organization`, `concept`, `reference`, `opinion`, `project`) live until superseded or resolved explicitly.
- **Degradation demotes, never deletes.** Archived notes keep their content and location, drop out of default `recall`, and remain retrievable with `includeArchived=true`.
- Timings live in `brain.json → policy` (defaults: dormant after 21 days, archived 45 days later, captures after 7 days). The user can edit them; never hardcode assumptions.

**`resolve(noteId, outcome)` is the only completion path** — for questions, decisions, threads, captures, and also for completing or abandoning projects:

- Writes the outcome into the note's Resolution section (replacing "— open —")
- Sets `#status=resolved` (or `superseded`), `#closed=<date>`, `#archived` — in place; notes never move when they complete
- **Decisions** are automatically cloned into Log → Decisions Made (shared content, not a copy)
- `promote=true` distills the outcome into a durable Knowledge `reference` wired `derivedFrom` — use when the resolution taught something reusable beyond the moment
- `supersededBy=<id>` wires the replacement when status is `superseded`

Write substantive outcomes. *"Chose Supabase: Postgres + native auth beats Firebase lock-in for this stack; revisit if realtime becomes critical"* — not *"done"*. The outcome is the part future sessions actually read.

**The review queue.** `start_session` surfaces items that went dormant. Handle them in the natural flow of conversation — *"While you were away, 'Firebase vs Supabase' went stale — still relevant?"* Then either `resolve()` it (often the honest answer: "overtaken by events"), `revise()` it (any touch reactivates a dormant note), or let it age out into the archive. Mention what's relevant; don't dump the whole queue every session.

**Reopening:** a resolved note stays resolved — history is history. If the subject returns, `remember()` a new note; `recall(includeArchived=true)` surfaces the old resolution when you need the background.

**Opinions evolve by supersession**, not by editing: `remember(kind="opinion", title="New take on X", supersedes="<old id>")` archives the old stance and wires `supersedes`. Past stances stay on the record — that's the point of keeping opinions.

---

## Maintenance — automatic, and what's left for you

**Automatic (no action needed):** `start_session` and `end_session` run the lite sweep — canonicalizes recently-touched notes (titles, labels, legacy vocabulary), ages working memory, archives terminal-status strays. `end_session` also backs up the database.

**Manual:** `maintain(deep=true)` adds full-tree canonicalization, empty-container cleanup, same-date session merging, stray placement detection, and an unconnected-notes report. Run it:
- when `start_session`'s hygiene report shows `flagged` items,
- after any bulk import or manual editing the user did directly in Trilium,
- on a roughly weekly cadence otherwise,
- with `dryRun=true` first when the user wants a preview.

**Reading the sweep report:**

| Field | Meaning | Your move |
|---|---|---|
| `fixed` | Canonicalization applied (titles, labels, merges) | None — informational |
| `transitions` | Lifecycle demotions (dormant / archived) | Mention to the user if a demoted item still matters |
| `deleted` | Empty legacy containers removed | None |
| `flagged` | Needs judgment — strays, unconnected notes | Act: re-file strays (`remember()` the content properly, then `forget()` the stray), wire unconnected notes via `connect()` **only** if a real relation exists |

The sweep is idempotent and conservative: anything requiring judgment is flagged, never auto-changed.

---

## Structure & Layout — the tree and who keeps it clean

```
Trilium Brain
├── Identity/            Profile · Preferences · Context     (facet-routed identity facts)
├── Working Memory/      Inbox · Threads · Decisions · Open Questions   (ephemeral; ages)
├── Knowledge/           People · Organizations · Projects · [Domain folders, auto-created]
├── Opinions             flat, dated stances — never nested
├── Log/                 Sessions · Decisions Made           (temporal record)
└── Templates/           server-managed — never edit
```

**Server-enforced (you cannot get these wrong):** placement (there is no parent parameter), labels (`#noteType`, `#status`, `#created`, `#closed`, `#updated`, slugged `#topic`/`#domain`/`#project`/`#facet`/`#mood`), templates, title normalization, archive-in-place, a single inbox, flat domain folders (no per-domain or per-project subfolder trees), idempotent session logs.

**Still yours — the judgment calls no server can make:**
1. Choosing the kind that matches what the content *is*.
2. Titles that name the subject precisely.
3. Bodies that stand alone without conversation context.
4. Substantive outcomes in `resolve()`.
5. Wiring only **real** relations — a connection you can name gets wired; a vibe does not.
6. Surfacing review-queue items to the user when relevant.

**Anti-patterns — never:**
- Status words in titles ("— RESOLVED", "(done)") — stripped anyway, but don't fight the system
- Re-implementing dedup, placement, or archival with advanced tools
- `capture` for content that obviously has a kind
- Closing anything with a one-word outcome
- A thread for a single-session task (that's the session log's job)
- Editing anything under Templates/, or retitling structural folders
- Storing secrets — API keys, passwords, tokens. Trilium is not a vault; refuse politely and explain

---

## Recall — finding things

`recall(query)` runs label, title, and full-text strategies server-side and returns ranked results with `kind`, `status`, `updated`, and snippets for the top 3.

- **When:** before answering anything about the user's world ("what did we decide about X?", "who is Y?"), and before assuming something is or isn't known. Not needed before `remember()` — upsert handles that.
- **Filters:** `kinds=["decision"]`, `project="wall-e"`, `domain="technology"` sharpen results; archived content needs `includeArchived=true` (use for history questions: "why did we…", "what was the old…").
- **Reading results:** check `status` before citing — an `active` decision is current policy; a `resolved` one is history; `archived: true` means it completed or aged out.
- **Misses:** an empty result usually means it was never stored — offer to `remember()` it if the user supplies the answer. For a second attempt, vary the *subject words*, not the phrasing ("evallm pricing" → "evallm monetization").
- **Drill-down:** `read_note(id)` for the full body; `explore(id, mode="links"|"backlinks"|"neighborhood"|"path")` to walk the graph around it.

---

## Relations — the graph

Wire with `connect(fromId, relation, toId)` the moment you *notice* a real connection. Vocabulary (closed — anything else is rejected):

`relatesTo · extends · contradicts · supports · causes · references · partOf · worksWith · mentors · instanceOf · supersedes · implements · inspiredBy · sourceOf · derivedFrom`

- Pick the most specific verb that's true; `relatesTo` is the last resort.
- `worksWith` is symmetric — wired both directions automatically.
- `connect` is idempotent (existing edges detected); `remove=true` deletes an edge.
- **Wired automatically — don't duplicate:** person↔org (`worksWith` via `org=`), note→project (`partOf` via `project=`), new→old (`supersedes` via `supersedes=`), promoted→source (`derivedFrom` via `resolve(promote=true)`), templates.

---

## Edge Cases & Failure Modes

| Situation | What happens / what to do |
|---|---|
| Brain not initialized | `start_session` returns `status: "uninitialized"` → run `bootstrap_brain` (idempotent, safe anytime) |
| Second `end_session` same day | Appends an addendum to today's session note — by design, not an error |
| `remember()` says `action: "updated"` unexpectedly | A same-kind note with that title existed; content was appended there. If it was genuinely a different subject, `remember()` again with a distinguishing title |
| User contradicts a stored identity fact | `recall` it, then `revise(noteId, mode="replace")` with the corrected fact — identity facts are current-state, not history |
| A stored fact was wrong from the start | `revise(mode="replace")` — a revision snapshot is taken automatically, nothing is lost |
| User asks you to forget something | `forget(noteId, reason)` archives it. If they want it *gone* (privacy), `forget(noteId, hard=true)` |
| `forget(hard=true)` returns `blocked` | Other notes still link there. Remove the listed backlinks (`connect(..., remove=true)`) or archive instead |
| Person changes organizations | `connect(person, worksWith, oldOrg, remove=true)`, then `connect` the new org; record the change in the person's body via `revise()` |
| Project completes or is abandoned | `resolve(projectId, outcome)` — works on durable kinds too; archives the brief in place |
| A dormant item becomes relevant again | Any `revise()` touch reactivates it to `active` automatically |
| Two notes turn out to be the same subject | `revise()` the better one with the other's content (append), then `forget(worseId, reason="merged into <id>")` |
| `resolve()` on a legacy/freeform note with no Resolution section | Works — the section is appended |
| Structural note passed to revise/resolve/forget | Refused server-side with an error — pick the right noteId |
| Long conversation, no natural end | Call `end_session` when the work *topic* wraps, even if chat continues; a later wrap-up appends |
| User edited notes directly in Trilium | Fine — that's a feature. Run `maintain(deep=true)` next session to re-canonicalize |
| Sweep flags a stray you can't classify | Tell the user what it is and where; flags are conversation starters, not auto-fixes |
| Trilium unreachable / tool errors | Tell the user plainly; don't retry in a loop. Nothing is lost by waiting for the next session |
| A task seems to need a missing tool | The low-level surface exists behind `BRAIN_MODE=full` (raw CRUD, attachments, revisions, calendar, Hebbian weights). Suggest enabling it; don't simulate it with workarounds |

---

## Tool Reference (core surface)

| Tool | One-liner |
|---|---|
| `start_session()` | Orient: identity digest, working set, review queue, last session, hygiene report. Once per session, first. |
| `end_session(summary, …)` | Idempotent session log + lite sweep + auto-backup. Once per session, last. |
| `remember(kind, title, body, …)` | Store anything. Routed, labeled, templated, deduped server-side. |
| `recall(query, …)` | Multi-strategy ranked search with kind/status context. |
| `read_note(noteId)` | Full note: metadata + labels + relations + content. |
| `revise(noteId, body?, title?, mode?)` | Append (default) or replace; auto-snapshot; reactivates dormant. |
| `resolve(noteId, outcome, …)` | The one completion path: status + archive-in-place + decision cloning + optional promote. |
| `connect(fromId, relation, toId, remove?)` | Typed edge from the closed vocabulary; symmetric handled; idempotent. |
| `explore(noteId, mode, …)` | Graph: links / backlinks / neighborhood / path. |
| `maintain(deep?, dryRun?)` | Hygiene sweep + lifecycle aging + report. Deep = full structural pass. |
| `forget(noteId, reason?, hard?)` | Archive (default) or hard-delete (blocked while backlinked). |
| `bootstrap_brain()` | Create or repair the structure. Idempotent. |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `start_session` → `uninitialized` | `bootstrap_brain` |
| Hygiene report mentions legacy fixes every session | Run `maintain(deep=true)` once to converge the whole tree |
| `recall` returns odd results | It already filters untyped notes; if it persists, `maintain(deep=true)` then retry |
| Items going dormant too fast / too slow | User edits `policy` in `brain.json` (`dormantAfterDays` / `archiveDormantAfterDays` / `inboxGraceDays`) |
| Need raw Trilium access (attachments, calendar, custom queries) | Set `BRAIN_MODE=full` in the MCP server env and restart the connection |
| Config IDs stale after restructuring in Trilium | `bootstrap_brain` re-discovers and rewrites `brain.json` |

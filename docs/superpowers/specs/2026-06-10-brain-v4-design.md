# Brain v4 — Zero-Oversight Rearchitecture

**Date:** 2026-06-10
**Status:** Approved direction — user granted full rearchitecting authority with three acceptance criteria:
1. Claude needs minimal-to-zero oversight during any Brain operation.
2. Content is organized gracefully and consistently.
3. Lifecycle management is seamless (including graceful degradation of ephemeral content).

---

## 1. Diagnosis

### Observed failures (live instance, 3 days of use)

| Symptom | Evidence |
|---|---|
| Lifecycle state mutated into titles | "Firebase vs Supabase — partially resolved", "What is pinboard? — RESOLVED" in Open Questions |
| Question notes carry **zero** labels | All 5 children of Open Questions have no `#noteType`, no `#status` — invisible to label search forever |
| HTML entities leaked into titles | "Miiso — Active Ventures &amp;amp; Platforms" |
| Typed-note system unused | 0 threads, 0 decisions, 0 concepts ever created; everything routed through `store_memory` / raw `create_note` |
| Container sprawl | 9 projects × empty `Decisions` + `Notes` subfolders = 18 dead container notes |
| `#noteType` vocabulary collision | `store_memory` writes section names (`identity`, `knowledge`) into the same label that `create_*` writes type names (`opinion`, `project`) into |
| Content fragmentation | One logical topic (user's stack) split across 3 sibling notes with ad-hoc title suffixes |
| Session titles inconsistent | "First session — Miiso onboarded" vs "Session 2 — …" vs "wall-e v1.6 ship + Brain update" |

### Root causes (why the model drifts)

1. **Policy lives in prose, not code.** The SKILL.md is ~600 lines of rules the model must remember and execute across 2–5 manual calls per event ("create, then label, then label again, then wire relation"). Every manual step is a defect opportunity. The evidence is conclusive: the fully-automated path (`log_session`) produced perfectly consistent notes; every manual recipe (questions, people, archival, supersession) drifted immediately.
2. **Too many degrees of freedom.** 60 tools, 8 creation paths, 2 inboxes, 3 update paths, per-project AND per-section decision homes. Equivalent choices with no forcing function → different choice every session.
3. **No idempotency anywhere.** Every create blindly creates. Dedup is a 2-call manual protocol. `add_label` can duplicate labels that `updateLabelValue` (existing, internal-only) would have deduped.
4. **No lifecycle engine.** Nothing ages, nothing degrades, nothing self-heals. Resolution/supersession/archival are multi-call recipes; questions don't even have a creation tool, let alone a resolution operation.
5. **No normalization layer.** Titles, topics, label values, and body HTML are stored exactly as the model emits them.

### Design thesis

> **The model supplies content; the server owns form.**
> Placement, naming, labeling, relation wiring, deduplication, degradation, and archival are deterministic server policy. If a convention matters, it is enforced in code — never requested in prose.

---

## 2. Approaches considered

**A. Incremental hardening** — keep all 60 tools, add validation inside each.
*Rejected:* fixes label drift but leaves the 8-way creation choice, dual inboxes, and manual lifecycle recipes — the primary drift sources — intact.

**B. Core surface + server policy engine (chosen)** — collapse the model-facing surface to ~12 intent-level tools with upsert semantics and a lifecycle sweep; keep the full low-level surface available behind `BRAIN_MODE=full` for power users / debugging.
*Why:* removes the decision surface (the proven failure mode), keeps the OSS project's capability story, migration is additive.

**C. Event-log architecture** — append-only capture stream + async organizer process.
*Rejected:* maximal consistency but requires background workers and breaks "Trilium notes are the source of truth"; overkill for a personal memory MCP.

---

## 3. The v4 design

### 3.1 Tool surface (core mode — default, 12 tools)

| Tool | Replaces | Behavior |
|---|---|---|
| `start_session` | start_session + recall + manage_thread(list) choreography | One call returns: identity digest, active working set (threads/decisions/questions with ages), review queue, last session summary, hygiene report. Runs the lite maintenance sweep first. |
| `end_session` | log_session + manual dup-check + create_backup | **Idempotent per date** (upserts; same-day calls append an addendum). Auto-backup. Runs lite sweep. |
| `remember` | create_thread/decision/concept/domain/opinion/project + store_memory + manual person/org/question recipes | One tool, `kind` enum routes everything. Server: normalizes title/topics, **dedup-upserts** (matching note → revise, not duplicate), places, labels, wires template + structural relations, auto-creates domain/project homes on demand. |
| `recall` | recall_memory + search_notes + search_notes_by_label guessing | Multi-strategy server-side: label → title-contains → fulltext, merged and ranked. Filters: kind, status, project, domain, includeArchived. Snippets are HTML-stripped text. |
| `read_note` | get_note + get_note_content + get_note_with_content | Metadata + content in one call. |
| `revise` | update_memory + update_note_content + patch_note + manage_thread(append) | Snapshot first, then append a dated section (default) or replace. Title fixes normalized. |
| `resolve` | manage_thread(close) + 3-call question recipe + 5-call supersession recipe | **Uniform completion for every ephemeral kind** (question/decision/thread/capture). Writes outcome into content, sets status, archives in place, wires relations, clones decisions to Log → Decisions Made, optional `promoteTo` knowledge. |
| `connect` | add_relation + delete_relation + strengthen/weaken | Relation name is a **closed enum**. Symmetric types auto-bidirectional. Existing edge → no-op. `remove: true` deletes. |
| `explore` | get_outgoing/incoming_relations + neighborhood + path + traverse + related | One graph tool: `mode = links / backlinks / neighborhood / path`. |
| `maintain` | nothing (the missing piece) | Deterministic sweep: title hygiene, label canonicalization, legacy-vocabulary migration, re-filing strays, empty-container cleanup, aging (active→dormant→archived), same-date session merge, orphan report. `deep` + `dryRun` params. **The migration tool and the self-healing tool are the same code.** |
| `forget` | delete_note + manual archive recipe | Default: archive in place. `hard: true` deletes after re-wiring backlinks. |
| `bootstrap_brain` | bootstrap_brain | Kept; also upgrades `brain.json` to v4 (policy block). |

`BRAIN_MODE=full` additionally registers the advanced surface (raw CRUD, attributes, attachments, revisions, calendar, clone/move, bulk ops, raw search) for users who want the v3 power tools. Default is core.

### 3.2 Canonical vocabulary (enforced by zod enums + normalization)

**Kinds** (`#noteType`): `identity` (+ `#facet`: profile/preference/context) · `person` · `organization` · `project` · `concept` · `reference` · `opinion` · `question` · `decision` · `thread` · `capture` · `session` (internal) · `domain` (internal, auto-created).

**Status** (`#status`): `active → resolved | superseded | dormant` ; `#archived` flag orthogonal (Trilium-native hiding). Uniform across all ephemeral kinds — a resolved question, a decided decision, and a closed thread all read `#status=resolved` + `#archived`.

**Dates:** exactly two write-time labels — `#created`, `#closed` (set by resolve/archive). `#updated` maintained by revise. The v3 zoo (`dateOpened/dateStarted/dateWritten/dateStored/dateUpdated/dateClosed/sessionDate/dateConsolidated`) is migrated to these by `maintain`.

**Topics** (`#topic`, repeatable): server-slugged (`lowercase-kebab`), so "Machine Learning", "machine_learning" and "ML " can't fork the taxonomy (an alias map handles known acronyms).

**Relations:** the existing 15-name vocabulary, now a closed enum. `worksWith` auto-bidirectional. `template`/`sw_*` never model-visible.

### 3.3 Placement (server-owned, single source of truth: `router.ts`)

```
identity   → Identity/{Profile|Preferences|Context} by facet (default context)
person     → Knowledge/People          organization → Knowledge/Organizations
project    → Knowledge/Projects (single brief note — no per-project subfolders;
             related decisions live in WM/Decisions with #project=slug)
concept    → Knowledge/{Domain}        reference → Knowledge/{Domain}
             (domain auto-created on first use as a flat folder — no Concepts/References/Notes triad)
question   → WM/Open Questions         decision → WM/Decisions
thread     → WM/Threads                capture  → WM/Inbox (the only inbox)
opinion    → Opinions (flat)           session  → Log/Sessions
```
Direct storage under section roots is impossible — there is no parent parameter on `remember`.

### 3.4 Upsert / dedup (in `remember`)

1. Normalize title → titleKey (decode entities, strip status suffixes, collapse whitespace, lowercase, strip punctuation).
2. Label-search same-kind notes in the kind's home scope; compare titleKeys (exact or one-is-prefix).
3. Match → delegate to `revise` (dated addendum) → returns `{action:"updated"}`. No match → create → `{action:"created"}`.
The model literally cannot create a duplicate of the same kind+title.

### 3.5 Graceful degradation (lifecycle policy in `brain.json`)

```json
"policy": { "dormantAfterDays": 21, "archiveDormantAfterDays": 45, "inboxGraceDays": 7 }
```
- Active question/thread/decision untouched for `dormantAfterDays` → `#status=dormant` (leaves default recall; enters the start_session review queue).
- Dormant + `archiveDormantAfterDays` → `#archived` (in place; content intact; retrievable with `includeArchived`).
- Inbox captures older than `inboxGraceDays` → archived into a dated digest.
- Resolved/superseded anything → `#archived` immediately, in place.
- Opinions never expire; superseding opinion auto-wires `supersedes` + archives the old one.
Degradation is **demotion, never deletion** — uniform across kinds, and every transition is logged in the sweep report.

### 3.6 Body normalization

`remember`/`revise` accept HTML **or** plain text/markdown: if the body contains no HTML tags, a minimal deterministic converter (paragraphs, `#` headings, `-` lists, `**bold**`, `` ` `` code) produces clean Trilium HTML. Kind templates wrap the body with the meta line (status/dates) so visual layout is uniform.

### 3.7 What the model's protocol shrinks to (new SKILL.md, ~1 page)

```
Session start:  start_session()                       (everything else is in the response)
During:         remember(...) when something matters; recall(...) before answering from memory;
                resolve(...) when something completes; connect(...) when you notice a real link.
Session end:    end_session(summary)
Monthly-ish:    maintain(deep=true)
```

---

## 4. Migration

`maintain(deep=true)` performs the entire v3→v4 data migration on the live tree (same code path as routine self-healing): title suffix → status labels, entity decoding, `#noteType` value canonicalization, date-label consolidation, labeling the 5 naked question notes, deleting the 18 empty project containers, merging fragmented identity references, session title normalization. Because the current session is connected to the v3 server, the initial migration is executed once via the existing low-level tools; `maintain` keeps it converged thereafter.

`brain.json` is upgraded in place (old shape loads fine; policy block added with defaults; `version: 4`).

## 5. Testing & verification

- Unit (bun test): normalize (titles/topics/markdown), router placement table, dedup keying, sweep rules on fixture attribute sets.
- Integration (`src/test.ts` pattern): against the live Trilium — remember-upsert round-trip, resolve transitions, maintain dry-run.
- Manual: rebuild dist, restart MCP, run `start_session` → verify digest + clean hygiene report.

## 6. Out of scope

Embeddings/semantic recall (Trilium fulltext is the floor; a future `recall` strategy slot exists), multi-brain tenancy, background daemons (sweeps piggyback on session calls by design).

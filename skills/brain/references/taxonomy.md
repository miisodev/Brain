# Taxonomy Reference

## Relation Vocabulary

The vocabulary is closed — `connect()` rejects anything not on this list. Pick the most specific verb that's true; `relatesTo` is the last resort.

| Relation | Direction | Use when |
|---|---|---|
| `relatesTo` | A → B | Generic connection — last resort when nothing more specific fits |
| `extends` | A → B | A builds on, elaborates, or deepens B |
| `contradicts` | A → B | A conflicts with or argues against B |
| `supports` | A → B | A provides evidence or rationale for B |
| `causes` | A → B | A produces or leads to B |
| `references` | A → B | A cites B as a source or pointer |
| `partOf` | A → B | A semantically belongs to B (auto-wired for `project=`) |
| `worksWith` | A ↔ B | Collaboration between people/orgs — symmetric, wired both ways automatically |
| `mentors` | A → B | A teaches, guides, or coaches B |
| `instanceOf` | A → B | A is a concrete example of concept B |
| `supersedes` | A → B | A replaces B (auto-wired via `supersedes=`; B is archived) |
| `implements` | A → B | A is the realisation or execution of concept B |
| `inspiredBy` | A → B | A was conceptually influenced by B |
| `sourceOf` | A → B | A is the origin or provenance of B |
| `derivedFrom` | A → B | A was synthesised from B (auto-wired by `resolve(promote=true)`) |

**Auto-wired — don't duplicate manually:**
- `person ↔ org` via `org=` on `remember(kind="person")` → `worksWith` both ways
- `note → project` via `project=` on any note → `partOf`
- `new → old` via `supersedes=` on `remember()` → `supersedes`, old note archived
- `promoted → source` via `resolve(promote=true)` → `derivedFrom`

---

## Label Conventions

These are written by the server — you never set `#noteType`, `#status`, `#created`, `#closed`, or `#updated` manually. They're documented here so you can read and filter on them correctly in `recall()` and `search_notes()`.

| Label | Values | Purpose |
|---|---|---|
| `#noteType` | `identity` `person` `organization` `project` `concept` `reference` `opinion` `question` `decision` `thread` `capture` `session` `domain` | Kind — exactly one per note, set at creation |
| `#status` | `active` `dormant` `resolved` `superseded` | Lifecycle state — transitions driven by age and `resolve()` |
| `#created` | ISO date | Set at creation |
| `#updated` | ISO date | Updated on every write |
| `#closed` | ISO date | Set when `resolve()` or `forget()` archives a note |
| `#topic` | slugged string, repeatable | Subject tags — `ai-tooling`, `infra`, etc. Capitalization normalized server-side. |
| `#domain` | slugged string | Knowledge domain — folder auto-created on first use |
| `#project` | slugged string | Project membership — also wires `partOf` relation |
| `#facet` | `profile` `preference` `context` | Routes identity notes into the right Identity sub-section |
| `#mood` | slugged string | Opinion tone — optional, user-facing |
| `#archived` | (flag, no value) | Excludes note from default `recall()`; content preserved in place |
| `#sw_{type}_{targetId}` | integer | Hebbian synaptic weight (full-mode only) |

**Searching by label:** `recall()` accepts `kinds=[]`, `project=`, `domain=` filters. For raw label queries use `search_notes()`: `#status=active`, `#noteType=decision`, `#topic=infra`, `#archived` (presence check), `note.dateModified > MONTH-1`.

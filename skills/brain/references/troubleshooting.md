# Edge Cases & Failure Modes

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
| A task needs direct note surgery | Use the full-mode tools (`create_note`, `patch_note`, `delete_note`, `set_label`, etc.) — see `references/full-mode.md`. Prefer the high-level surface for routine memory. |

---

# Troubleshooting

| Symptom | Fix |
|---|---|
| Brain tools time out or return connection errors | Run `C:\Users\miiso\Projects\OSS\Brain\scripts\start-trilium.ps1` (PowerShell tool) — starts Trilium on port 37840 if not running, no-ops if already up. Wait ~3 s then retry. |
| `start_session` → `uninitialized` | `bootstrap_brain` |
| Hygiene report mentions legacy fixes every session | Run `maintain(deep=true)` once to converge the whole tree |
| `recall` returns odd results | It already filters untyped notes; if it persists, `maintain(deep=true)` then retry |
| Items going dormant too fast / too slow | User edits `policy` in `brain.json` (`dormantAfterDays` / `archiveDormantAfterDays` / `inboxGraceDays`) |
| Need raw Trilium access (attachments, calendar, custom queries) | Full-mode tools are active — see `references/full-mode.md` |
| Config IDs stale after restructuring in Trilium | `bootstrap_brain` re-discovers and rewrites `brain.json` |

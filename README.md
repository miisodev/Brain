# Trilium Brain MCP

An MCP (Model Context Protocol) server that turns [TriliumNext Notes](https://github.com/TriliumNext/Notes) into a persistent, graph-structured second brain for Claude and other LLM clients.

**55 tools** across 9 categories — neural-vocabulary naming, token-efficient stubs-first retrieval, a full knowledge graph with typed synapses and Hebbian weights, and zero manual ID management.

---

## Features

- **Neural architecture** — engrams (notes), synapses (typed relations), synaptic weights (Hebbian reinforcement), connectome traversal
- **55 tools** covering the full Trilium ETAPI surface plus high-level memory operations
- **Zero ID pasting** — `bootstrap_brain` creates the full tree and writes `brain.json` automatically; auto-discovery rebuilds config if the file is missing
- **Structured spawning** — `spawn_*` tools create properly formatted, labelled notes with `~template` relations wired automatically
- **Knowledge graph** — BFS path-finding, neighbourhood expansion, full connectome traversal with direction and depth controls
- **Token economy** — list/search returns id+title stubs only; content fetched on demand
- **Revision safety** — `snapshot_engram` before edits; `reinforce` always pre-snapshots
- **Calendar journal** — day/week/month/year pulse notes for temporal context

---

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- A running [TriliumNext](https://github.com/TriliumNext/Notes) instance (desktop or server)

---

## Installation

```bash
git clone https://github.com/miisodev/Trilium
cd Trilium
bun install
bun run build
```

---

## Configuration

### 1. Get your ETAPI token

In Trilium: **Options → ETAPI → Create token**

### 2. Set environment variables

Copy `.env.example` to `.env` and fill in:

```env
TRILIUM_BASE_URL=http://localhost:8080
TRILIUM_ETAPI_TOKEN=your-token-here
```

### 3. Configure Claude Desktop

Open your Claude Desktop config file:

| Platform | Path |
|----------|------|
| Windows  | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS    | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux    | `~/.config/Claude/claude_desktop_config.json` |

Merge in the contents of `claude_desktop_config.example.json`, replacing the path and token:

```json
{
  "mcpServers": {
    "Trilium Brain": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/Trilium/dist/index.js"],
      "env": {
        "TRILIUM_BASE_URL": "http://localhost:8080",
        "TRILIUM_ETAPI_TOKEN": "your-etapi-token-here"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

Close and reopen. The Trilium Brain tools will appear in the MCP tools list.

---

## First-time setup

On a fresh Trilium instance, ask Claude to run:

```
bootstrap_brain
```

The tool will:
1. Check whether the brain structure already exists (safe to call anytime)
2. If fresh — create the full note hierarchy, write `brain.json`, and activate config immediately
3. If already initialised — refresh `brain.json` and report the live structure

**No manual ID copying. No rebuild. No restart.** Config is live the moment `bootstrap_brain` returns.

### Alternative: CLI bootstrap

If you prefer to initialise before connecting a client:

```bash
TRILIUM_BASE_URL=http://localhost:8080 TRILIUM_ETAPI_TOKEN=your-token bun run init
```

This writes `brain.json` next to `dist/index.js` and prints all created note IDs.

---

## Skill installation

`SKILL.md` teaches Claude how to use Trilium Brain effectively — session protocol, tool selection, label/relation conventions, note formats, and hygiene rules.

### Option A — System prompt (recommended)

Paste `SKILL.md` into **Settings → Custom Instructions** in Claude Desktop. The model follows the skill protocol automatically in every session where Trilium Brain is connected.

### Option B — Project knowledge (Claude Projects)

Upload `SKILL.md` as a project knowledge file. Every conversation in that project has the skill in context automatically.

### Option C — Store in Trilium (self-loading)

```
imprint(section="knowledge", title="Trilium Brain Skill", content=<SKILL.md contents>)
imprint_label(noteId=..., name="skill", value="trilium-brain")
```

At the start of any session: *"Load my Trilium Brain skill note and follow its session protocol."*

---

## Development

```bash
bun run dev    # hot-reload dev server
bun run build  # compile to dist/index.js
bun run test   # integration tests (requires live Trilium instance)
bun run init   # CLI bootstrap (alternative to bootstrap_brain tool)
```

---

## Brain Structure

```
root
└── 🧠 Trilium Brain
    ├── 👤 Identity/
    │   ├── Profile
    │   ├── Preferences
    │   └── Context
    ├── 🔄 Working Memory/
    │   ├── Inbox
    │   ├── Threads
    │   ├── Decisions
    │   └── Open Questions
    ├── 📚 Knowledge/
    │   ├── People
    │   ├── Organizations
    │   ├── Projects
    │   └── [domain]/          ← spawn_domain creates these
    │       ├── Concepts/
    │       ├── References/
    │       └── Notes/
    ├── 💭 Opinions            ← flat, blog/diary style (no subtrees)
    ├── 📅 Log/
    │   ├── Sessions
    │   └── Decisions Made
    └── 🗂️ Templates/
        ├── Thread
        ├── Decision
        ├── Concept
        ├── Project Brief
        ├── Person
        └── Opinion
```

---

## Tool Reference

### Session / Orientation
| Tool | Description |
|------|-------------|
| `ignite_cortex` | Boot session — returns three-level brain tree with all structural IDs. Call once per session. |
| `crystallize_session` | Persist structured session summary into Log → Sessions. |

### Search
| Tool | Description |
|------|-------------|
| `scan_engrams` | Full Trilium search — text, `#label=value`, date operators, subtree scope |
| `trace_signal` | Fast label search: `#name=value` shorthand. Best for structured retrieval. |
| `pulse_recent` | Up to 50 recently modified engrams, newest first. |

### Engram CRUD
| Tool | Description |
|------|-------------|
| `retrieve_engram` | Metadata only (attributes, parents, children). No content. |
| `decode_engram` | Raw content only. |
| `read_engram` | Metadata + content in one call. |
| `encode_engram` | Create a raw note at any location. |
| `rewrite_engram` | Replace full content (no automatic pre-snapshot). |
| `morph_engram` | Mutate title, type, or MIME without touching content. |
| `dissolve_engram` | Delete a note permanently. Prefer `imprint_label(#archived)` instead. |

### Structure / Branching
| Tool | Description |
|------|-------------|
| `graft_engram` | Place an engram in an additional parent (multi-parent, shared content). |
| `migrate_engram` | Move an engram to a new parent. |

### Synaptic Attributes
| Tool | Description |
|------|-------------|
| `imprint_label` | Add `#key=value` label. |
| `synapse` | Create a typed directional relation between two engrams. |
| `desynapse` | Remove a named relation by source + type + target. |
| `prune_attribute` | Delete any attribute by raw attributeId. |
| `strengthen_synapse` | Increment synaptic weight (Hebbian reinforcement). |
| `list_synapse_types` | Discover all relation type names in use. |
| `query_synapses` | Find all engrams connected via a specific synapse type. |

### Graph / Connectome
| Tool | Description |
|------|-------------|
| `trace_efferents` | Outgoing relations from a note (includes synaptic weights). |
| `trace_afferents` | Incoming relations into a note (backlinks). |
| `find_neural_path` | Shortest BFS path connecting two engrams. |
| `expand_neighborhood` | All engrams within N hops (center node included at depth=0). |
| `traverse_connectome` | Full graph walk with direction, type filter, depth, and node cap. |

### Structured Spawn
| Tool | Description |
|------|-------------|
| `spawn_thread` | Reasoning thread in Working Memory → Threads. |
| `spawn_decision` | ADR-format decision record in Working Memory → Decisions. |
| `spawn_concept` | Atomic concept under Knowledge → [domain] → Concepts. |
| `spawn_domain` | New domain subtree with Concepts / References / Notes subfolders. |
| `spawn_opinion` | Blog/diary-style opinion entry under Opinions (flat). |
| `spawn_project` | Structured project brief under Knowledge → Projects. |

### Memory / Recall
| Tool | Description |
|------|-------------|
| `recall` | Search memory sections with inline content snippets for top 3 matches. |
| `imprint` | Persist a new engram into a memory section with auto-labels. |
| `reinforce` | Update an existing engram — pre-snapshots then overwrites. |
| `weave_thread` | `append / close / list` thread lifecycle management. |
| `triage_inbox` | `list / promote / discard` inbox items. |
| `consolidate` | Promote a Working Memory engram to durable Knowledge (`~derivedFrom` wired). |

### Maintenance
| Tool | Description |
|------|-------------|
| `scan_orphans` | Find structured engrams with no relations and no meaningful labels. |
| `suggest_synapses` | Candidate connections based on shared labels (ranked by overlap). |
| `bulk_imprint` | Apply a label to multiple engrams in one call. |

### Artifacts
| Tool | Description |
|------|-------------|
| `list_artifacts` | List attachments on an engram (id+title+mime+size). |
| `read_artifact` | Read attachment content. |
| `attach_artifact` | Attach a file or text blob to an engram. |

### Snapshots (Revisions)
| Tool | Description |
|------|-------------|
| `list_snapshots` | All saved revisions, newest first. |
| `read_snapshot` | Content of a historical revision. |
| `snapshot_engram` | Manually save a revision before significant edits. |

### Calendar Pulses
| Tool | Description |
|------|-------------|
| `get_day_pulse` | Get/create today's journal day note. |
| `get_week_pulse` | Get/create week note (YYYY-Www). |
| `get_month_pulse` | Get/create month note (YYYY-MM). |
| `get_year_pulse` | Get/create year note (YYYY). |
| `get_inbox_pulse` | Get the Trilium calendar inbox note for a date. |

### System
| Tool | Description |
|------|-------------|
| `synaptic_status` | Trilium server version, DB version, runtime metadata. |
| `backup_cortex` | Trigger a named DB backup (`brain-{date}.db`). |
| `bootstrap_brain` | Initialize or inspect the full brain hierarchy. Writes `brain.json` and activates config live. |

---

## Label Conventions

| Label | Values | Purpose |
|-------|--------|---------|
| `#noteType` | `thread` / `decision` / `concept` / `domain` / `project` / `person` / `opinion` / `session` / `knowledge` | Primary type classifier |
| `#status` | `active` / `pending` / `resolved` / `consolidated` / `triaged` / `superseded` | Lifecycle state |
| `#topic` | free text | Subject tag for search/filtering |
| `#domain` | free text (e.g. `Technology`, `Philosophy`) | Knowledge domain |
| `#dateOpened` / `#dateWritten` / `#dateStarted` | ISO date | Creation timestamps |
| `#dateUpdated` / `#dateConsolidated` | ISO date | Mutation timestamps |
| `#mood` | `contemplative` / `passionate` / `uncertain` / `analytical` | Opinion tone |
| `#archived` | (flag) | Soft-delete — prefer over hard deletion |
| `#confidence` | `high` / `medium` / `low` | Epistemic confidence |
| `sw_{type}_{targetId}` | integer | Synaptic weight (Hebbian reinforcement counter) |

## Relation (Synapse) Vocabulary

| Synapse | Direction | Use when |
|---------|-----------|----------|
| `relatesTo` | A → B | Generic connection (last resort) |
| `extends` | A → B | A builds on or elaborates B |
| `contradicts` | A → B | A conflicts with B |
| `supports` | A → B | A provides evidence for B |
| `causes` | A → B | A produces or leads to B |
| `references` | A → B | A cites B as a source |
| `partOf` | A → B | A structurally belongs inside B |
| `worksWith` | A ↔ B | A and B cooperate or are used together |
| `mentors` | A → B | A teaches or guides B |
| `instanceOf` | A → B | A is a concrete example of B |
| `supersedes` | A → B | A replaces B (archive B with `#status=superseded`) |
| `implements` | A → B | A is the realisation of concept B |
| `inspiredBy` | A → B | A was conceptually influenced by B |
| `sourceOf` | A → B | A is the origin or provenance of B |
| `derivedFrom` | A → B | A was synthesised from B |
| `template` | A → B | A uses B as its structural template |

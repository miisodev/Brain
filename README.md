# Trilium Brain MCP

An MCP (Model Context Protocol) server that turns [TriliumNext Notes](https://github.com/TriliumNext/Notes) into a persistent, graph-structured second brain for Claude and other LLM clients.

**60 tools** across 13 categories — Trilium-convention naming, token-efficient stubs-first retrieval, a full knowledge graph with typed synapses and Hebbian weights, and zero manual ID management.

<div align="center">

### If Trilium Brain is useful to you, consider supporting its development

[![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-009cde?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/miisodev?locale.x=en_US&country.x=ZA)

</div>

---

## Features

- **Neural architecture** — engrams (notes), synapses (typed relations), synaptic weights (Hebbian reinforcement), connectome traversal
- **60 tools** covering the full Trilium ETAPI surface plus high-level memory operations
- **Zero ID pasting** — `bootstrap_brain` creates the full tree and writes `brain.json` automatically; auto-discovery rebuilds config if the file is missing
- **Structured creation** — `create_*` tools produce properly formatted, labelled notes with `~template` relations wired automatically
- **Knowledge graph** — BFS path-finding, neighbourhood expansion, full graph traversal with direction and depth controls
- **Token economy** — list/search returns id+title stubs only; content fetched on demand
- **Revision safety** — `create_note_revision` before edits; `update_memory` always pre-snapshots
- **Calendar journal** — day/week/month/year notes for temporal context

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
    "Brain": {
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

## Cloud / Remote Setup

Use this when your Trilium instance is not on the same machine as the MCP server — for example, when using Claude Code on the web or when Trilium is hosted on a VPS.

### 1. Expose Trilium over HTTPS

Trilium's built-in server listens on HTTP. Put it behind a reverse proxy for a public endpoint.

**Caddy** (automatic HTTPS):
```caddyfile
trilium.yourdomain.com {
    reverse_proxy localhost:8080
}
```

**nginx**:
```nginx
server {
    listen 443 ssl;
    server_name trilium.yourdomain.com;
    # ... TLS cert config ...
    location / {
        proxy_pass         http://localhost:8080;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
    }
}
```

Or use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) for a zero-config public endpoint with no open ports.

### 2. Point the MCP server at the remote URL

```env
TRILIUM_BASE_URL=https://trilium.yourdomain.com
TRILIUM_ETAPI_TOKEN=your-etapi-token-here
```

### 3. Self-signed certificates (optional)

If your proxy uses a self-signed cert, set this in your environment before starting the server:

```env
NODE_TLS_REJECT_UNAUTHORIZED=0
```

> **Warning:** Only use this on trusted private networks or for local development. Never disable TLS verification in a public-facing deployment.

### Claude Code (web)

When running as an MCP server in Claude Code on the web, add `TRILIUM_BASE_URL` and `TRILIUM_ETAPI_TOKEN` to your environment in the project settings — no local config file or desktop app is needed.

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
store_memory(section="knowledge", title="Trilium Brain Skill", content=<SKILL.md contents>)
add_label(noteId=..., name="skill", value="trilium-brain")
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
    │   └── [domain]/
    │       ├── Concepts/
    │       ├── References/
    │       └── Notes/
    ├── 💭 Opinions
    ├── 📅 Log/
    │   ├── Sessions
    │   └── Decisions Made
    └── 🗂️ Templates/
        ├── Thread
        ├── Decision
        ├── Concept
        ├── Project Brief
        ├── Person
        ├── Opinion
        └── Domain
```

---

## Tool Reference

### Session / Orientation
| Tool | Description |
|------|-------------|
| `start_session` | Boot session — returns three-level brain tree with all structural IDs. Call once per session, never again mid-session. |
| `log_session` | Persist structured session summary into Log → Sessions. Call at end of every session. |
| `get_brain_config` | Return the live brain.json config (all structural note IDs). |

### Search
| Tool | Description |
|------|-------------|
| `search_notes` | Full Trilium search — text, `#label=value`, date operators, subtree scope. |
| `search_notes_by_label` | Fast label search: `#name=value` shorthand. Best for structured retrieval. |
| `get_recent_notes` | Up to 50 recently modified notes, newest first. |

### Note CRUD
| Tool | Description |
|------|-------------|
| `get_note` | Metadata only (attributes, parents, children). No content. |
| `get_note_content` | Raw content only. |
| `get_note_with_content` | Metadata + content in one call. |
| `create_note` | Create a raw note at any location. |
| `update_note_content` | Replace full content (no automatic pre-snapshot). |
| `patch_note` | Mutate title, type, or MIME without touching content. |
| `delete_note` | Delete a note permanently. Prefer `add_label(#archived)` instead. |

### Structure / Branching
| Tool | Description |
|------|-------------|
| `clone_note` | Place a note in an additional parent (multi-parent, shared content). |
| `move_note` | Move a note to a new parent. |

### Attributes
| Tool | Description |
|------|-------------|
| `add_label` | Add `#key=value` label to a note. |
| `update_label` | Update an existing label value in-place (atomic PATCH). |
| `add_relation` | Create a typed directional relation between two notes. |
| `delete_relation` | Remove a named relation by source + type + target. |
| `delete_attribute` | Delete any attribute by raw attributeId. |
| `strengthen_relation` | Increment synaptic weight (+1). Call after traversing a path that proved useful. |
| `weaken_relation` | Decrement synaptic weight (floors at 0, label removed). Call when a path was misleading or stale. |
| `get_relation_types` | Discover all relation type names in use across the brain. |
| `get_related_notes` | Find all notes connected via a specific relation type. |

### Graph / Relations
| Tool | Description |
|------|-------------|
| `get_outgoing_relations` | Outgoing relations from a note (includes synaptic weights). |
| `get_incoming_relations` | Incoming relations into a note (backlinks). |
| `find_relation_path` | Shortest BFS path connecting two notes. |
| `get_note_neighborhood` | All notes within N hops (center node included at depth=0). |
| `traverse_graph` | Full graph walk with direction, type filter, depth, and node cap. |

### Structured Creation
| Tool | Description |
|------|-------------|
| `create_thread` | Reasoning thread in Working Memory → Threads. |
| `create_decision` | ADR-format decision record in Working Memory → Decisions. |
| `create_concept` | Atomic concept under Knowledge → [domain] → Concepts. |
| `create_domain` | New domain subtree with Concepts / References / Notes subfolders. |
| `create_opinion` | Blog/diary-style opinion entry under Opinions (flat). |
| `create_project` | Structured project brief under Knowledge → Projects. |

### Memory / Recall
| Tool | Description |
|------|-------------|
| `recall_memory` | Search memory sections with inline content snippets for top 3 matches. |
| `store_memory` | Persist a new note into a memory section with auto-labels. |
| `update_memory` | Update an existing memory note — pre-snapshots then overwrites. |
| `manage_thread` | `append / close / list` thread lifecycle management. |
| `triage_inbox` | `list / promote / discard` inbox items. |
| `promote_to_knowledge` | Promote a Working Memory note to durable Knowledge (`~derivedFrom` wired). |

### Maintenance
| Tool | Description |
|------|-------------|
| `find_orphan_notes` | Find structured notes with no relations and no meaningful labels. |
| `suggest_connections` | Candidate connections based on shared labels (ranked by overlap). |
| `bulk_add_label` | Apply a label to multiple notes in one call. |

### Attachments
| Tool | Description |
|------|-------------|
| `get_note_attachments` | List attachments on a note (id+title+mime+size). |
| `get_attachment_content` | Read attachment content. |
| `create_attachment` | Attach a file or text blob to a note. |
| `delete_attachment` | Delete an attachment permanently. |
| `update_attachment` | Update attachment metadata (title, mime). |

### Revisions
| Tool | Description |
|------|-------------|
| `get_note_revisions` | All saved revisions, newest first. |
| `get_revision_content` | Content of a historical revision. |
| `create_note_revision` | Manually save a revision before significant edits. |

### Calendar
| Tool | Description |
|------|-------------|
| `get_day_note` | Get/create today's journal day note. |
| `get_week_note` | Get/create week note (YYYY-Www). |
| `get_month_note` | Get/create month note (YYYY-MM). |
| `get_year_note` | Get/create year note (YYYY). |
| `get_inbox_note` | Get the Trilium calendar inbox note for a date. |

### System
| Tool | Description |
|------|-------------|
| `get_app_info` | Trilium server version, DB version, runtime metadata. |
| `create_backup` | Trigger a named DB backup (`brain-{date}.db`). |
| `bootstrap_brain` | Initialize or inspect the full brain hierarchy. Writes `brain.json` and activates config live. |

---

## Label Conventions

| Label | Values | Purpose |
|-------|--------|---------|
| `#noteType` | `thread` / `decision` / `concept` / `domain` / `project` / `person` / `opinion` / `session` / `knowledge` | Primary type classifier |
| `#status` | `active` / `pending` / `resolved` / `consolidated` / `triaged` / `superseded` | Lifecycle state |
| `#topic` | free text | Subject tag for search/filtering |
| `#domain` | free text (e.g. `Technology`, `Philosophy`) | Knowledge domain |
| `#dateOpened` / `#dateWritten` / `#dateStarted` / `#dateStored` | ISO date | Creation timestamps |
| `#dateUpdated` / `#dateConsolidated` | ISO date | Mutation timestamps |
| `#mood` | `contemplative` / `passionate` / `uncertain` / `analytical` | Opinion tone |
| `#archived` | (flag) | Soft-delete — prefer over hard deletion |
| `#confidence` | `high` / `medium` / `low` | Epistemic confidence |
| `#sw_{type}_{targetId}` | integer | Synaptic weight — managed by `strengthen_relation` / `weaken_relation` |

---

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

> `~template` is a Trilium-internal relation wired automatically by `create_*` tools. Do not wire it manually.

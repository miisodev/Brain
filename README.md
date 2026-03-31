# Trilium Brain MCP

An MCP (Model Context Protocol) server that exposes [TriliumNext Notes](https://github.com/TriliumNext/Notes) as a persistent memory and knowledge base for connected LLM endpoints (Claude, etc.).

## Features

- **28 tools** covering the full Trilium ETAPI surface
- **Persistent memory** — Identity, Working Memory, Knowledge, Opinions, Log sections
- **Knowledge graph** — label/relation tagging, cross-note linking, graph traversal
- **Revision history** — automatic snapshots before every major edit
- **Calendar journal** — day/week/month/year notes for temporal context
- **Token-efficient** — list tools return stubs only; content fetched on demand

---

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- A running [TriliumNext](https://github.com/TriliumNext/Notes) instance (desktop or server)

---

## Installation

```bash
git clone https://github.com/your-username/trilium-brain-mcp
cd trilium-brain-mcp
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

Merge in the contents of `claude_desktop_config.example.json`, replacing the path and token:

```json
{
  "mcpServers": {
    "Trilium": {
      "command": "bun",
      "args": [
        "run",
        "C:/Users/YOUR_USERNAME/Projects/Trilium/dist/index.js"
      ],
      "env": {
        "TRILIUM_BASE_URL": "http://localhost:8080",
        "TRILIUM_ETAPI_TOKEN": "your-etapi-token-here"
      }
    }
  }
}
```

> **Tip — macOS/Linux:** Use an absolute POSIX path:
> ```json
> "args": ["run", "/home/yourname/Projects/Trilium/dist/index.js"]
> ```

### 4. Restart Claude Desktop

Close and reopen Claude Desktop. The Trilium tools will appear in the MCP tools list.

---

## First-time setup (fresh Trilium instance)

If this is your first time connecting the MCP to Trilium, call the `initialize_trilium` tool from within Claude:

```
Use the initialize_trilium tool to set up my Trilium knowledge base structure.
```

The tool will:
1. Detect whether the structure already exists (safe to call anytime)
2. If fresh — create the full note hierarchy and return all new noteIds
3. Print a ready-to-paste `constants.ts` snippet

Then follow the printed instructions:

```bash
# 1. Paste the returned constants into src/constants.ts
# 2. Rebuild
bun run build
# 3. Restart Claude Desktop
```

That's it — subsequent calls to `initialize_trilium` will detect the existing structure and skip creation.

---

## Skill installation (optional but recommended)

`SKILL.md` is an LLM guide that teaches the connected model how to use this MCP server effectively — session protocol, tool selection, token economy rules, memory patterns, and label/relation conventions. Installing it means you don't have to re-explain usage each session.

### Option A — System prompt (Claude Desktop)

Paste the full contents of `SKILL.md` into your Claude Desktop system prompt:

**Settings → Custom Instructions** (or equivalent in your client)

The model will follow the skill's session protocol automatically in every conversation where the Trilium MCP is connected.

### Option B — Store in Trilium (self-loading)

Store the skill as a note in your Trilium instance so Claude can load it on demand:

1. In Claude, run:
   ```
   Create a note in my Trilium Knowledge section titled "Trilium Brain MCP Skill" with the contents of SKILL.md
   ```
2. Add the label `#skill=trilium-brain` to that note so it is easy to find:
   ```
   search_by_label("skill", "trilium-brain")
   ```
3. At the start of any session where you want the skill active, ask Claude:
   ```
   Load my Trilium Brain MCP skill note and follow its session protocol.
   ```

### Option C — Project knowledge (Claude Projects)

If you use Claude Projects, upload `SKILL.md` as a project knowledge file. Every conversation in that project will have the skill in context automatically.

---

## Development

```bash
# Run with hot-reload
bun run dev

# Run integration tests (requires live Trilium instance)
bun run test

# One-shot bootstrap (alternative to initialize_trilium MCP tool)
bun run init
```

---

## Available Tools

### Session
| Tool | Description |
|------|-------------|
| `start_session` | Get two-level tree of the Trilium root. Call once per session. |
| `log_session` | Persist a session summary to the Log section. |

### Search
| Tool | Description |
|------|-------------|
| `search_notes` | Full Trilium search syntax — text, labels, date operators, subtree scoping |
| `search_by_label` | Shorthand `#label=value` search |
| `get_recent_changes` | Most recently modified notes, deduplicated |

### Notes
| Tool | Description |
|------|-------------|
| `get_note` | Metadata only (attributes, parents, children) |
| `get_note_content` | Raw body only |
| `get_note_with_content` | Metadata + body in one call |
| `create_note` | Create text, code, book, canvas, mermaid, and more |
| `update_note_content` | Replace body |
| `patch_note` | Rename / retype without touching content |
| `delete_note` | Delete (prefer archiving with `#archived` label) |

### Structure
| Tool | Description |
|------|-------------|
| `clone_note` | Multi-parent branch (shared content, no copy) |
| `move_note` | Relocate in tree (clone-then-delete-old-branch) |

### Attributes
| Tool | Description |
|------|-------------|
| `add_label` | Add `#key=value` metadata tag |
| `add_relation` | Add `~relation` typed edge to another note |
| `delete_attribute` | Remove a label or relation by ID |
| `get_linked_notes` | Follow all `~relations` from a note |

### Attachments
| Tool | Description |
|------|-------------|
| `get_note_attachments` | List attachments (id+title+mime+size) |
| `get_attachment_content` | Read attachment body |
| `create_attachment` | Attach file/blob to a note |

### Revisions
| Tool | Description |
|------|-------------|
| `get_note_revisions` | List all snapshots, newest first |
| `get_revision_content` | Read a historical snapshot |
| `create_revision` | Manually snapshot before a major edit |

### Calendar / Journal
| Tool | Description |
|------|-------------|
| `get_day_note` | Get/create today's journal note |
| `get_week_note` | Get/create week note (YYYY-Www) |
| `get_month_note` | Get/create month note (YYYY-MM) |
| `get_year_note` | Get/create year note (YYYY) |
| `get_inbox_note` | Get the inbox drop-zone note |

### Memory (high-level)
| Tool | Description |
|------|-------------|
| `memory_recall` | Search own memory sections with inline content snippets |
| `memory_store` | Persist knowledge with auto `#llmMemory` + `#topic` labels |
| `memory_update` | Auto-snapshot then update (safe rewrites) |
| `working_memory_thread` | Open / close / list active tracking threads |

### System
| Tool | Description |
|------|-------------|
| `get_app_info` | Trilium version and DB info |
| `create_backup` | Trigger named DB backup |
| `initialize_trilium` | Bootstrap or inspect the note structure |

---

## Note structure

```
root
└── Trilium  (#iconClass=bx bx-brain)
    ├── Identity          ← facts about the user/system
    ├── Working Memory    ← active threads, decisions, open questions
    │   ├── Active Threads
    │   ├── Decisions
    │   └── Open Questions
    ├── Knowledge         ← durable facts, how-to, reference
    ├── Opinions          ← preferences, evaluations, stances
    └── Log               ← per-session summaries (YYYY-MM-DD)
```

## Label conventions

| Label | Meaning |
|-------|---------|
| `#llmMemory=<section>` | Marks a note as LLM-managed memory |
| `#topic=<value>` | Subject tag for search/filtering |
| `#status=open\|closed` | Thread lifecycle |
| `#dateStored` | When memory_store created the note |
| `#dateUpdated` | When memory_update last touched it |
| `#llmThread` | Marks an active Working Memory thread |
| `#archived` | Soft-delete (preferred over hard delete) |

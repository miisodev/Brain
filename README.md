# Brain

An MCP (Model Context Protocol) server that turns [TriliumNext Notes](https://github.com/TriliumNext/Notes) into a persistent, graph-structured second brain for Claude and other LLM clients.

**v4: the model supplies content; the server owns form.** Twelve intent-level tools with upsert semantics, server-side placement/naming/labeling, a uniform lifecycle with graceful degradation, and a self-healing maintenance sweep — designed so the model needs zero oversight during memory operations. The full low-level surface remains available behind `BRAIN_MODE=full`.

<div align="center">

### If Brain is useful to you, consider supporting its development

[![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-009cde?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/miisodev?locale.x=en_US&country.x=ZA)

</div>

---

## Features

- **Zero-oversight by construction** — placement, naming, labels, templates, dedup, and archival are deterministic server policy, not instructions the model must remember
- **One write path** — `remember(kind, title, body)` routes everything; **upsert semantics** make duplicates impossible (same kind + same normalized title → dated addendum, not a copy)
- **Uniform lifecycle** — every ephemeral note follows `active → resolved | superseded`, with graceful degradation (`active → dormant → archived in place`) on configurable timings; degradation demotes, never deletes
- **One completion path** — `resolve(noteId, outcome)` answers questions, decides decisions, closes threads; decisions auto-clone into the Log, outcomes can auto-promote into Knowledge
- **Self-healing** — `maintain()` canonicalizes titles/labels/vocabulary, ages working memory, merges duplicate session logs, cleans legacy structure; the lite sweep runs automatically inside `start_session` / `end_session`
- **Sessions built in** — `start_session` returns an orientation digest (identity, working set, review queue, last session, hygiene report); `end_session` is idempotent per date and triggers a DB backup
- **Normalization layer** — HTML-entity decoding, status-suffix stripping, topic slugging, markdown→HTML conversion: the model's output is cleaned before it is stored
- **Knowledge graph** — closed relation vocabulary enforced at the schema level, symmetric relations auto-wired both ways, BFS path-finding and neighbourhood traversal via `explore`
- **Zero ID pasting** — `bootstrap_brain` creates the tree and writes `brain.json` automatically; auto-discovery rebuilds config if the file is missing
- **Power mode** — `BRAIN_MODE=full` adds the raw surface: CRUD, attributes, attachments, revisions, calendar notes, Hebbian weights

---

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- A running [TriliumNext](https://github.com/TriliumNext/Notes) instance (desktop or server)

---

## Installation

```bash
git clone https://github.com/miisodev/Brain
cd Brain
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
      "args": ["run", "/absolute/path/to/Brain/dist/index.js"],
      "env": {
        "TRILIUM_BASE_URL": "http://localhost:8080",
        "TRILIUM_ETAPI_TOKEN": "your-etapi-token-here"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

Close and reopen. The Brain tools will appear in the MCP tools list.

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

## Transport modes: local (stdio) vs remote (HTTP)

Brain runs in one of two transport modes — **never both at once** — selected by the `PORT` environment variable:

| Mode | When to use | Selected by |
|------|-------------|-------------|
| **stdio** | Local Claude Desktop / Claude Code spawns Brain as a child process | `PORT` **unset** (default) |
| **HTTP connector** | Remote clients (Claude on the web, a hosted deployment) reach Brain over the network | `PORT` **set** (Railway sets it for you) |

This is independent of where Trilium runs — either mode talks to a local or remote Trilium via `TRILIUM_BASE_URL`.

### HTTP connector endpoints

When `PORT` is set, Brain serves a streamable-HTTP MCP server instead of stdio:

- `/mcp` — the MCP endpoint (one session per `mcp-session-id` header)
- `GET /health` — unauthenticated health probe (returns `OK`)

Set `MCP_AUTH_TOKEN` to require `Authorization: Bearer <token>` on `/mcp`. **If it is unset, `/mcp` is unauthenticated — only acceptable on a private network.**

```env
PORT=8080
MCP_AUTH_TOKEN=generate-with-openssl-rand-hex-32
TRILIUM_BASE_URL=https://trilium.yourdomain.com
TRILIUM_ETAPI_TOKEN=your-etapi-token-here
```

### Deploy with Docker / Railway

The included [`Dockerfile`](./Dockerfile) builds and runs the HTTP connector:

```bash
docker build -t trilium-brain .
docker run -p 8080:8080 \
  -e PORT=8080 \
  -e MCP_AUTH_TOKEN=your-secret \
  -e TRILIUM_BASE_URL=https://trilium.yourdomain.com \
  -e TRILIUM_ETAPI_TOKEN=your-etapi-token \
  trilium-brain
```

On **Railway**, `PORT` is injected automatically — set `MCP_AUTH_TOKEN`, `TRILIUM_BASE_URL`, and `TRILIUM_ETAPI_TOKEN` as service variables and deploy. Point your client at `https://<your-app>.up.railway.app/mcp` with the bearer token (see [`claude_desktop_config.example.json`](./claude_desktop_config.example.json)).

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

`skills/brain/SKILL.md` teaches Claude how to use Trilium Brain effectively — session protocol, tool selection, label/relation conventions, note formats, and hygiene rules. It references additional detail files in `skills/brain/references/` (full-mode tools, troubleshooting, taxonomy) that are loaded on demand.

### Option A — Plugin install (recommended)

The repo ships as a proper Cowork/Claude Code plugin (`.claude-plugin/plugin.json` + `skills/brain/`). Install it directly from the repo:

```
/plugin install path/to/Brain
```

### Option B — System prompt

Paste the contents of `skills/brain/SKILL.md` into **Settings → Custom Instructions** in Claude Desktop. Copy the `skills/brain/references/` files somewhere accessible and update the `references/` paths in the skill accordingly.

### Option C — Project knowledge (Claude Projects)

Upload `skills/brain/SKILL.md` as a project knowledge file. Every conversation in that project has the skill in context automatically.

### Option D — Store in Trilium (self-loading)

```
remember(kind="reference", title="Brain Skill", body=<skills/brain/SKILL.md contents>, domain="Meta")
```

At the start of any session: *"Load my Brain skill note and follow its session protocol."*

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
    ├── 👤 Identity/            Profile · Preferences · Context      (facet-routed identity facts)
    ├── 🔄 Working Memory/      Inbox · Threads · Decisions · Open Questions   (ephemeral; ages)
    ├── 📚 Knowledge/           People · Organizations · Projects · [Domain folders, auto-created flat]
    ├── 💭 Opinions             dated stances — flat, never nested
    ├── 📅 Log/                 Sessions · Decisions Made            (temporal record)
    └── 🗂️ Templates/           server-managed
```

The model never chooses where a note goes — `remember(kind=...)` routes it. Domain folders are created on first use (flat — leaf notes carry their kind in `#noteType`; no `Concepts/References/Notes` subtrees). Projects are single brief notes; related content tags `project=<name>` instead of nesting.

---

## Lifecycle

```
                 resolve()                    [terminal — archived in place]
   active ───────────────────────▶ resolved | superseded
     │                                   ▲
     │ untouched dormantAfterDays        │
     ▼                                   │
   dormant ──────────────────────────────┘
     │ untouched archiveDormantAfterDays more
     ▼
   archived in place (#archived flag; excluded from default recall; never deleted)
```

Ephemeral kinds (`question`, `decision`, `thread`, `capture`) age on this timeline; durable kinds live until superseded or explicitly resolved. Timings are configurable in `brain.json`:

```json
"policy": {
  "dormantAfterDays": 21,
  "archiveDormantAfterDays": 45,
  "inboxGraceDays": 7
}
```

---

## Tool Reference — core surface (default)

| Tool | Description |
|------|-------------|
| `start_session` | Orientation digest: identity, working set with idle ages, review queue, last session, hygiene report. Runs the lite maintenance sweep. Once per session, first. |
| `end_session` | Idempotent per-date session log (same-day calls append an addendum) + lite sweep + automatic DB backup. Once per session, last. |
| `remember` | Store anything: `kind` ∈ identity / person / organization / project / concept / reference / opinion / question / decision / thread / capture. Routed, labeled, templated, deduped server-side. Body accepts text, markdown, or HTML. |
| `recall` | Multi-strategy search (label → title → full-text), merged and ranked, with kind/status on every result and snippets for the top 3. Filters: `kinds`, `project`, `domain`, `includeArchived`. |
| `read_note` | Full note: metadata + labels + relations + content in one call. |
| `revise` | Append a dated addendum (default) or replace the body; auto-snapshots first; reactivates dormant notes. |
| `resolve` | The one completion path: writes the outcome, sets status, archives in place; decisions auto-clone to Log → Decisions Made; `promote=true` distills into Knowledge wired `derivedFrom`. |
| `connect` | Typed relation from the closed vocabulary; symmetric types wired both ways; idempotent; `remove=true` deletes. |
| `explore` | Graph traversal: `links` / `backlinks` / `neighborhood` / `path`. |
| `maintain` | Maintenance sweep: canonicalization, lifecycle aging, legacy migration, structure repair (deep), dry-run preview. |
| `forget` | Archive in place (default) or hard-delete (`hard=true`; blocked while backlinks exist). |
| `bootstrap_brain` | Create or repair the brain structure; writes `brain.json`; idempotent. |

## Tool Reference — advanced surface (`BRAIN_MODE=full`)

Adds the low-level tools for power users and data surgery: `search_notes`, `get_recent_notes`, `create_note`, `update_note_content`, `patch_note`, `delete_note`, `clone_note`, `move_note`, `set_label`, `add_relation` (custom names), `delete_attribute`, `strengthen_relation` / `weaken_relation` (Hebbian weights), `get_relation_types`, `bulk_set_label`, `suggest_connections`, attachments (4), revisions (3), calendar notes (4), `get_brain_config`, `get_app_info`, `create_backup`.

```json
"env": {
  "TRILIUM_BASE_URL": "http://localhost:8080",
  "TRILIUM_ETAPI_TOKEN": "...",
  "BRAIN_MODE": "full"
}
```

---

## Label Conventions (written by the server — not the model)

| Label | Values | Purpose |
|-------|--------|---------|
| `#noteType` | `identity` / `person` / `organization` / `project` / `concept` / `reference` / `opinion` / `question` / `decision` / `thread` / `capture` / `session` / `domain` | Kind — exactly one per note |
| `#status` | `active` / `dormant` / `resolved` / `superseded` | Lifecycle state |
| `#created` / `#updated` / `#closed` | ISO date | The complete date vocabulary |
| `#topic` | slugged, repeatable | Subject tags (`ai-tooling`) |
| `#domain` / `#project` | slugged | Knowledge domain / project membership |
| `#facet` | `profile` / `preference` / `context` | Identity routing |
| `#mood` | slugged | Opinion tone |
| `#archived` | (flag) | Excluded from default recall; content preserved in place |
| `#sw_{type}_{targetId}` | integer | Synaptic weight (advanced mode) |

Legacy v3 labels (`dateOpened`, `dateStored`, `sessionDate`, `noteType=knowledge`, `status=pending`, …) are migrated automatically by `maintain`.

---

## Relation Vocabulary (closed — enforced by `connect`)

| Relation | Direction | Use when |
|----------|-----------|----------|
| `relatesTo` | A → B | Generic connection (last resort) |
| `extends` | A → B | A builds on or elaborates B |
| `contradicts` | A → B | A conflicts with B |
| `supports` | A → B | A provides evidence for B |
| `causes` | A → B | A produces or leads to B |
| `references` | A → B | A cites B as a source |
| `partOf` | A → B | A semantically belongs to B (auto-wired for `project=`) |
| `worksWith` | A ↔ B | Collaboration — symmetric, auto-bidirectional |
| `mentors` | A → B | A teaches or guides B |
| `instanceOf` | A → B | A is a concrete example of B |
| `supersedes` | A → B | A replaces B (auto-wired via `supersedes=`; B archived) |
| `implements` | A → B | A is the realisation of concept B |
| `inspiredBy` | A → B | A was conceptually influenced by B |
| `sourceOf` | A → B | A is the origin or provenance of B |
| `derivedFrom` | A → B | A was synthesised from B (auto-wired by `resolve(promote=true)`) |

> `~template` is Trilium-internal and wired automatically. Never wire it manually.

---

## Migrating from v3

1. Pull v4, `bun install && bun run build`, restart your MCP client. Your `brain.json` loads unchanged (the lifecycle `policy` block is added with defaults).
2. Ask Claude to run `maintain(deep=true)` once. The sweep migrates everything in place: legacy label vocabularies, the v3 date-label zoo, title status-suffixes, naked question notes, empty per-project/per-domain container folders, duplicate session logs.
3. If you relied on the removed high-level v3 tools (`store_memory`, `create_thread`, `log_session`, …), their behavior now lives in `remember` / `resolve` / `end_session`. Set `BRAIN_MODE=full` if you also want the raw low-level surface.
4. Replace your installed skill with the new `SKILL.md`.

---

## Credits

- [TriliumNext Notes](https://github.com/TriliumNext/Notes) — the open-source, self-hosted knowledge base that powers this MCP server's backend. Trilium Brain would not exist without the TriliumNext team's work on TriliumNext Notes and its ETAPI.

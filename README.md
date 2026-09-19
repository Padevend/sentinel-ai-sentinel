# Sentinel 🛡️

> **Next-Generation Open Source AI Software Engineering Agent**
> Autonomous Architecture, Multi-Project Intelligence, Persistent Sessions & Zero-Config Distribution.

Sentinel is an interactive software development agent designed to understand, navigate, build, test, and debug codebases across the full stack.

---

## ⚡ 1-Line Installation

### Linux & macOS
```bash
curl -fsSL https://raw.githubusercontent.com/Padevend/sentinel-ai-sentinel/main/distribution/install.sh | sh
```

### Windows (PowerShell)
```powershell
irm https://raw.githubusercontent.com/Padevend/sentinel-ai-sentinel/main/distribution/install.ps1 | iex
```

---

## 🚀 Usage

Navigate to any codebase and launch Sentinel:

```bash
cd my-project
sentinel
```

### Command-Line Flags

```bash
# Launch interactive session (or Setup Wizard on first launch)
sentinel

# Resume the latest active or interrupted session for this project
sentinel --continue
sentinel -c

# Interactively browse and select from previous sessions
sentinel --resume
sentinel -r

# Resume a specific session directly by ID
sentinel --resume sess_1771802100_abc12

# Run system health diagnostics
sentinel doctor

# Run non-destructive automated self-test of all subsystems
sentinel --self-test

# Display version and platform
sentinel --version
sentinel -v
```

---

## 📁 Runtime Directory Layout

Sentinel isolates its persistent state, configuration, and logs inside standard platform directories:

```text
~/sentinel/
├── config/
│   ├── settings.json       # User settings & active provider
│   └── providers.json      # Custom provider definitions
├── data/
│   ├── sentinel.db         # SQLite persistent state (WAL mode: projects, sessions, checkpoints)
│   ├── sessions/           # Session snapshots & metadata
│   └── projects/           # Project identities & structural records
├── cache/
│   └── index/              # Structural symbol cache & AST data
└── logs/
    └── sentinel.log        # Structured rotated logs (max 10MB per file)
```

---

## 🏗️ Architecture

Sentinel is organized as a modular, decoupled TypeScript monorepo:

```text
sentinel/
├── apps/
│   └── cli/                # Interactive persistent Terminal UI (Ink + React)
│
├── packages/
│   ├── core/               # Domain types, platform abstraction, doctor, config resolver, logger, metrics, events
│   ├── llm/                # LLM provider abstraction (Google AI, OpenAI, Anthropic, Custom/Ollama/OpenRouter)
│   ├── tools/              # Filesystem, Shell, Git, and Project tools
│   ├── agent/              # Agent Kernel, SessionManager, Checkpoint Engine, Verification
│   ├── context/            # Context Engine (token budgeting, dynamic relevance scoring)
│   ├── project/            # ProjectDetector, ProjectIdentityService, AST Indexer & Structural Analyzer
│   ├── memory/             # Session memory, project memory, and tool history
│   ├── storage/            # SQLiteRepositories with schema migrations & WAL mode
│   ├── git/                # Git client abstraction
│   └── permissions/        # Three-tier tool permission system (safe, confirm_recommended, confirm_required)
│
└── distribution/           # GitHub release installers (install.sh, install.ps1)
```

---

## 🛠️ Built-in Tools

| Tool | Category | Permission Level | Description |
|---|---|---|---|
| `list_directory` | Filesystem | `safe` | List files and directories |
| `read_file` | Filesystem | `safe` | Read file contents with line numbers |
| `search_text` | Filesystem | `safe` | Search text/regex across codebase |
| `write_file` | Filesystem | `confirm_recommended` | Create or overwrite files |
| `patch_file` | Filesystem | `confirm_recommended` | Apply targeted search/replace patches |
| `delete_file` | Filesystem | `confirm_required` | Delete files with confirmation |
| `execute_command` | Shell | `confirm_recommended` | Run shell commands (tests, builds, scripts) |
| `git_status` | Git | `safe` | Repository branch and file status |
| `git_diff` | Git | `safe` | Staged or working tree diffs |
| `git_log` | Git | `safe` | Commit history |
| `git_branch` | Git | `safe` | List local and remote branches |

---

## 🎮 Interactive Slash Commands

| Command | Description |
|---|---|
| `/model` | Open interactive selector to choose or switch models in real-time |
| `/reasoning`, `/effort` | Select `auto`, `low`, `medium`, `high` or `max` reasoning effort |
| `/permissions` | Edit tool permission levels for the current session or global settings |
| `/reset` | Reset configuration, persist session closure and exit Sentinel |
| `/status` | Show project tech stack, file count & git status |
| `/clear` | Clear session message history |
| `/exit`, `/quit`, `/q`, `/ecit` | Save session state and exit Sentinel |

---

## 🧪 Development & Building from Source

```bash
# Clone repository
git clone https://github.com/sentinel-ai/sentinel.git
cd sentinel

# Install dependencies
pnpm install

# Run unit and integration tests
pnpm test

# Build all workspace packages
pnpm build

# Produce production ESM bundle (dist/sentinel.mjs)
pnpm bundle
```

---

## 📜 License

MIT License — free for personal and commercial development.

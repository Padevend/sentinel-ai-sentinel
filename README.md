# Sentinel 🛡️

> **Next-Generation Open Source AI Software Engineering Agent**

Sentinel is an interactive software development agent designed to understand, navigate, build, test, and debug codebases across the full stack.

---

## ⚡ Quickstart

### 1. Prerequisites
- **Node.js**: >= 20.0.0
- **pnpm**: >= 9.0.0
- **Git**: installed and in PATH

### 2. Installation & Build

```bash
# Clone the repository
git clone https://github.com/your-org/sentinel.git
cd sentinel

# Install dependencies
pnpm install

# Build all workspace packages
pnpm build
```

### 3. Start Sentinel

```bash
# Start directly (Setup Wizard runs on first launch)
pnpm start

# Or in development mode (hot reload)
pnpm dev
```

On first launch, Sentinel's interactive setup wizard will guide you through:
1. Choosing your provider (**Google AI Studio (default)**, OpenAI, Anthropic, or Custom OpenAI-compatible).
2. Entering your API key (stored securely in `~/.sentinel/settings.json`).
3. Selecting your active model (e.g. `gemini-2.5-flash`).

See [BUILD.md](BUILD.md) for full installation and multi-machine deployment instructions.

---

## 🏗️ Architecture

Sentinel uses a decoupled, modular monorepo structure:

```text
sentinel/
├── apps/
│   └── cli/                # Interactive persistent Terminal UI (Ink + React)
│
├── packages/
│   ├── core/               # Shared types, errors, config, logger, metrics, event-bus
│   ├── llm/                # Model-agnostic LLM provider abstraction (Google AI, OpenAI, Anthropic, Custom)
│   ├── tools/              # Filesystem, Shell, Git, and Project tools
│   ├── agent/              # Agent Kernel (reason -> act -> observe -> adapt), session & verification
│   ├── context/            # Context Engine (relevance scoring & token budgeting)
│   ├── project/            # Project Indexer & Structural Analyzer (AST / symbol extraction)
│   ├── memory/             # Session memory, project memory, and tool history
│   ├── storage/            # Local persistence abstraction (SQLite / In-Memory)
│   ├── git/                # Git client abstraction
│   └── permissions/        # Three-tier tool permission system (safe, confirm_recommended, confirm_required)
│
└── tests/
    └── fixtures/           # Small, deterministic test repositories
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

## 🎮 Slash Commands

| Command | Description |
|---|---|
| `/model` | Open interactive selector to choose/switch model for current provider |
| `/reset` | Wipe `~/.sentinel/settings.json` and reset all configuration to 0 |
| `/status` | Show project tech stack, file count & git status |
| `/permissions` | Show active tool permission levels & safety rules |
| `/clear` | Clear conversation history and reset memory session |
| `/help` | Show available slash commands |
| `/exit` | Exit Sentinel |

---

## 🧪 Testing

```bash
# Run unit & integration tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

---

## 📜 License

Apache-2.0 or MIT. Open source.

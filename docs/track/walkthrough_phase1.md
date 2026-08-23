# Sentinel — Phase 1 MVP Walkthrough

## 🌟 Overview

We have built **Sentinel Phase 1: Solid Foundations & Functional MVP**, a next-generation open-source software engineering agent written in TypeScript with a modular monorepo architecture.

Sentinel is engineered around an **orchestration layer independent of the LLM provider**, capable of exploring, understanding, modifying, testing, and debugging codebases through a persistent interactive terminal UI.

---

## 🏛️ Monorepo Structure & Packages

```text
sentinel/
├── apps/
│   └── cli/                     # Interactive persistent Terminal UI (Ink 5 + React 18)
│       ├── src/
│       │   ├── components/      # Header, MessageList, ToolActivity, InputPrompt, ConfirmationPrompt
│       │   ├── commands.ts      # Slash command handler (/help, /status, /model, /clear, /exit)
│       │   ├── App.tsx          # Main Ink component wiring up event bus & agent kernel
│       │   └── index.tsx        # CLI entry point ('sentinel')
│
├── packages/
│   ├── core/                    # Core foundation: branded types, error hierarchy, config, logger, metrics, event-bus
│   ├── llm/                     # Model-agnostic LLM provider abstraction (OpenAI, Anthropic, OpenRouter, Local inference)
│   ├── tools/                   # Tool registry & implementations (Filesystem, Shell, Git)
│   ├── agent/                   # Agent Kernel (reason -> act -> observe -> adapt), session & verification engine
│   ├── context/                 # Context Engine (relevance scoring, symbol retrieval, token budgeting)
│   ├── project/                 # Project Indexer & Structural Analyzer (extracts functions, classes, routes, React components)
│   ├── memory/                  # Session memory, project memory, and condensed tool history
│   ├── storage/                 # Persistence layer abstraction (SQLite with WAL & InMemory adapter)
│   ├── git/                     # Git client abstraction with safe operations
│   └── permissions/             # 3-tier permission manager (safe, confirm_recommended, confirm_required)
│
├── tests/
│   ├── fixtures/
│   │   └── fullstack-app/       # Benchmark scenario: React frontend + Express API + email validation bug + tests
│   └── integration/
│       └── agent-tools.test.ts  # End-to-end multi-step agent verification
│
├── docs/
│   ├── architecture.md          # Technical architecture specification
│   └── tools.md                 # Complete tools and permissions reference
│
├── package.json                 # Workspace root config (ESM, TypeScript strict)
├── pnpm-workspace.yaml          # Monorepo declaration
├── tsconfig.base.json           # Shared TypeScript configuration
├── vitest.config.ts             # Test runner configuration
├── .env.example                 # Flexible provider environment template (SENTINEL_API_KEY, SENTINEL_BASE_URL, SENTINEL_MODEL)
└── README.md                    # Comprehensive installation & usage guide
```

---

## 🔑 Key Features Implemented

### 1. Flexible Model Provider (`@sentinel/llm`)
- Fully decoupled from any single provider.
- `OpenAIProvider`: supports OpenAI, OpenRouter, Azure, and local inference engines via `SENTINEL_BASE_URL`.
- `AnthropicProvider`: maps Claude `tool_use` and content blocks to Sentinel's unified interface.
- Streaming responses with real-time tool call accumulation.

### 2. Deterministic Tool System (`@sentinel/tools` & `@sentinel/permissions`)
- **Filesystem**: `list_directory`, `read_file` (with line ranges), `search_text` (ripgrep-like), `write_file`, `patch_file` (targeted search/replace), `delete_file`.
- **Shell**: `execute_command` with timeout, buffer limits, and abort signal cancellation.
- **Git**: `git_status`, `git_diff`, `git_log`, `git_branch`.
- **Security**: 3-tier permissions (`safe`, `confirm_recommended`, `confirm_required`) and dangerous command blocklists (`rm -rf /`, fork bombs).

### 3. Structural Analyzer & Project Index (`@sentinel/project`)
- Scans repositories honoring `.gitignore`.
- Automatically detects languages (TypeScript, JavaScript, Python, Rust, Go), frameworks (React, Next.js, Express, Fastify, NestJS, Prisma), package managers (pnpm, npm, yarn, bun), and test runners (Vitest, Jest, Mocha).
- Extracts structural symbols: functions, classes, interfaces, types, HTTP routes/endpoints, and React components.

### 4. Context Engine & Relevance Scoring (`@sentinel/context`)
- Avoids blindly injecting the full repository into the LLM context.
- Scores files and symbols by query tokens, AST symbol matches, path proximity, and session recency.
- Budget-aware prompt formatting and truncation.

### 5. Memory Engine (`@sentinel/memory`)
- `SessionMemory`: tracks working files, facts, recent errors, and active goals.
- `ProjectMemory`: persistent facts backed by SQLite/StorageAdapter.
- `ToolHistory`: condensed operational feedback to prevent duplicate actions.

### 6. Agent Kernel & Verification Engine (`@sentinel/agent`)
- Implements the multi-step `reason -> act -> observe -> adapt` loop.
- Supports Ctrl+C cancellation via `AbortSignal`.
- `VerificationEngine`: detects test suites, executes tests after code edits, analyzes test errors, and extracts diagnostic hints for auto-correction.

### 7. Interactive Terminal UI (`apps/cli`)
- Built with Ink 5 + React 18.
- Persistent session opened with `sentinel`.
- Real-time tool execution indicators (◉ / ✓ / ✗).
- Interactive permission confirmation dialogs for sensitive actions.
- Built-in slash commands: `/help`, `/status`, `/model`, `/clear`, `/exit`.

---

## 🎯 Verification & Benchmark Scenario

A complete test fixture was created in `tests/fixtures/fullstack-app/` with an intentional email validation bug and test suite (`validator.test.ts`), ready to test Sentinel's ability to search, patch, test, and verify fixes automatically.

Integration and unit test suites are available across:
- `packages/core/src/__tests__/core.test.ts`
- `packages/permissions/src/__tests__/permissions.test.ts`
- `packages/tools/src/__tests__/tools.test.ts`
- `packages/agent/src/__tests__/agent.test.ts`
- `tests/integration/agent-tools.test.ts`

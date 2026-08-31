# Building and Distributing Sentinel 🛠️

This document covers local development, packaging, release workflows, and distribution mechanisms for Sentinel.

---

## 1. Prerequisites

- **Node.js**: `v20.0.0` or higher (`v22` recommended)
- **pnpm**: `v9.0.0` or higher (`v10` supported)
- **Git**: Installed and accessible in PATH
- **C/C++ Build Tools** (optional, for compiling native `better-sqlite3` bindings from source if prebuilt binaries are unavailable):
  - **Linux**: `build-essential`, `python3`
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools or Windows SDK

---

## 2. Local Development

### Clone and Setup
```bash
git clone https://github.com/sentinel-ai/sentinel.git
cd sentinel
pnpm install
```

### Build Packages
```bash
# Compiles all 11 packages in topological dependency order
pnpm build
```

### Run Tests
```bash
# Runs full test suite (36 unit & integration tests)
pnpm test

# Run tests in watch mode
pnpm test:watch
```

---

## 3. Production Bundling

Sentinel uses `esbuild` to produce a standalone executable bundle `dist/sentinel.js` that packages all workspace TypeScript code into a single, optimized ESM binary:

```bash
pnpm bundle
```

This creates:
- `dist/sentinel.js` (Standalone CLI binary with shebang)
- `dist/sentinel.js.map` (Source map)

You can test the bundled distribution directly:
```bash
node dist/sentinel.js --version
node dist/sentinel.js doctor
node dist/sentinel.js --self-test
```

---

## 4. Distribution Artifacts

### A. One-Line Installers
- **Linux / macOS**: `distribution/install.sh`
  ```bash
  curl -fsSL https://raw.githubusercontent.com/sentinel-ai/sentinel/main/distribution/install.sh | sh
  ```
- **Windows (PowerShell)**: `distribution/install.ps1`
  ```powershell
  irm https://raw.githubusercontent.com/sentinel-ai/sentinel/main/distribution/install.ps1 | iex
  ```

### B. WinGet Package Manifest
- Located in `distribution/winget/Sentinel.Sentinel.yaml`
- Submittable to the `microsoft/winget-pkgs` official repository.

### C. CI/CD Release Pipeline
- Automated GitHub Actions workflow at `.github/workflows/release.yml`.
- Automatically builds multi-platform release archives on git tag push `v*`:
  - `sentinel-linux-x64.tar.gz`
  - `sentinel-darwin-arm64.tar.gz`
  - `sentinel-windows-x64.zip`
  - `SHA256SUMS` checksum manifest.

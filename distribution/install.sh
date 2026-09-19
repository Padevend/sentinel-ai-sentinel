#!/bin/sh
# Sentinel Official Installer for Linux & macOS
# Usage: curl -fsSL https://raw.githubusercontent.com/sentinel-ai/sentinel/main/distribution/install.sh | sh

set -e

RESET='\033[0m'
BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'

echo "${CYAN}${BOLD}"
echo "      SENTINEL — AI Software Engineering Agent"
echo "      Autonomous Architecture & Development Runtime"
echo "${RESET}"

# 1. Detect OS & Architecture
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

if ! command -v node >/dev/null 2>&1; then
  echo "${RED}Error: Node.js 20 or newer is required.${RESET}"
  exit 1
fi
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "${RED}Error: Node.js 20 or newer is required (found $(node --version)).${RESET}"
  exit 1
fi

case "$OS" in
  linux)
    TARGET_OS="linux"
    ;;
  darwin)
    TARGET_OS="darwin"
    ;;
  *)
    echo "${RED}Error: Unsupported operating system: $OS${RESET}"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64)
    TARGET_ARCH="x64"
    ;;
  aarch64|arm64)
    TARGET_ARCH="arm64"
    ;;
  *)
    echo "${RED}Error: Unsupported architecture: $ARCH${RESET}"
    exit 1
    ;;
esac

INSTALL_DIR="$HOME/.sentinel"
BIN_DIR="$INSTALL_DIR/bin"
EXECUTABLE="$BIN_DIR/sentinel"

mkdir -p "$BIN_DIR" "$INSTALL_DIR/config" "$INSTALL_DIR/data" "$INSTALL_DIR/cache" "$INSTALL_DIR/logs"

# 2. Determine Version and URLs
VERSION="${SENTINEL_VERSION:-latest}"
REPO="${SENTINEL_REPO:-Padevend/sentinel-ai-sentinel}"

if [ "$VERSION" = "latest" ]; then
  RELEASE_URL="https://github.com/$REPO/releases/latest/download"
else
  RELEASE_URL="https://github.com/$REPO/releases/download/v$VERSION"
fi

TARBALL="sentinel-${TARGET_OS}-${TARGET_ARCH}.tar.gz"
DOWNLOAD_URL="$RELEASE_URL/$TARBALL"
CHECKSUM_URL="$RELEASE_URL/SHA256SUMS"

echo "Detected Platform: ${BOLD}${TARGET_OS}-${TARGET_ARCH}${RESET}"
echo "Installation Directory: ${BOLD}${BIN_DIR}${RESET}"
echo "Downloading Sentinel (${VERSION})..."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$DOWNLOAD_URL" -o "$TMP_DIR/$TARBALL" || {
    echo "${YELLOW}Release artifact download failed.${RESET}"
  }
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$TMP_DIR/$TARBALL" "$DOWNLOAD_URL" || true
fi

# 3. Extract or Install Executable
if [ -f "$TMP_DIR/$TARBALL" ]; then
  CHECKSUM_FILE="$TMP_DIR/SHA256SUMS"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$CHECKSUM_URL" -o "$CHECKSUM_FILE"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$CHECKSUM_FILE" "$CHECKSUM_URL"
  else
    echo "${RED}Error: curl or wget is required to verify the release checksum.${RESET}"
    exit 1
  fi
  EXPECTED_SHA="$(awk -v file="$TARBALL" '$2 == file { print $1 }' "$CHECKSUM_FILE")"
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_SHA="$(sha256sum "$TMP_DIR/$TARBALL" | awk '{ print $1 }')"
  else
    ACTUAL_SHA="$(shasum -a 256 "$TMP_DIR/$TARBALL" | awk '{ print $1 }')"
  fi
  if [ -z "$EXPECTED_SHA" ] || [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
    echo "${RED}Error: release checksum verification failed.${RESET}"
    exit 1
  fi
  tar -xzf "$TMP_DIR/$TARBALL" -C "$BIN_DIR"
  chmod +x "$EXECUTABLE"
else
  echo "${RED}Error: release artifact not found: $DOWNLOAD_URL${RESET}"
  echo "Check the GitHub repository/tag or set SENTINEL_VERSION and SENTINEL_REPO."
  exit 1
fi

# 4. Configure Shell PATH
SHELL_NAME="$(basename "$SHELL")"
PROFILE=""

case "$SHELL_NAME" in
  zsh)
    PROFILE="$HOME/.zshrc"
    ;;
  bash)
    if [ -f "$HOME/.bashrc" ]; then
      PROFILE="$HOME/.bashrc"
    elif [ -f "$HOME/.bash_profile" ]; then
      PROFILE="$HOME/.bash_profile"
    else
      PROFILE="$HOME/.bashrc"
    fi
    ;;
  *)
    PROFILE="$HOME/.profile"
    ;;
esac

PATH_STR="export PATH=\"\$HOME/.sentinel/bin:\$PATH\""

if [ -n "$PROFILE" ]; then
  if [ ! -f "$PROFILE" ]; then
    touch "$PROFILE"
  fi
  if ! grep -q "\.sentinel/bin" "$PROFILE"; then
    echo "" >> "$PROFILE"
    echo "# Sentinel Agent CLI" >> "$PROFILE"
    echo "$PATH_STR" >> "$PROFILE"
    echo "Added ~/.sentinel/bin to ${BOLD}$PROFILE${RESET}"
  fi
fi

echo ""
echo "${GREEN}${BOLD}✓ Sentinel installed successfully!${RESET}"
echo ""
echo "To get started:"
echo "  1. Reload your shell: ${BOLD}source $PROFILE${RESET}"
echo "  2. Go to any project: ${BOLD}cd ~/my-project${RESET}"
echo "  3. Launch Sentinel:   ${BOLD}sentinel${RESET}"
echo ""

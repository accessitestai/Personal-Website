#!/usr/bin/env bash
# AMASAMYA - macOS migration script.
#
# Run from Terminal on a fresh MacBook Pro. Bootstraps Homebrew, Node,
# Python, Git, generates an SSH key, copies it to the clipboard for
# you to paste into GitHub, then clones the repo and installs every
# dependency the project needs to build, test, and serve.
#
# This script is designed to be screen-reader-friendly:
#   * Every step prints a clear "STEP N of 6 ..." banner.
#   * No silent failures - set -e exits on the first error.
#   * Final line is exactly "MIGRATION COMPLETE" or "MIGRATION FAILED"
#     so you can read the last line with VoiceOver and know the
#     outcome at a glance.
#
# Usage:
#   curl -O https://raw.githubusercontent.com/accessitestai/Personal-Website/main/beta/migrate-to-mac.sh
#   bash migrate-to-mac.sh

set -euo pipefail

# Trap any error and print a clear final-line failure marker.
trap 'echo ""; echo "MIGRATION FAILED"; echo "The last command exited with an error. Scroll up with VO+arrow keys to read what went wrong."; exit 1' ERR

GITHUB_USER="accessitestai"
REPO_NAME="Personal-Website"
TARGET_DIR="${HOME}/code/personal-website"
GIT_EMAIL="akhilesh.malani@gmail.com"

step() {
  echo ""
  echo "================================================================"
  echo "STEP $1 of 6 - $2"
  echo "================================================================"
  echo ""
}

# ─────────────────────────────────────────────────────────────────
# STEP 1 - Homebrew
# ─────────────────────────────────────────────────────────────────
step 1 "Installing Homebrew (the package manager macOS doesn't ship)"

if command -v brew >/dev/null 2>&1; then
  echo "Homebrew already installed. Skipping."
else
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add brew to PATH for the current shell AND for future sessions.
  if [ -d "/opt/homebrew/bin" ]; then
    BREW_PREFIX="/opt/homebrew"
  else
    BREW_PREFIX="/usr/local"
  fi
  echo "eval \"\$(${BREW_PREFIX}/bin/brew shellenv)\"" >> "${HOME}/.zprofile"
  eval "$(${BREW_PREFIX}/bin/brew shellenv)"
fi

# ─────────────────────────────────────────────────────────────────
# STEP 2 - System tooling: Git, Node 20, Python 3.12
# ─────────────────────────────────────────────────────────────────
step 2 "Installing Git, Node, and Python via Homebrew"
brew install git node@20 python@3.12 || true   # idempotent
brew link --overwrite node@20 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────
# STEP 3 - Git identity
# ─────────────────────────────────────────────────────────────────
step 3 "Configuring git identity"
git config --global user.email "${GIT_EMAIL}"
git config --global user.name  "Akhilesh Malani"
git config --global init.defaultBranch main
echo "git identity set to ${GIT_EMAIL}"

# ─────────────────────────────────────────────────────────────────
# STEP 4 - SSH key for GitHub
# ─────────────────────────────────────────────────────────────────
step 4 "Generating an SSH key and copying it to your clipboard"

if [ -f "${HOME}/.ssh/id_ed25519" ]; then
  echo "SSH key already exists. Reusing it."
else
  mkdir -p "${HOME}/.ssh"
  ssh-keygen -t ed25519 -C "${GIT_EMAIL}" -f "${HOME}/.ssh/id_ed25519" -N ""
fi

# Copy the public key to the system clipboard.
pbcopy < "${HOME}/.ssh/id_ed25519.pub"

cat <<'EOF'

ACTION REQUIRED - please follow these steps now:

  1. Press Cmd+Space to open Spotlight.
  2. Type Safari and press Return.
  3. Press Cmd+L to focus the address bar.
  4. Type:  github.com/settings/ssh/new   and press Return.
  5. Sign in to GitHub if prompted.
  6. The form has two fields:
       - Title:  type  MacBook Pro
       - Key:    press Cmd+V to paste (your SSH public key was just
                 copied to the clipboard automatically).
  7. Press the "Add SSH key" button (Tab to it, then press Space).
  8. Confirm with your GitHub password if asked.
  9. Return to Terminal (Cmd+Tab back to it).

When the key is added on GitHub, press Return here to continue.

EOF
read -r _

# Verify the SSH connection actually works before we try to clone.
echo ""
echo "Testing GitHub SSH connection..."
# Add github.com to known_hosts so the test doesn't prompt for confirmation.
ssh-keyscan github.com >> "${HOME}/.ssh/known_hosts" 2>/dev/null || true
# `ssh -T git@github.com` returns exit code 1 even on success - we
# detect success by the greeting in the output instead.
if ssh -T -o StrictHostKeyChecking=accept-new git@github.com 2>&1 | grep -q "successfully authenticated"; then
  echo "GitHub SSH connection verified."
else
  echo ""
  echo "GitHub did NOT accept the SSH key. Common causes:"
  echo "  - The key wasn't pasted correctly. Re-copy with:"
  echo "      pbcopy < ~/.ssh/id_ed25519.pub"
  echo "    and try the GitHub form again."
  echo "  - You're signed into a different GitHub account."
  echo ""
  echo "Re-run this script after fixing it."
  exit 1
fi

# ─────────────────────────────────────────────────────────────────
# STEP 5 - Clone the repo
# ─────────────────────────────────────────────────────────────────
step 5 "Cloning the AMASAMYA repository"

mkdir -p "${HOME}/code"
if [ -d "${TARGET_DIR}" ]; then
  echo "Project already cloned at ${TARGET_DIR}. Pulling latest changes."
  cd "${TARGET_DIR}"
  git pull --rebase
else
  git clone "git@github.com:${GITHUB_USER}/${REPO_NAME}.git" "${TARGET_DIR}"
  cd "${TARGET_DIR}"
fi

echo ""
echo "Repo is at: ${TARGET_DIR}"
git log --oneline -3

# ─────────────────────────────────────────────────────────────────
# STEP 6 - Project dependencies
# ─────────────────────────────────────────────────────────────────
step 6 "Installing project dependencies (Node, Playwright browser, Python)"

echo "Installing npm packages..."
npm install --no-audit --no-fund

echo "Installing Playwright Chromium browser..."
npx playwright install chromium

echo "Installing Python tooling..."
python3 -m pip install --user --upgrade pip >/dev/null 2>&1 || true
python3 -m pip install --user python-docx openpyxl

# ─────────────────────────────────────────────────────────────────
# Done.
# ─────────────────────────────────────────────────────────────────
cat <<EOF

================================================================
MIGRATION COMPLETE
================================================================

Project location:  ${TARGET_DIR}

Verify it works:

  cd ${TARGET_DIR}
  npx serve -l 3000 .

In a SECOND Terminal tab (Cmd+T), run:

  cd ${TARGET_DIR}
  npx playwright test

Expected output ends with: "8 passed"

If anything failed earlier in this script, the last line above
this banner will say MIGRATION FAILED. Scroll up to read which
step broke.

EOF

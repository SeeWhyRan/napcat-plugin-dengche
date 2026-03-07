#!/usr/bin/env bash
set -euo pipefail

# Simple Git helper script for this repo:
# - push: commit (optional) and push to origin/main
# - pull: fetch and fast-forward pull from origin/main
#
# Usage:
#   ./scripts/git-sync.sh           # interactive menu
#   ./scripts/git-sync.sh push      # non-interactive
#   ./scripts/git-sync.sh pull      # non-interactive
#   ./scripts/git-sync.sh status    # show status

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

DEFAULT_BRANCH="main"
REMOTE_NAME="origin"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[error] missing command: $1" >&2
    exit 1
  }
}

ensure_git_repo() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "[error] not a git repository: $REPO_DIR" >&2
    exit 1
  fi
}

ensure_remote() {
  if ! git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
    echo "[error] remote '$REMOTE_NAME' not configured" >&2
    echo "        add it with: git remote add $REMOTE_NAME <url>" >&2
    exit 1
  fi
}

current_branch() {
  git rev-parse --abbrev-ref HEAD
}

ensure_branch_main() {
  local b
  b="$(current_branch)"
  if [[ "$b" != "$DEFAULT_BRANCH" ]]; then
    echo "[info] current branch is '$b', switching to '$DEFAULT_BRANCH'" >&2
    git checkout "$DEFAULT_BRANCH"
  fi
}

show_status() {
  echo "---- repo: $REPO_DIR ----"
  echo "branch: $(current_branch)"
  echo "remote: $REMOTE_NAME -> $(git remote get-url "$REMOTE_NAME")"
  echo "-------------------------"
  git status -sb
  echo "-------------------------"
}

do_pull() {
  require_cmd git
  ensure_git_repo
  ensure_remote
  ensure_branch_main

  echo "[pull] fetching..."
  git fetch "$REMOTE_NAME" "$DEFAULT_BRANCH"

  echo "[pull] fast-forward merge..."
  # Only fast-forward, avoid creating merge commits implicitly
  git merge --ff-only "$REMOTE_NAME/$DEFAULT_BRANCH"

  echo "[pull] done"
  show_status
}

prompt_commit_if_needed() {
  # If there are staged or unstaged changes, optionally commit them.
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "[push] working tree has changes."
    echo "1) commit & push"
    echo "2) push only (if you already committed)"
    echo "3) abort"

    local choice
    read -r -p "Choose [1-3]: " choice
    case "$choice" in
      1)
        git add -A
        local msg
        read -r -p "Commit message: " msg
        if [[ -z "${msg// }" ]]; then
          echo "[error] empty commit message" >&2
          exit 1
        fi
        git commit -m "$msg"
        ;;
      2)
        # continue
        ;;
      *)
        echo "[push] aborted" >&2
        exit 1
        ;;
    esac
  fi
}

do_push() {
  require_cmd git
  ensure_git_repo
  ensure_remote
  ensure_branch_main

  prompt_commit_if_needed

  echo "[push] pushing to $REMOTE_NAME/$DEFAULT_BRANCH ..."
  git push -u "$REMOTE_NAME" "$DEFAULT_BRANCH"

  echo "[push] done"
  show_status
}

interactive_menu() {
  show_status
  echo "Select action:"
  echo "1) push (commit optional)"
  echo "2) pull (fast-forward only)"
  echo "3) status"
  echo "4) quit"

  local choice
  read -r -p "Choose [1-4]: " choice
  case "$choice" in
    1) do_push ;;
    2) do_pull ;;
    3) show_status ;;
    *) exit 0 ;;
  esac
}

main() {
  local action="${1:-}" 
  case "$action" in
    push) do_push ;;
    pull) do_pull ;;
    status) show_status ;;
    "") interactive_menu ;;
    -h|--help|help)
      sed -n '1,60p' "$0"
      ;;
    *)
      echo "[error] unknown action: $action" >&2
      echo "        use: $0 [push|pull]" >&2
      exit 1
      ;;
  esac
}

main "$@"

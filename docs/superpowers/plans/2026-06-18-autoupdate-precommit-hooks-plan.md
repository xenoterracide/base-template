<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Auto-Update pre-commit Hooks on Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a best-effort `pre-commit autoupdate` step to the
`post-checkout` hook so consumers of `subtree-share` pre-commit hooks stay
reasonably current without versioned tags.

**Architecture:** Keep the existing `sync-tooling` call in `post-checkout`.
After it completes, run `uv run --frozen pre-commit autoupdate`. Missing `uv`
is an error; autoupdate failures are swallowed so network outages do not block
branch checkouts. Update `README.md` and `AGENTS.md` to document the behavior.

**Tech Stack:** POSIX shell, uv, pre-commit.

## Global Constraints

- All files MUST have SPDX license headers.
- Hook scripts must remain executable.
- `post-checkout` must continue to support both native git args and pre-commit
  env vars (`PRE_COMMIT_FROM_REF`, `PRE_COMMIT_CHECKOUT_TYPE`).
- CI is already skipped via `[ -n "$CI" ] && exit 0`.
- Missing `uv` fails the hook; network/pre-commit autoupdate failures do not.
- Branch must stay synchronized with `origin/develop` via merge.

---

## File Structure

- `git/hooks/post-checkout` (modify) — add autoupdate step after sync-tooling.
- `README.md` (modify) — document autoupdate behavior in the Git hooks section.
- `AGENTS.md` (modify) — mention autoupdate behavior in hook conventions.

---

### Task 1: Add autoupdate to `git/hooks/post-checkout`

**Files:**

- Modify: `git/hooks/post-checkout`
- Test: manual run of `git/hooks/post-checkout` from a branch checkout

**Interfaces:**

- Consumes: `sync-tooling` helper and `check-yarn-env` helper.
- Produces: `post-checkout` hook that also runs `pre-commit autoupdate` after
  tooling sync.

- [ ] **Step 1: Read current `git/hooks/post-checkout`**

  Run: `cat git/hooks/post-checkout`

- [ ] **Step 2: Modify `git/hooks/post-checkout`**

  Replace the final `exec "$SCRIPT_DIR/sync-tooling" "$PREV_HEAD"` block with
  the following:

  ```sh
  SCRIPT_DIR="$(dirname "$0")"
  "$SCRIPT_DIR/sync-tooling" "$PREV_HEAD"

  command -v uv >/dev/null 2>&1 || {
    echo "ERROR: uv is required but not found." >&2
    exit 1
  }

  uv run --frozen pre-commit autoupdate || true
  ```

  The full file should now look like this:

  ```sh
  #!/bin/sh

  # SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
  #
  # SPDX-License-Identifier: MIT

  # Skip in CI environments
  [ -n "$CI" ] && exit 0

  "$(dirname "$0")/check-yarn-env" || exit $?

  # post-checkout receives: $1 = previous HEAD, $2 = new HEAD, $3 = flag (1=branch, 0=file)
  # pre-commit passes the same data as env vars instead of positional args.
  PREV_HEAD="${1:-$PRE_COMMIT_FROM_REF}"
  CHECKOUT_TYPE="${3:-$PRE_COMMIT_CHECKOUT_TYPE}"

  # Only run on branch checkouts (not file checkouts)
  [ "$CHECKOUT_TYPE" = "1" ] || exit 0

  SCRIPT_DIR="$(dirname "$0")"
  "$SCRIPT_DIR/sync-tooling" "$PREV_HEAD"

  command -v uv >/dev/null 2>&1 || {
    echo "ERROR: uv is required but not found." >&2
    exit 1
  }

  uv run --frozen pre-commit autoupdate || true
  ```

- [ ] **Step 3: Validate shell syntax**

  Run: `sh -n git/hooks/post-checkout`

  Expected: no output, exit 0.

- [ ] **Step 4: Run format and license checks**

  Run: `yarn lint:prettier && yarn lint:reuse`

  Expected: both pass.

- [ ] **Step 5: Commit**

  ```bash
  git add git/hooks/post-checkout
  git commit -m "feat(hooks): autoupdate pre-commit hooks on checkout

  - Run pre-commit autoupdate after tooling sync in post-checkout
  - Require uv; fail if missing so developers know tooling is absent
  - Swallow autoupdate errors so network outages do not block checkouts

  Assisted-by: Kimi:kimi-code-cli"
  ```

---

### Task 2: Update `README.md`

**Files:**

- Modify: `README.md`

**Interfaces:**

- Consumes: autoupdate behavior from Task 1.
- Produces: documented consumer behavior.

- [ ] **Step 1: Read current README Git hooks section**

  Run: `sed -n '/## Git hooks/,/^## /p' README.md`

- [ ] **Step 2: Add autoupdate note**

  After the `pre-commit install` code block and before the local development
  note, add:

  ```markdown
  The `share-post-checkout` hook also runs `pre-commit autoupdate` after
  syncing tooling. This keeps the configured `rev:` current when `develop`
  moves forward, without requiring versioned tags. Autoupdate failures (for
  example, due to no network) are reported but do not block the checkout.
  ```

- [ ] **Step 3: Validate formatting**

  Run: `yarn prettier --check README.md`

  Expected: `All matched files use Prettier code style!`

- [ ] **Step 4: Run REUSE check**

  Run: `yarn lint:reuse`

  Expected: compliant.

- [ ] **Step 5: Commit**

  ```bash
  git add README.md
  git commit -m "docs(readme): document pre-commit autoupdate on checkout

  - Explain that share-post-checkout keeps the pre-commit rev current
  - Note that autoupdate failures do not block checkouts

  Assisted-by: Kimi:kimi-code-cli"
  ```

---

### Task 3: Update `AGENTS.md`

**Files:**

- Modify: `AGENTS.md`

**Interfaces:**

- Consumes: autoupdate behavior from Task 1.
- Produces: contributor-facing convention note.

- [ ] **Step 1: Read current `AGENTS.md` hooks section**

  Run: `sed -n '/## Conventions/,/^## /p' AGENTS.md`

- [ ] **Step 2: Update the pre-commit paragraph**

  Find the paragraph that begins "Hooks in `git/hooks/` are also exposed..."
  and append:

  ```markdown
  The `post-checkout` hook runs `pre-commit autoupdate` as a best-effort step
  after tooling sync; hook changes must not break this behavior or assume it is
  the only way consumers receive updates.
  ```

- [ ] **Step 3: Validate formatting**

  Run: `yarn prettier --check AGENTS.md`

  Expected: `All matched files use Prettier code style!`

- [ ] **Step 4: Run REUSE check**

  Run: `yarn lint:reuse`

  Expected: compliant.

- [ ] **Step 5: Commit**

  ```bash
  git add AGENTS.md
  git commit -m "docs(agents): document pre-commit autoupdate convention

  - Note that post-checkout runs best-effort pre-commit autoupdate

  Assisted-by: Kimi:kimi-code-cli"
  ```

---

### Task 4: Integration test and PR

**Files:**

- None (temporary consumer test repo).

**Interfaces:**

- Consumes: modified `post-checkout` from Task 1.

- [ ] **Step 1: Create a temporary consumer repo**

  ```bash
  cd /tmp
  rm -rf precommit-autoupdate-test
  mkdir precommit-autoupdate-test
  cd precommit-autoupdate-test
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test"
  git commit --allow-empty -q -m "initial"
  uv init -q
  uv add --group dev pre-commit -q
  ```

- [ ] **Step 2: Configure pre-commit**

  Create `.pre-commit-config.yaml`:

  ```yaml
  ---
  repos:
    - repo: /home/ai/subtree-share
      rev: develop
      hooks:
        - id: share-post-checkout
  ```

- [ ] **Step 3: Install the hook**

  Run: `uv run pre-commit install --hook-type post-checkout`

  Expected: `pre-commit installed at .git/hooks/post-checkout`

- [ ] **Step 4: Trigger the hook with a checkout**

  ```bash
  git checkout -b test-branch
  ```

  Expected: the hook runs. `pre-commit autoupdate` output may appear and
  rewrite `.pre-commit-config.yaml` if `develop` resolved to a different SHA.
  The checkout succeeds regardless.

- [ ] **Step 5: Simulate missing uv**

  Temporarily move `uv` out of PATH or run the hook directly with PATH unset:

  ```bash
  env -u PATH .git/hooks/post-checkout HEAD HEAD 1
  ```

  Expected: hook fails with `ERROR: uv is required but not found.`

- [ ] **Step 6: Clean up**

  ```bash
  cd /home/ai/subtree-share
  rm -rf /tmp/precommit-autoupdate-test
  ```

- [ ] **Step 7: Push branch and create/update PR**

  ```bash
  git checkout -b feat/autoupdate-precommit-hooks
  git push -u origin feat/autoupdate-precommit-hooks
  gh pr create --title "feat(hooks): autoupdate pre-commit hooks on checkout" \
    --body "- Run pre-commit autoupdate after tooling sync in post-checkout
  - Require uv; fail if missing
  - Swallow autoupdate errors so network outages do not block checkouts
  - Document behavior in README.md and AGENTS.md

  Assisted-by: Kimi:kimi-code-cli" \
    --base develop
  ```

  If a PR already exists for this branch, use `gh pr edit` instead.

- [ ] **Step 8: Verify required checks pass**

  Run: `gh pr checks --watch --required`

  Expected: `license / check`, `node-cli / check`, `prettier / check` all pass.

---

## Spec Coverage

| Spec requirement                                                  | Task   |
| ----------------------------------------------------------------- | ------ |
| Run `pre-commit autoupdate` after tooling sync in `post-checkout` | Task 1 |
| Require `uv` (fail if missing)                                    | Task 1 |
| Swallow autoupdate errors                                         | Task 1 |
| Update `README.md`                                                | Task 2 |
| Update `AGENTS.md`                                                | Task 3 |
| Integration test                                                  | Task 4 |

## Placeholder Scan

No TBD/TODO/"fill in details"/"appropriate error handling"/"similar to Task N"
patterns present. Every step includes exact file paths, commands, and expected
output.

## Type Consistency

Hook behavior and file paths are consistent across tasks and docs.

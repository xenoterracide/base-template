<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# pre-commit Hook Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `.pre-commit-hooks.yaml` manifest and supporting documentation
so downstream repositories can install `subtree-share` git hooks from a git URL
without a `postinstall` step.

**Architecture:** Keep the existing `git/hooks/*.sh` scripts as the canonical
implementation. Add a pre-commit manifest at the repository root that points
each hook stage to the corresponding shell script. Update project documentation
so consumers know how to add the repo as a pre-commit source.

**Tech Stack:** POSIX shell, YAML, pre-commit, Yarn PnP, uv.

## Global Constraints

- All files MUST have SPDX license headers.
- Hook scripts must remain executable.
- `commit-msg` receives the commit message file path as `$1`.
- `pre-commit` continues to delegate to `lint-staged`.
- `post-checkout` and `post-merge` operate on repository state, not individual
  files.
- Do not use `postinstall` scripts for hook installation.
- Branch must stay synchronized with `origin/develop` via merge.

---

## File Structure

- `.pre-commit-hooks.yaml` (new) — manifest declaring the four share hooks.
- `README.md` (modify) — add a "Using hooks in another repository" section.
- `CONTRIBUTING.md` (modify) — mention the pre-commit distribution path.
- `AGENTS.md` (modify) — update hook installation/consumption notes.

---

### Task 1: Add `.pre-commit-hooks.yaml` manifest

**Files:**

- Create: `.pre-commit-hooks.yaml`
- Test: manually verify with `pre-commit try-repo`

**Interfaces:**

- Produces: a pre-commit manifest with hook IDs `share-commit-msg`,
  `share-pre-commit`, `share-post-checkout`, `share-post-merge`.

- [ ] **Step 1: Create the manifest file**

  Write `.pre-commit-hooks.yaml`:

  ```yaml
  ---
  - id: share-commit-msg
    name: Validate conventional commit message
    entry: git/hooks/commit-msg
    language: script
    stages: [commit-msg]

  - id: share-pre-commit
    name: Run lint-staged
    entry: git/hooks/pre-commit
    language: script
    stages: [pre-commit]

  - id: share-post-checkout
    name: Sync tooling after checkout
    entry: git/hooks/post-checkout
    language: script
    always_run: true
    pass_filenames: false
    stages: [post-checkout]

  - id: share-post-merge
    name: Sync tooling after merge
    entry: git/hooks/post-merge
    language: script
    always_run: true
    pass_filenames: false
    stages: [post-merge]
  ```

- [ ] **Step 2: Validate YAML formatting**

  Run: `yarn prettier --check .pre-commit-hooks.yaml`

  Expected: `All matched files use Prettier code style.`

- [ ] **Step 3: Verify REUSE compliance**

  Run: `yarn lint:reuse`

  Expected: `Congratulations! Your project is compliant...`

- [ ] **Step 4: Commit**

  ```bash
  git add .pre-commit-hooks.yaml
  git commit -m "feat: add pre-commit hooks manifest

  - Expose commit-msg, pre-commit, post-checkout, post-merge hooks
  - Shell scripts remain canonical implementation
  - No postinstall required

  Assisted-by: Kimi:kimi-code-cli"
  ```

---

### Task 2: Document consumer usage in `README.md`

**Files:**

- Modify: `README.md`

**Interfaces:**

- Consumes: `.pre-commit-hooks.yaml` from Task 1.
- Produces: documented consumer workflow.

- [ ] **Step 1: Read current `README.md`**

  Run: `cat README.md`

- [ ] **Step 2: Add a "Git hooks" section**

  Insert a new section near the top or after the existing setup section.
  Example content:

  ````markdown
  ## Git hooks

  This repository's hooks are available as pre-commit hooks.

  Add them to another project:

  1. Install pre-commit:

     ```bash
     uv add --group dev pre-commit
     ```
  ````

  2. Add to `.pre-commit-config.yaml`:

     ```yaml
     ---
     repos:
       - repo: https://github.com/xenoterracide/subtree-share
         rev: vX.Y.Z
         hooks:
           - id: share-commit-msg
           - id: share-pre-commit
           - id: share-post-checkout
           - id: share-post-merge
     ```

  3. Install the hooks:

     ```bash
     pre-commit install \
       --hook-type commit-msg \
       --hook-type pre-commit \
       --hook-type post-checkout \
       --hook-type post-merge
     ```

  For local development of this repository, run `yarn contribute` to configure
  `core.hooksPath` to `git/hooks`.

  ```

  ```

- [ ] **Step 3: Validate formatting**

  Run: `yarn prettier --check README.md`

  Expected: `All matched files use Prettier code style.`

- [ ] **Step 4: Verify REUSE compliance**

  Run: `yarn lint:reuse`

  Expected: compliant.

- [ ] **Step 5: Commit**

  ```bash
  git add README.md
  git commit -m "docs(readme): document pre-commit hook consumption

  - Add Git hooks section with consumer setup steps
  - Keep local yarn contribute workflow documented

  Assisted-by: Kimi:kimi-code-cli"
  ```

---

### Task 3: Update `CONTRIBUTING.md` and `AGENTS.md`

**Files:**

- Modify: `CONTRIBUTING.md`
- Modify: `AGENTS.md`

**Interfaces:**

- Consumes: `.pre-commit-hooks.yaml` from Task 1, README section from Task 2.
- Produces: contributor-facing docs mentioning pre-commit distribution.

- [ ] **Step 1: Update `CONTRIBUTING.md`**

  Find the Git hooks bullet. Append or update:

  ```markdown
  Hooks are also published for consumption via pre-commit. See
  `.pre-commit-hooks.yaml` and `README.md` for details.
  ```

- [ ] **Step 2: Update `AGENTS.md`**

  Find the Git hooks / `yarn contribute` section. Add a sentence:

  ```markdown
  The hooks can also be consumed as a pre-commit source from another repository.
  See `README.md` for the consumer workflow.
  ```

- [ ] **Step 3: Validate formatting**

  Run: `yarn prettier --check CONTRIBUTING.md AGENTS.md`

  Expected: `All matched files use Prettier code style.`

- [ ] **Step 4: Verify REUSE compliance**

  Run: `yarn lint:reuse`

  Expected: compliant.

- [ ] **Step 5: Commit**

  ```bash
  git add CONTRIBUTING.md AGENTS.md
  git commit -m "docs: mention pre-commit distribution in contributor docs

  - Update CONTRIBUTING.md and AGENTS.md with cross-repo hook usage

  Assisted-by: Kimi:kimi-code-cli"
  ```

---

### Task 4: Manual integration check

**Files:**

- None (temporary consumer test repo).

**Interfaces:**

- Consumes: `.pre-commit-hooks.yaml` from Task 1.

- [ ] **Step 1: Create a temporary test repository**

  ```bash
  cd /tmp
  rm -rf precommit-share-test
  mkdir precommit-share-test
  cd precommit-share-test
  git init
  git commit --allow-empty -m "initial"
  ```

- [ ] **Step 2: Initialize uv and add pre-commit**

  ```bash
  uv init
  uv add --group dev pre-commit
  ```

- [ ] **Step 3: Add `.pre-commit-config.yaml`**

  Point `rev` to the current branch commit or `develop` tip. Use the local path
  for deterministic testing if pre-commit supports it, otherwise use the remote
  repo URL with `rev: develop`.

  ```yaml
  ---
  repos:
    - repo: https://github.com/xenoterracide/subtree-share
      rev: develop
      hooks:
        - id: share-commit-msg
        - id: share-pre-commit
        - id: share-post-checkout
        - id: share-post-merge
  ```

- [ ] **Step 4: Install hooks and verify**

  ```bash
  uv run pre-commit install \
    --hook-type commit-msg \
    --hook-type pre-commit \
    --hook-type post-checkout \
    --hook-type post-merge
  ls -la .git/hooks/
  ```

  Expected: `commit-msg`, `pre-commit`, `post-checkout`, `post-merge` hooks
  present and executable.

- [ ] **Step 5: Test commit-msg hook**

  ```bash
  echo "bad message" > /tmp/msg
  uv run pre-commit run --hook-stage commit-msg share-commit-msg --commit-msg-filename /tmp/msg
  ```

  Expected: non-zero exit because the message does not follow conventional
  commits.

- [ ] **Step 6: Clean up**

  ```bash
  cd /home/ai/subtree-share
  rm -rf /tmp/precommit-share-test
  ```

- [ ] **Step 7: Push branch and open PR**

  ```bash
  git push -u origin docs/precommit-hooks-design
  gh pr create --title "feat: distribute git hooks via pre-commit" \
    --body "- Add .pre-commit-hooks.yaml manifest
  - Document cross-repo hook consumption in README.md
  - Update CONTRIBUTING.md and AGENTS.md

  Assisted-by: Kimi:kimi-code-cli" \
    --base develop
  ```

- [ ] **Step 8: Verify required checks pass**

  Run: `gh pr checks --watch --required`

  Expected: `license / check`, `node-cli / check`, `prettier / check` all pass.

---

## Spec Coverage

| Spec requirement                                       | Task                      |
| ------------------------------------------------------ | ------------------------- |
| Add `.pre-commit-hooks.yaml` manifest                  | Task 1                    |
| Map `commit-msg` stage                                 | Task 1                    |
| Map `pre-commit` stage (lint-staged)                   | Task 1                    |
| Map `post-checkout` with `always_run`/`pass_filenames` | Task 1                    |
| Map `post-merge` with `always_run`/`pass_filenames`    | Task 1                    |
| Update `README.md` with consumer workflow              | Task 2                    |
| Update `CONTRIBUTING.md`                               | Task 3                    |
| Update `AGENTS.md`                                     | Task 3                    |
| No `postinstall`                                       | Tasks 1-3 (manifest only) |

## Placeholder Scan

No TBD/TODO/"fill in details"/"appropriate error handling"/"similar to Task N"
patterns present. Every step includes exact file paths, commands, and expected
output.

## Type Consistency

Hook IDs and file paths are consistent across manifest, docs, and test steps.

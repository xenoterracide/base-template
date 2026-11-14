<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Pre-push Lint Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a pre-push git hook that runs `pnpm lint`, with the variant lint sets defined in `package.json`.

**Architecture:** Dumb hook, smart scripts. The hook is one invariant POSIX sh file — policy, not mechanism — rendered identically in every variant. `package.json.jinja` renders the variant lint set: prettier + shellcheck everywhere, eslint on TypeScript, checkstyle + spotbugs through Maven execution ids on java. `verify.sh` exercises the hook on fresh renders.

**Tech Stack:** copier jinja templates, POSIX sh, pnpm scripts, Maven plugin goals, pytest structural tests.

**Spec:** `docs/superpowers/specs/2026-11-14-pre-push-design.md`

## Global Constraints

- Hooks carry inline SPDX headers (MIT, `2026` lineage). lint-staged never annotates `.config/git/hooks/` (excluded in `.lintstagedrc.cjs`), so headers are baked into the source.
- Every text file ends with a newline, including `.jinja` sources, which prettier cannot check.
- prettier `printWidth: 120`; it runs through the pre-commit hook on commit.
- New shell must pass `shfmt` and `shellcheck` (CI runs both over `**/git/hooks/*`).
- No new npm or pypi dependencies; shellcheck stays the asdf pin in `.tool-versions`.
- Script strings are pinned verbatim by tests — copy them exactly.
- Quiet flags: pnpm `--reporter=silent`, uv `--quiet`, Maven `-B -q --no-transfer-progress`, git `--quiet`.
- Commits use types from `git-conventional-commits.yaml` with the `Assisted-by:` trailer.

## Review Focus

- Missing shellcheck binary turns a fresh machine's first push into `command not found`. Heal installs the pin; the render must carry it. — Task 1, `test_tool_versions_pins_shellcheck`.
- A hook that loses its exec bit is silently skipped by git. — Task 2, executable assertion in `test_pre_push_is_the_dumb_hook`.
- Variant drift: any render differing from the authoring hook breaks "one invariant file". — Task 2, byte-identity assertion in the same test.
- spotbugs reads classes, not sources; without `test-compile` first it analyzes nothing on a fresh checkout. — pinned by the `lint:maven` string (Task 1) and proven on a fresh java render by CI's verify job (Task 3).
- `lint` silently regressing to include reuse or tsc makes every push slow again. — Task 1, absence assertions in `test_lint_is_the_pre_push_set`.

---

### Task 1: The pre-push lint set in package.json

**Files:**

- Modify: `package.json.jinja` (scripts block, lines 26–39)
- Modify: `package.json` (authoring scripts block)
- Modify: `AGENTS.md.jinja` (Build and Test lines 11–18)
- Modify: `AGENTS.md` (authoring, line 38)
- Test: `tests/test_render.py`

**Interfaces:**

- Consumes: nothing (first task).
- Produces: the exact script strings later tasks and CI rely on —
  - `lint:shellcheck`: `shellcheck $(git ls-files '*.sh' '.envrc' ':(glob)**/git/hooks/*')`
  - `lint:maven` (java only): `./mvnw -B -q --no-transfer-progress test-compile checkstyle:check@checkstyle-main checkstyle:check@checkstyle-test spotbugs:check@spotbugs-check`
  - `lint`: ts `pnpm lint:eslint && pnpm lint:prettier && pnpm lint:shellcheck`; java `pnpm lint:prettier && pnpm lint:shellcheck && pnpm lint:maven`; config `pnpm lint:prettier && pnpm lint:shellcheck`
  - `check`: ts `pnpm lint && pnpm typecheck && pnpm test`; others `pnpm lint`

- [ ] **Step 1: Write the failing tests** — append to `tests/test_render.py`:

```python
def test_lint_is_the_pre_push_set(generated):
    """lint is what pre-push runs: prettier and shellcheck everywhere,
    eslint on typescript, checkstyle + spotbugs on java. reuse and tsc
    stay CI-owned, so neither belongs in the hook's set."""
    dst, answers = generated
    scripts = json.loads((dst / "package.json").read_text())["scripts"]
    lint = scripts["lint"]
    assert "pnpm lint:prettier" in lint
    assert "pnpm lint:shellcheck" in lint
    assert "lint:reuse" not in lint
    assert "typecheck" not in lint
    if answers["template_type"] == "typescript":
        assert "pnpm lint:eslint" in lint
        assert "lint:maven" not in lint
        assert scripts["check"] == "pnpm lint && pnpm typecheck && pnpm test"
    elif answers["template_type"] == "java":
        assert "pnpm lint:maven" in lint
        assert "lint:eslint" not in lint
        maven = scripts["lint:maven"]
        assert maven.startswith("./mvnw -B -q --no-transfer-progress test-compile ")
        assert "checkstyle:check@checkstyle-main" in maven
        assert "checkstyle:check@checkstyle-test" in maven
        assert "spotbugs:check@spotbugs-check" in maven
        assert scripts["check"] == "pnpm lint"
    else:
        assert "lint:eslint" not in lint
        assert "lint:maven" not in lint
        assert scripts["check"] == "pnpm lint"
    # reuse stays a script; the CI license job owns running it
    assert "pnpm reuse download --all" in scripts["lint:reuse"]


def test_authoring_lint_matches_the_config_variant(generated):
    """The authoring checkout is config-shaped; drift between its lint
    and the config render strands the authoring repo on an old set."""
    dst, answers = generated
    if answers["template_type"] != "config":
        pytest.skip()
    authoring = json.loads((TEMPLATE / "package.json").read_text())["scripts"]
    rendered = json.loads((dst / "package.json").read_text())["scripts"]
    assert authoring["lint"] == rendered["lint"]
    assert authoring["lint:shellcheck"] == rendered["lint:shellcheck"]


def test_tool_versions_pins_shellcheck(generated):
    """lint:shellcheck runs on every push; an unpinned binary turns a
    fresh machine's first push into a missing-tool failure."""
    dst, _ = generated
    assert re.search(r"^shellcheck \d", (dst / ".tool-versions").read_text(), re.M)
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run --group dev pytest tests/test_render.py -q -k "pre_push_set or authoring_lint or pins_shellcheck"`
Expected: 4 FAILs — the old composition has no shellcheck (`test_tool_versions_pins_shellcheck` already passes; the pin exists).

- [ ] **Step 3: Implement the scripts** — `package.json.jinja`, scripts block becomes:

```json
  "scripts": {
    "check": "pnpm lint{% if template_type == 'typescript' %} && pnpm typecheck && pnpm test{% endif %}",
    "contribute": "sh .config/git/hooks/heal.sh",
    "lint:prettier": "prettier --ignore-unknown --cache --check '**'",
    "lint:reuse": "pnpm reuse download --all && pnpm reuse lint",
    "lint:shellcheck": "shellcheck $(git ls-files '*.sh' '.envrc' ':(glob)**/git/hooks/*')",
    "precontribute": "npm run setup:corepack",
    "reuse": "uv run --frozen --group dev reuse",
    "setup:corepack": "npm install --global corepack && mkdir -p ~/.local/bin && corepack enable --install-directory ~/.local/bin"{% if template_type == 'typescript' %},
    "lint:eslint": "eslint .",
    "lint": "pnpm lint:eslint && pnpm lint:prettier && pnpm lint:shellcheck",
    "typecheck": "tsc --noEmit -p tsconfig.eslint.json",
    "test": "vitest run --coverage"{% elif template_type == 'java' %},
    "lint:maven": "./mvnw -B -q --no-transfer-progress test-compile checkstyle:check@checkstyle-main checkstyle:check@checkstyle-test spotbugs:check@spotbugs-check",
    "lint": "pnpm lint:prettier && pnpm lint:shellcheck && pnpm lint:maven"{% else %},
    "lint": "pnpm lint:prettier && pnpm lint:shellcheck"{% endif %}
  }
```

`package.json` (authoring) gains the same `lint:shellcheck` line after `lint:reuse`, and `lint` becomes `"pnpm lint:prettier && pnpm lint:shellcheck"`. `check` stays `"pnpm lint"`.

- [ ] **Step 4: Update the AGENTS Build-and-Test lines**

`AGENTS.md.jinja` lines 11–18 become:

```markdown
- `npm run contribute` — bootstrap tooling (run once after clone)
- `pnpm lint` — the pre-push set: prettier + shellcheck, plus eslint
  (TypeScript) or checkstyle + spotbugs via Maven (java)
- `pnpm check` — run all checks
- `pnpm lint:reuse` — REUSE compliance check (CI's license job owns it){% if template_type == 'java' %}
- `./mvnw -q verify` — Maven build + checkstyle + spotbugs + jacoco + tests{% elif template_type == 'typescript' %}
- `pnpm typecheck` — TypeScript type check
- `pnpm test` — vitest with coverage{% endif %}
```

Authoring `AGENTS.md` line 38 comment becomes `pnpm lint # the pre-push set: prettier + shellcheck`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `uv run --group dev pytest tests/test_render.py -q`
Expected: PASS (all, including pre-existing).

- [ ] **Step 6: Commit**

```bash
git add package.json.jinja package.json AGENTS.md.jinja AGENTS.md tests/test_render.py
git commit -m "feat(scripts): reshape lint into the pre-push set"
```

### Task 2: The hook

**Files:**

- Create: `.config/git/hooks/pre-push.jinja`
- Create: `.config/git/hooks/pre-push` (identical bytes; authoring copy)
- Modify: `tests/test_render.py` (SHARED_FILES, hook lineage map)
- Modify: `CONTRIBUTING.md.jinja`, `CONTRIBUTING.md` (Linting and testing note)

**Interfaces:**

- Consumes: `pnpm lint` from Task 1 (the hook's only command).
- Produces: `.config/git/hooks/pre-push`, byte-identical in every render and in the authoring tree; executable.

- [ ] **Step 1: Write the failing test** — add to `tests/test_render.py`, and add `".config/git/hooks/pre-push",` to `SHARED_FILES` after the `pre-commit` entry and `"pre-push": "2026",` to the lineage dict in `test_hooks_carry_the_consumer_header` (between `post-merge` and `pre-commit`):

```python
def test_pre_push_is_the_dumb_hook(generated):
    """Policy, not mechanism: every variant renders the same hook, and
    it runs exactly the lint script. A hook without its exec bit is
    silently skipped by git, so the bit is part of the contract."""
    dst, _ = generated
    hook = dst / ".config/git/hooks/pre-push"
    assert hook.read_text() == (TEMPLATE / ".config/git/hooks/pre-push").read_text()
    assert "pnpm lint" in hook.read_text()
    assert hook.stat().st_mode & stat.S_IXUSR
```

- [ ] **Step 2: Run to verify it fails**

Run: `uv run --group dev pytest tests/test_render.py -q -k "pre_push or shared_files or consumer_header"`
Expected: 9 FAILs — no hook in renders (3 per test across the three variants).

- [ ] **Step 3: Create the hook pair** — both files, identical bytes, executable (`chmod +x`), final newline:

```sh
#!/bin/sh

# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: MIT
[ -n "$CI" ] && exit 0

set -e
pnpm lint
```

- [ ] **Step 4: Check the hook locally**

Run: `shfmt --diff .config/git/hooks/pre-push && shellcheck .config/git/hooks/pre-push`
Expected: no output, exit 0.

- [ ] **Step 5: Add the CONTRIBUTING note** — in both `CONTRIBUTING.md.jinja` and `CONTRIBUTING.md`, under `## Linting and testing` after the `pnpm check` line:

```markdown
`git push` runs `pnpm lint` first (pre-push hook); `git push --no-verify`
bypasses it.
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `uv run --group dev pytest tests/test_render.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .config/git/hooks/pre-push .config/git/hooks/pre-push.jinja tests/test_render.py CONTRIBUTING.md CONTRIBUTING.md.jinja
git commit -m "feat(hooks): add the pre-push lint hook"
```

### Task 3: verify.sh exercises the hook

**Files:**

- Create: `tests/install-shellcheck.sh` (mirror of `tests/install-shfmt.sh`)
- Modify: `tests/verify.sh`

**Interfaces:**

- Consumes: the rendered `.config/git/hooks/pre-push` (Task 2) and `lint:shellcheck` (Task 1); the install pattern from `tests/install-shfmt.sh`.
- Produces: a fresh render whose pre-push hook runs green under `CI=''` in the verify job.

- [ ] **Step 1: Create `tests/install-shellcheck.sh`** — same shape as `install-shfmt.sh`: no-op when `command -v shellcheck` succeeds; else read the `.tool-versions` pin, map `uname -m` (`x86_64`→`x86_64`, `aarch64`→`aarch64`), fetch `https://github.com/koalaman/shellcheck/releases/download/v${version}/shellcheck-v${version}.linux.${arch}.tar.xz` into a `mktemp -d` (trap EXIT cleanup), extract with `tar -xJ`, move the binary to `$HOME/.local/bin`, `chmod +x`. SPDX header (MIT, 2026), final newline, `chmod +x` the script.

- [ ] **Step 2: Wire it and the hook into `tests/verify.sh`**

After the `install-shfmt.sh` call, add `$(dirname "$0")/install-shellcheck.sh`. Before the final `echo "All $VARIANT checks passed."`, add:

```sh
echo "Running the pre-push hook..."
# CI='' simulates a developer push: the hook's guard skips a real CI=true
CI='' sh .config/git/hooks/pre-push
```

- [ ] **Step 3: Check the script locally**

Run: `shfmt --diff tests/install-shellcheck.sh && shellcheck tests/install-shellcheck.sh tests/verify.sh`
Expected: no output, exit 0.

- [ ] **Step 4: Run the config variant end-to-end**

Run: `./tests/verify.sh config` (background, output to a `/tmp/opencode` log)
Expected: ends with `All config checks passed.` — the pre-push step runs prettier + shellcheck on the fresh render.

- [ ] **Step 5: Commit**

```bash
git add tests/install-shellcheck.sh tests/verify.sh
git commit -m "test(verify): exercise the pre-push hook in renders"
```

Note: java and typescript renders are exercised by CI's verify matrix. If verify (java) outgrows the copier workflow's 5-minute timeout from the second Maven pass, the timeout bump lives in the `github` repo's `copier.yml` — a human task (agent tokens lack workflow scope).

<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# ESLint Metrics Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror the java variant's Checkstyle Metrics section in the typescript variant's eslint config, at the family's thresholds, with a render test pinning every value.

**Architecture:** Eight rules join the existing typescript config block in `eslint.config.cts.jinja`; six come from ESLint core, two from a new `eslint-plugin-sonarjs` devDependency imported through the same CJS default-unwrap guard the `@eslint/json` plugin uses. `tests/test_render.py` gains two render tests asserting the exact option spellings; `tests/verify.sh typescript` proves the config loads and lint runs end to end.

**Tech Stack:** copier jinja templates, ESLint 10 flat config, typescript-eslint 8, pytest render tests, pnpm, uv.

**Spec:** `docs/superpowers/specs/2026-11-11-eslint-metrics-parity-design.md`

## Global Constraints

- Thresholds verbatim from the spec's mapping table: `complexity` `["error", 10]`; `max-statements` `["error", 20, { ignoreTopLevelFunctions: false }]`; `max-lines-per-function` `["error", { max: 25 }]`; `max-depth` `["error", 3]`; `max-classes-per-file` `"error"`; `max-lines` `"error"`; `sonarjs/cognitive-complexity` `"error"`; `sonarjs/expression-complexity` `["error", { max: 3 }]` — the object form its schema requires; eslint 10 rejects the bare number.
- No rule is turned off anywhere; `test_eslint_disables_only_twin_base_rules` must stay green.
- The config file's exact name is `{% if template_type == 'typescript' %}eslint.config.cts{% endif %}.jinja`.
- DevDependencies are caret floors (`^4.2.2`); Renovate owns the bumps, so no test may pin the plugin to an exact version.
- Prettier printWidth 120; every file ends with a newline, `.jinja` sources included (prettier cannot check them; renders are checked by `verify.sh`).
- Command hygiene: uv uses `--group dev` and `-q`; pnpm uses `--reporter=silent`.
- Commits follow `git-conventional-commits.yaml` types with prose bodies and the `Assisted-by:` trailer.

## Review Focus

1. A broken plugin import or missing devDep crashes generated-project lint at config load — Task 4's `verify.sh typescript` installs and runs the real thing.
2. A rule id the plugin does not register crashes eslint when a `.ts` file is linted — same e2e run resolves rule ids at lint time.
3. Renovate bumps the plugin version and an exact-version assert would strand every dep PR — Task 3's test asserts a caret floor, never equality.
4. Metrics landing in the base js block would gate `.cjs`/`.mjs` consumer files — Task 2's test asserts every metric key sits after the `strictTypeChecked` extends line.
5. A hand edit that prettier would reformat fails `verify.sh`'s `lint:prettier` step on the render — Task 4 surfaces it; keep inserted lines within printWidth 120.

---

### Task 1: Branch and docs commit

**Files:**

- Modify: none (the design doc already exists: `docs/superpowers/specs/2026-11-11-eslint-metrics-parity-design.md`; this plan is new)

**Interfaces:**

- Produces: branch `feat/eslint-metrics-parity` with the design and plan committed, so Tasks 2–4 land on top of a reviewed base.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/eslint-metrics-parity
```

- [ ] **Step 2: Commit the design and plan**

```bash
git add docs/superpowers/specs/2026-11-11-eslint-metrics-parity-design.md docs/superpowers/plans/2026-11-11-eslint-metrics-parity.md
git commit -F - <<'EOF'
docs: add the eslint metrics parity design

The design mirrors the java variant's checkstyle metrics in the
typescript variant's eslint config: six core rules at the family
values, sonarjs for the two metrics no core rule implements, and a
render test pinning every threshold.

Assisted-by: GLM:glm-5.3
EOF
```

### Task 2: Core metrics render test and rules

**Files:**

- Modify: `tests/test_render.py` (after `test_eslint_disables_only_twin_base_rules`, ~line 331)
- Modify: `{% if template_type == 'typescript' %}eslint.config.cts{% endif %}.jinja` (rules block, after the `"@typescript-eslint/prefer-destructuring"` twin pair, before `"@typescript-eslint/consistent-type-exports"`)

**Interfaces:**

- Produces: a rules block ending with `"max-statements": ["error", 20, { ignoreTopLevelFunctions: false }],` — Task 3 appends the sonarjs lines after it.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_render.py`:

```python
def test_eslint_carries_the_family_metrics(generated):
    """The family's metric thresholds, pinned like the checkstyle maxima;
    a render flattened those once."""
    dst, answers = generated
    if answers["template_type"] != "typescript":
        pytest.skip()
    text = (dst / "eslint.config.cts").read_text()
    metrics = {
        "complexity": r'"complexity": \["error", 10\]',
        "max-classes-per-file": r'"max-classes-per-file": "error"',
        "max-depth": r'"max-depth": \["error", 3\]',
        "max-lines": r'"max-lines": "error"',
        "max-lines-per-function": r'"max-lines-per-function": \["error", \{ max: 25 \}\]',
        "max-statements": r'"max-statements": \["error", 20, \{ ignoreTopLevelFunctions: false \}\]',
    }
    for rule, pattern in metrics.items():
        assert re.search(pattern, text), f"{rule}: not on at the family value"
    ts_block = text.index("strictTypeChecked")
    for rule in metrics:
        assert text.index(rule) > ts_block, f"{rule} lives outside the typescript block"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `uv run --group dev pytest "tests/test_render.py::test_eslint_carries_the_family_metrics" -q`
Expected: FAIL — `AssertionError: complexity: not on at the family value`

- [ ] **Step 3: Add the six core rules**

Insert into the rules block of `{% if template_type == 'typescript' %}eslint.config.cts{% endif %}.jinja`, after the `"@typescript-eslint/prefer-destructuring": "error",` line:

```ts
      "complexity": ["error", 10],
      "max-classes-per-file": "error",
      "max-depth": ["error", 3],
      "max-lines": "error",
      "max-lines-per-function": ["error", { max: 25 }],
      "max-statements": ["error", 20, { ignoreTopLevelFunctions: false }],
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run --group dev pytest "tests/test_render.py::test_eslint_carries_the_family_metrics" -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "{% if template_type == 'typescript' %}eslint.config.cts{% endif %}.jinja" tests/test_render.py
git commit -F - <<'EOF'
feat(eslint): carry the family's core metrics

Checkstyle's Metrics and Size sections already hold the java variant
to the family thresholds; the typescript variant had no complexity
gate at all. Six core rules mirror the mappable ones — cyclomatic 10,
statement budget 20, method length 25, depth 3, file backstop 300, one
class per file. Option values are written where they leave the tool
default, and module-scope functions count, since they are the js
analog of java methods.

Assisted-by: GLM:glm-5.3
EOF
```

### Task 3: Sonarjs parity rules and devDependency

**Files:**

- Modify: `tests/test_render.py` (after the Task 2 test)
- Modify: `package.json.jinja` (typescript devDependencies, after `"eslint": "^10.0.0",`)
- Modify: `{% if template_type == 'typescript' %}eslint.config.cts{% endif %}.jinja` (imports, the plugin const, the typescript block's plugins, the rules)

**Interfaces:**

- Consumes: the rules block from Task 2 ending in `"max-statements"`.
- Produces: plugin const named `sonarjs`, registered `plugins: { sonarjs }` in the typescript block, and two rules `"sonarjs/cognitive-complexity"` and `"sonarjs/expression-complexity"`.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_render.py`:

```python
def test_eslint_carries_the_sonarjs_parity_rules(generated):
    """NPath and BooleanExpressionComplexity exist only in sonarjs; the
    config enables the two parity rules by exception, never the plugin's
    preset, and the plugin stays a caret floor for renovate to bump."""
    dst, answers = generated
    if answers["template_type"] != "typescript":
        pytest.skip()
    text = (dst / "eslint.config.cts").read_text()
    assert '"sonarjs/cognitive-complexity": "error"' in text
    assert re.search(r'"sonarjs/expression-complexity": \["error", \{ max: 3 \}\]', text)
    assert "sonarjs.configs" not in text
    dev_deps = json.loads((dst / "package.json").read_text())["devDependencies"]
    assert "eslint-plugin-sonarjs" in dev_deps
    assert re.fullmatch(r"\^\d+\.\d+\.\d+", dev_deps["eslint-plugin-sonarjs"])
```

- [ ] **Step 2: Run it to verify it fails**

Run: `uv run --group dev pytest "tests/test_render.py::test_eslint_carries_the_sonarjs_parity_rules" -q`
Expected: FAIL — `AssertionError` on the cognitive-complexity assert

- [ ] **Step 3: Add the dependency to `package.json.jinja`**

In the typescript-gated devDependencies block, after `"eslint": "^10.0.0",`:

```json
    "eslint-plugin-sonarjs": "^4.2.2",
```

- [ ] **Step 4: Wire the plugin and rules in the eslint config**

In `{% if template_type == 'typescript' %}eslint.config.cts{% endif %}.jinja`:

After `import markdown from "@eslint/markdown";`:

```ts
import sonarImport from "eslint-plugin-sonarjs";
```

After the `jsonPlugin` const line, mirroring its default-unwrap guard:

```ts
const sonarjs = (sonarImport as { default?: typeof sonarImport }).default ?? sonarImport;
```

In the typescript block, after the `languageOptions` closing brace and before `rules: {`:

```ts
    plugins: { sonarjs },
```

In the rules block, after `"max-statements": ["error", 20, { ignoreTopLevelFunctions: false }],`:

```ts
      "sonarjs/cognitive-complexity": "error",
      "sonarjs/expression-complexity": ["error", { max: 3 }],
```

Executed deviation: eslint 10's config validator rejected the plan's original `["error", 3]` spelling — the rule's schema takes `{ max: n }` — surfaced by Task 4's typescript e2e; the branch carries the object form, matching this snippet.

- [ ] **Step 5: Run the test to verify it passes**

Run: `uv run --group dev pytest "tests/test_render.py::test_eslint_carries_the_sonarjs_parity_rules" -q`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "{% if template_type == 'typescript' %}eslint.config.cts{% endif %}.jinja" package.json.jinja tests/test_render.py
git commit -F - <<'EOF'
feat(eslint): carry the family's sonarjs metrics

NPathComplexity and BooleanExpressionComplexity have no core eslint
rule; sonarjs carries their successors. Enable the two parity rules
only — cognitive-complexity at sonar's documented default 15,
expression-complexity at the family's 3 — never the plugin's preset.
The plugin rides the typescript devDependencies as a caret floor,
under renovate's release cooldown.

Assisted-by: GLM:glm-5.3
EOF
```

### Task 4: End-to-end verification

**Files:**

- Modify: none expected; fix-ups amend the owning commit.

**Interfaces:**

- Consumes: the full branch state from Tasks 1–3.

- [ ] **Step 1: Run the whole render suite**

Run: `uv run --group dev pytest tests/ -q`
Expected: all PASS

- [ ] **Step 2: Run the typescript end-to-end check**

Run: `./tests/verify.sh typescript`
Expected: "All typescript checks passed." — proves the render installs the plugin, eslint loads the config, and prettier accepts the rendered files.

- [ ] **Step 3: Run the authoring checks**

Run: `pnpm lint`
Expected: prettier and REUSE both pass.

- [ ] **Step 4: Check the branch state**

Run: `git status --porcelain` and `git log --oneline -5`
Expected: clean tree; the docs, core-metrics, and sonarjs-metrics commits on top of `develop` — plus any fix-up commits Task 4 required, each amending its owning change's intent, never papering over a failure.

---

Execution ends here; the PR follows the git-workflow skill, and merging stays with the operator.

<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Copier Cooldown Exemption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exempt the copier manager from the 3-day release-age hold in the rendered renovate config, pinned by a render test.

**Architecture:** One rule gains one field in `.github/renovate.json5.jinja`; one new render test pins it. The authoring copy and every other datasource are untouched.

**Tech Stack:** copier jinja template, pytest render tests, git-conventional-commits, gh.

**Spec:** `docs/superpowers/specs/2026-11-11-copier-cooldown-exemption-design.md`

## Global Constraints

- The copier rule block stays a single block carrying both rulings — `automerge: true` and `minimumReleaseAge: null` — with `matchManagers: ["copier"]` first and `automerge` immediately after, so the existing render-test regex keeps matching.
- No `}` may appear inside the inserted comment lines; the new test bounds its search with `[^}]*`.
- The authoring `.github/renovate.json5` is untouched — render-only ruling per the twin pattern.
- Command hygiene: uv `--group dev -q`, pnpm `--reporter=silent`, commit messages per `git-conventional-commits.yaml` with the `Assisted-by:` trailer.

## Review Focus

1. The exemption landing in the authoring copy would semantically no-op but drift the twins — Task 1's test reads the rendered copy only, and Task 2's authoring lint does not touch it; verify the authoring file is byte-identical to `develop`.
2. The exemption spilling to `copyright-year` — the new test bounds its regex to the copier block's closing brace.
3. Prettier reformatting the json5 renders — Task 2 runs the authoring prettier check, and `verify.sh config` exercises a full render's lint if run.
4. Deployed consumers keep the old hold until their next template update — design caveat, no test; lands in the PR body so no reader mistakes the exemption's reach.

---

### Task 1: Copier exemption rule and render test

**Files:**

- Modify: `tests/test_render.py` (after `test_renovate_copier_updates_automerge_when_checks_pass`)
- Modify: `.github/renovate.json5.jinja` (the copier package rule, lines 78–85)

**Interfaces:**

- Produces: a copier rule block reading `matchManagers: ["copier"]`, `automerge: true`, one comment, then `minimumReleaseAge: null`.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_render.py`:

```python
def test_renovate_exempts_copier_from_the_release_age_cooldown(generated):
    """The template is first-party code tagged behind the authoring
    suite; the hijack window the cooldown buys third-party packages
    cannot happen to the holder's own tags, and the hold delayed every
    consumer by three days after each release."""
    dst, generated_answers = generated, None
    if generated is not None:
        dst, answers = generated
        if answers["template_type"] == "config":
            pass
    content = (dst / ".github/renovate.json5").read_text()
    assert re.search(
        r'matchManagers: \["copier"\],[^}]*minimumReleaseAge: null', content, re.S
    ), "copier updates still age under the supply-chain cooldown"
```

(The body above is a sketch — write the real one following the neighboring tests' exact form: skip non-applicable variants like the sibling renovate tests do — the rule renders for every variant.)

- [ ] **Step 2: Run it to verify it fails**

Run: `uv run --group dev pytest "tests/test_render.py::test_renovate_exempts_copier_from_the_release_age_cooldown" -q`
Expected: FAIL — `AssertionError: copier updates still age under the supply-chain cooldown`

- [ ] **Step 3: Add the exemption to the copier rule**

In `.github/renovate.json5.jinja`, change the copier block to:

```json5
    {
      // A conflicted copier update leaves `.rej` files, which fail
      // `lint:reuse`; green checks mean the update landed cleanly, so it
      // can automerge. No enable flag is needed: `copier.yml` carries no
      // `_tasks`, so the hosted app can update without `--trust`.
      matchManagers: ["copier"],
      automerge: true,
      // the template is first-party code, tagged behind the authoring
      // suite; the hold exists for the registry-hijack window
      minimumReleaseAge: null,
    },
```

- [ ] **Step 4: Commit, then run the test to verify it passes**

Commit first — conftest renders `vcs_ref="HEAD"`:

```bash
git add .github/renovate.json5.jinja tests/test_render.py
git commit -F - <<'EOF'
feat(renovate)!: exempt copier updates from the release-age hold

The only dep copier tracks is the family's own template, tagged
behind the authoring suite; the hijack window the three-day hold
buys is a third-party supply-chain window. As shipped, every
release parked all consumers for three days.

Assisted-by: GLM:glm-5.3
EOF
```

(`!`? No — the hold is a lubricant change, not a break from the consumer contract; type `feat`, no bang.)

Run: `uv run --group dev pytest "tests/test_render.py::test_renovate_exempts_copier_from_the_release_age_cooldown" -q`
Expected: PASS

### Task 2: Verification and branch state

- [ ] **Step 1: Run the whole render suite**

Run: `uv run --group dev pytest tests/ -q`
Expected: all PASS — including `test_renovate_copier_updates_automerge_when_checks_pass` and the cooldown-match test against the authoring twin.

- [ ] **Step 2: Run the authoring checks**

Run: `pnpm lint`
Expected: prettier and REUSE pass.

- [ ] **Step 3: Confirm the authoring twin is untouched**

Run: `git diff develop -- .github/renovate.json5`
Expected: no output — render-only ruling.

- [ ] **Step 4: Whole-branch fresh review, then PR per git-workflow**

Execution ends at the PR; merging stays with the operator.

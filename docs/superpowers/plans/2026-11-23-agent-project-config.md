<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Agent Project Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the authoring checkout and every generated project the `.config/agent/project.yaml` file that `jira-workflow` requires.

**Architecture:** The authoring file carries `repo: base-template`. The `.jinja` source carries `repo: {{ project_name }}`. Both copy the XTC tracker block from `agent-skills` verbatim. Copier owns the generated file, so updates can carry tracker changes.

**Tech Stack:** Copier, Jinja, YAML, pytest render tests.

**Spec:** `docs/superpowers/specs/2026-11-23-agent-project-config-design.md`

## Global Constraints

- Copy the XTC tracker block from `agent-skills` verbatim. Do not change status or transition ids.
- `repo` is the only generated value. The template uses `{{ project_name }}`.
- The authoring file uses `repo: base-template`.
- The CC0-1.0 SPDX header and schema comment match `agent-skills`.
- Do not add Copier answers or change `_skip_if_exists`.
- Split SPDX tags inside Python test strings so REUSE does not read them as expressions.

## Review Focus

- Custom `project_name`: the rendered `repo` must match the answer. Task 1, `test_agent_project_config_matches_authoring`.
- Hosted update: the config must regenerate, not stay consumer-owned. Task 1, existing `test_copier_skips_consumer_version_files` pins the skip list.
- Authoring checkout: the file must exist before any Jira work. Task 1, `.config/agent/project.yaml` in `SHARED_FILES` and the header test.
- License tooling: the template's SPDX tags must not break REUSE. Task 1, split-tag assertions in `test_agent_project_config_carries_header`.
- Agent discovery: both `AGENTS.md` files must name the config. Task 2, pointer tests.

---

### Task 1: Add the project config files

**Files:**

- Create: `.config/agent/project.yaml`
- Create: `.config/agent/project.yaml.jinja`
- Modify: `tests/test_render.py:18-43`
- Test: `tests/test_render.py`

**Interfaces:**

- Consumes: `TEMPLATE` and `generated` from `tests/conftest.py`.
- Produces: `.config/agent/project.yaml` in every render; `.config/agent/project.yaml.jinja` as its source.

- [ ] **Step 1: Write the failing tests**

Add `".config/agent/project.yaml",` to `SHARED_FILES` after `"AGENTS.md",`.

Add these tests after `test_shared_files_present`:

```python
def test_agent_project_config_matches_authoring(generated):
    """The generated config differs from the authoring copy only in repo."""
    dst, answers = generated
    rendered = (dst / ".config/agent/project.yaml").read_text()
    authoring = (TEMPLATE / ".config/agent/project.yaml").read_text()
    expected = authoring.replace(
        "repo: base-template", f"repo: {answers['project_name']}", 1
    )
    assert rendered == expected
    assert "{{" not in rendered
    assert "{%" not in rendered


def test_agent_project_config_template_uses_project_name():
    source = (TEMPLATE / ".config/agent/project.yaml.jinja").read_text()
    assert "repo: {{ project_name }}" in source


def test_agent_project_config_carries_header(generated):
    dst, _ = generated
    text = (dst / ".config/agent/project.yaml").read_text()
    copyright_line = "# SPDX-FileCopyright" + "Text: Copyright © 2026 Caleb Cushing"
    license_line = "# SPDX-License" + "-Identifier: CC0-1.0"
    assert text.startswith(copyright_line + "\n")
    assert license_line in text
    assert (
        "# yaml-language-server: $schema=https://raw.githubusercontent.com/"
        "xenoterracide/agent-skills/develop/schemas/project.schema.json"
    ) in text


def test_agent_project_config_uses_shared_xtc_tracker():
    text = (TEMPLATE / ".config/agent/project.yaml").read_text()
    for line in (
        "  kind: jira",
        "  skill: jira-workflow",
        "  site: xenoterracide.atlassian.net",
        "  project: XTC",
        "  board: 3",
        '    project_prefix: "project:"',
        "    captured: Added to backlog",
        "    dropped: Canceled",
        "    reviewing_to_done: 41",
        "    dropped_to_captured: 8",
    ):
        assert line in text
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --group dev pytest tests/test_render.py -q -k 'agent_project_config or shared_files_present'`
Expected: FAIL on missing `.config/agent/project.yaml`.

- [ ] **Step 3: Create both config files**

Write this content to `.config/agent/project.yaml`, keeping `repo: base-template`:

<!-- REUSE-IgnoreStart -->

```yaml
# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: CC0-1.0

# yaml-language-server: $schema=https://raw.githubusercontent.com/xenoterracide/agent-skills/develop/schemas/project.schema.json
repo: base-template

tracker:
  kind: jira
  skill: jira-workflow
  site: xenoterracide.atlassian.net
  project: XTC
  board: 3
  work_types: [Epic, Feature, Task, Bug, Subtask]
  labels:
    project_prefix: "project:"
  statuses:
    captured: Added to backlog
    refining: Open
    ready: To Do
    building: In Progress
    reviewing: In Review
    done: Done
    dropped: Canceled
  transitions:
    captured_to_refining: 9
    captured_to_ready: 11
    captured_to_captured: 8
    captured_to_dropped: 2
    refining_to_ready: 11
    refining_to_captured: 8
    refining_to_dropped: 2
    ready_to_building: 21
    ready_to_captured: 8
    ready_to_dropped: 2
    building_to_reviewing: 31
    building_to_ready: 11
    building_to_dropped: 2
    reviewing_to_done: 41
    reviewing_to_building: 21
    reviewing_to_dropped: 2
    done_to_refining: 9
    dropped_to_captured: 8
```

<!-- REUSE-IgnoreEnd -->

Write the same content to `.config/agent/project.yaml.jinja`, changing only the `repo` line to `repo: {{ project_name }}`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run --group dev pytest tests/test_render.py -q -k 'agent_project_config or shared_files_present'`
Expected: PASS for all three variants.

- [ ] **Step 5: Commit**

```bash
git add .config/agent/project.yaml .config/agent/project.yaml.jinja tests/test_render.py
git commit -m "feat(template): add agent project config

Give the authoring checkout and each render the tracker config
required by jira-workflow. Copy the shared XTC block from
agent-skills and render only the repository name.

Assisted-by: Big Pickle:big-pickle"
```

### Task 2: Point AGENTS.md at the config

**Files:**

- Modify: `AGENTS.md`
- Modify: `AGENTS.md.jinja`
- Test: `tests/test_render.py`

**Interfaces:**

- Consumes: `.config/agent/project.yaml` from Task 1.
- Produces: an `AGENTS.md` pointer in the authoring tree and every render.

- [ ] **Step 1: Write the failing tests**

Add these tests after `test_agent_project_config_uses_shared_xtc_tracker`:

```python
def test_agents_points_at_project_config(generated):
    dst, _ = generated
    text = (dst / "AGENTS.md").read_text()
    assert ".config/agent/project.yaml" in text
    assert "tracker facts" in text


def test_authoring_agents_points_at_project_config():
    text = (TEMPLATE / "AGENTS.md").read_text()
    assert ".config/agent/project.yaml" in text
    assert "tracker facts" in text
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --group dev pytest tests/test_render.py -q -k 'agents_points_at_project_config'`
Expected: FAIL on both tests.

- [ ] **Step 3: Add the pointer lines**

In `AGENTS.md`, add this row to the Source of Truth table after the Git hooks row:

```markdown
| Agent project config | `.config/agent/project.yaml` — tracker facts |
```

In `AGENTS.md.jinja`, add this bullet to the Source of Truth list after the Answers bullet:

```markdown
- Agent project config: `.config/agent/project.yaml` — tracker facts for agent workflows.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run --group dev pytest tests/test_render.py -q -k 'agents_points_at_project_config'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md AGENTS.md.jinja tests/test_render.py
git commit -m "docs(template): point AGENTS.md at project config

Name the tracker facts file in the authoring guide and every
generated guide.

Assisted-by: Big Pickle:big-pickle"
```

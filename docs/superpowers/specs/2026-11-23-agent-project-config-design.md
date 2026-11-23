<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Agent Project Config Design

## Intent

`jira-workflow` reads `.config/agent/project.yaml` and stops when the file is
missing. `base-template` has no such file, so Jira work in this repository is
blocked. Downstream repositories need the same tracker facts to use the skill.

## Goals

- Add `.config/agent/project.yaml` for the authoring checkout. Set `repo` to
  `base-template`.
- Add `.config/agent/project.yaml.jinja` for generated projects. Render `repo`
  from the existing `project_name` answer.
- Copy the XTC tracker block from `agent-skills` verbatim. Do not add Copier
  answers for tracker facts.
- Point `AGENTS.md` and `AGENTS.md.jinja` at the config file.
- Assert the rendered config, the authoring config, and their parity in tests.

## Non-goals

- Do not copy `schemas/project.schema.json` into this repository.
- Do not add or update Jira issues.
- Do not change the tracker facts or transition ids.
- Do not seed the config with `_skip_if_exists`; Copier owns updates, as it does
  for hooks.

## Constraints

- The config uses the CC0-1.0 SPDX header and schema comment from
  `agent-skills`.
- `project_name` is the repository slug. It is the only generated value.
- `.jinja` sources are already annotated CC0-1.0 in `REUSE.toml`.
- All downstream repositories currently share XTC board `3` and the same status
  and transition ids.

## Approaches

**Fixed tracker, templated repo name (chosen).** Copy the XTC block from
`agent-skills` and render only `repo`. This keeps the answer surface small and
matches the family convention. All current consumers share the same tracker.

**Answer-driven tracker.** Add Copier questions for site, project key, board,
statuses, and transition ids. This allows divergence. It adds many answers,
noisy hosted updates, and a risk of drift from the schema. Rejected.

**Template only.** Leave the authoring checkout without a config. Rejected:
Jira work here would stay blocked.

## Decisions

- The authoring config and the template carry identical tracker blocks.
- The template line is `repo: {{ project_name }}`.
- The authoring line is `repo: base-template`.
- The `AGENTS.md` pointer names `.config/agent/project.yaml` as the source of
  tracker facts for agent workflows.

## Verification

- Render all three variants. Assert each has `.config/agent/project.yaml`.
- Assert `repo` equals the answered `project_name`.
- Assert each tracker block equals the authoring block.
- Assert the rendered config has no Jinja syntax.
- Assert the authoring and generated `AGENTS.md` carry the pointer.
- Rely on pre-push hooks and CI for formatting and REUSE compliance.

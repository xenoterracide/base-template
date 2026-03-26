---
name: commit-message
description: When you need to describe what code changes do - whether for a commit message or PR description. Reads the actual git diff to generate proper conventional commit format with type, scope, and summary. Use when writing commit messages, creating PR descriptions, or summarizing changes.
# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: CC-BY-NC-SA-4.0
---

## Instructions

- Use for PR's or commit message's
- this is a git conventional commit format
  - review `git-conventional-commits.yaml` values in `convention.commitTypes` for `<type>`'s available
- the git subject line becomes the PR title
- You MUST follow the exact template

## Rules

- Output plain text only. No markdown fences.
- First line MUST be a valid Conventional Commit subject.
- Keep the FIRST line <= 72 characters.
- Use a specific scope when possible.
- Body (MANDATORY - must explain WHY):
  - Start with a paragraph explaining WHY this change is being made
    - The "why" provides context for future readers
    - Explain the problem, motivation, or rationale
  - Follow with bullet points explaining the main changes (WHAT)
  - Each bullet must describe one complete logical change
  - Do not split a single idea across multiple bullets
  - Wrap lines to <= 72 chars

## Template

<type>(<scope>): <summary>

<body>

## AI Attribution

Add a Co-authored-by trailer at the end of the commit message body (after the description, before any footer markers like `BREAKING CHANGE:`):

```
Co-authored-by: <AI_NAME> <AI_NOREPLY_EMAIL>
```

Use your AI identity:

| AI Name | `AI_NAME`        | `AI_NOREPLY_EMAIL`           |
| ------- | ---------------- | ---------------------------- |
| Kimi    | `Kimi`           | `kimi@moonshot.localhost`    |
| Copilot | `GitHub Copilot` | `copilot@github.localhost`   |
| Claude  | `Claude`         | `claude@anthropic.localhost` |

---

SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0

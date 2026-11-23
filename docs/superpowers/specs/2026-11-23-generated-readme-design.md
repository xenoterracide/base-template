<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Generated README Design

## Intent

The generated README reads like a template contributor's checklist. It lists
bootstrap commands, staged workflows, Maven verification, and template updates.
A generated project's reader needs the project's purpose, use, install steps,
and licensing. Contributor work belongs in `CONTRIBUTING.md`.

## Approaches

- **Answer-driven README.** Ask for purpose and use. Derive install from
  existing coordinates. Chosen.
- **Editable placeholders.** Render empty sections for humans to fill. Every
  new project ships an incomplete README. Rejected.
- **Type-derived prose.** Generate all prose from `template_type`. The purpose
  stays generic. Rejected.

Copyright mirrors the README's SPDX header. A copyright answer would split the
human text from the REUSE comment in every template file.

## Decisions

Add `project_purpose`, `project_usage`, and `project_kind` answers. Purpose and
use take multiline input. Their defaults derive from earlier answers.
`project_kind` splits library from CLI on Java and TypeScript. Config ignores
it.

Render these README sections: title and purpose, use, install, development
links, license. Use comes first. The reader needs the payoff before setup.

Java library install shows Maven and Gradle coordinates. The Gradle line uses
double quotes and parentheses, so Kotlin and Groovy DSL both accept it. Keep
the Gradle block even where a project later drops Gradle; its consumers still
use it. Java CLI install points to the release jar. TypeScript library install
uses pnpm. TypeScript CLI install shows global npm and pnpm commands. Config
install tells readers to copy the files.

State the answered project license and its URL. State the README's own
CC-BY-NC-SA-4.0 license and the fixed copyright line from its SPDX header. Link
to `LICENSES`.

Move bootstrap, direnv, staged workflows, Maven verification, and Copier
updates into `CONTRIBUTING.md`. Leave agent commands in `AGENTS.md`.

Update render tests for the new answers, the README sections, the artifact
kinds, and the moved contributor content.

## Non-goals

- Fixture and integration-test instructions in the README.
- A copyright-holder answer or edits to other SPDX headers.
- Changes to the Copier update flow or staged workflows.

## Verification

Render all three variants and both artifact kinds. Assert purpose, use,
install coordinates, license, copyright, and both development links in each
README. Assert Use precedes Install. Assert no bootstrap, Renovate, Copier, or
workflow text in the README. Assert that text in `CONTRIBUTING.md`. Simulate a
hosted update from a template without the new answers. Use `skip_answered` and
`defaults`, then assert the new answers land with direction-free prose.

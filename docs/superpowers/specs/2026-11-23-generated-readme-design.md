<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Generated README Design

## Intent

The generated README reads like a template contributor's checklist. It lists
bootstrap commands, staged workflows, Maven verification, and template updates.
A generated project's reader needs the project's purpose, install steps, and
use. Contributor work belongs in `CONTRIBUTING.md`.

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

Add `project_purpose` and `project_usage` answers. Both take multiline input.
Their defaults derive from earlier answers, so hosted Copier updates need no
new prompt.

Render these README sections: title and purpose, install, use, development
links, license. Derive install from `java_group_id`, `java_module`, and
`java_version` on Java; from `ts_scope` and `first_package` on TypeScript; from
a copy instruction on config.

State the answered project license and its URL. State the README's own
CC-BY-NC-SA-4.0 license and the fixed copyright line from its SPDX header. Link
to `LICENSES`.

Move bootstrap, direnv, staged workflows, Maven verification, and Copier
updates into `CONTRIBUTING.md`. Leave agent commands in `AGENTS.md`.

Update render tests for the new answers, the README sections, and the moved
contributor content.

## Non-goals

- Fixture and integration-test instructions in the README.
- A copyright-holder answer or edits to other SPDX headers.
- Changes to the Copier update flow or staged workflows.

## Verification

Render all three variants. Assert purpose, use, install coordinates, license,
copyright, and both development links in each README. Assert no bootstrap,
Renovate, Copier, or workflow text in the README. Assert that text in
`CONTRIBUTING.md`.

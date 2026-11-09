<!--
SPDX-FileCopyrightText: Copyright © 2015-2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# base-template

Copier template for xenoterracide projects. Generates Java and TypeScript
consumers with shared tooling: prettier, REUSE, git hooks, CI, renovate.

## Usage

Create a project:

    copier copy --trust https://github.com/xenoterracide/base-template my-project

Bootstrap it:

    cd my-project
    npm run contribute

Refresh from the template:

    uv run copier update --trust

Conflicts land as `.rej` files. Resolve them by hand.

## Staged workflows

Generated projects get CI under `staged/.github/workflows/`. Copy it into
place with credentials that carry the `workflow` scope:

    cp -r staged/.github/workflows .github/workflows
    git add .github/workflows

## Development

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contributor guide
- [`AGENTS.md`](AGENTS.md) — guide for AI agents

## License

[CC-BY-NC-SA-4.0](LICENSES/CC-BY-NC-SA-4.0.txt). Generated projects pick
their own license.

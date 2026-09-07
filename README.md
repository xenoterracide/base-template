<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# share

Shared configuration and developer tooling for projects in the
`xenoterracide` ecosystem.

This repository is intended to be consumed as either a **git submodule** or a
**git subtree**. If you are reading this file at the root of a repository, you
are viewing the standalone project. If it appears inside a subdirectory, it has
been included as a git subtree.

## Usage

Include this repository in another project with git subtree or submodule:

### Git subtree

```bash
git subtree add --prefix .share https://github.com/xenoterracide/subtree-share.git develop --squash
```

### Git submodule

```bash
git submodule add https://github.com/xenoterracide/subtree-share.git .share
```

## Git hooks

This repository's git hooks live in `git/hooks/` and are installed locally via
`yarn contribute`, which configures git `core.hooksPath` to point at them. The
hooks run lint-staged on staged files, validate conventional commit messages,
and sync tooling on checkout and merge.

Downstream projects that consume this repository via git subtree or submodule
can install the hooks from `git/hooks/` in their own `core.hooksPath`.

For local development of this repository, run `yarn contribute` to install the
git hooks, which run lint-staged on staged files.

## Development

- See [`AGENTS.md`](./AGENTS.md) for guidance for AI coding agents.
- See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for human contributor guidance.

## License

[CC-BY-NC-SA-4.0](LICENSES/CC-BY-NC-SA-4.0.txt)

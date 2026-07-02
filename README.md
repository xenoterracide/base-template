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

This repository's git hooks are available as pre-commit hooks.

Add them to another project:

1. Install pre-commit:

   ```bash
   uv add --group dev pre-commit
   ```

2. Add to `.pre-commit-config.yaml`:

   ```yaml
   ---
   repos:
     - repo: https://github.com/xenoterracide/subtree-share
       rev: vX.Y.Z
       hooks:
         - id: share-commit-msg
         - id: share-pre-commit
         - id: share-post-checkout
         - id: share-post-merge
   ```

3. Install the hooks:

   ```bash
   pre-commit install \
     --hook-type commit-msg \
     --hook-type pre-commit \
     --hook-type post-checkout \
     --hook-type post-merge
   ```

The `share-post-checkout` hook also runs `pre-commit autoupdate` after syncing
tooling. This keeps the configured `rev:` current when `develop` moves forward,
without requiring versioned tags. The hook requires `uv`; if `uv` is not
installed, the hook fails. `pre-commit autoupdate` failures (for example, due
to no network) are explicitly swallowed with `|| true` and do not block the
checkout.

For local development of this repository, run `yarn contribute` to configure
`core.hooksPath` to `git/hooks`.

## Development

- See [`AGENTS.md`](./AGENTS.md) for guidance for AI coding agents.
- See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for human contributor guidance.

## License

[CC-BY-NC-SA-4.0](LICENSES/CC-BY-NC-SA-4.0.txt)

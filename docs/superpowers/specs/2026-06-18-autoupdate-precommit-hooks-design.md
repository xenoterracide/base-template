<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Auto-Update pre-commit Hooks on Checkout

**Date:** 2026-06-18
**Status:** Design approved

## Goal

Keep consumers of `subtree-share` pre-commit hooks reasonably current without
requiring versioned tags. Run `pre-commit autoupdate` as a best-effort step
inside the `post-checkout` hook, so updates happen on branch checkouts rather
than every commit or never.

## Context

`subtree-share` now exposes its `git/hooks/` scripts as pre-commit hooks via
`.pre-commit-hooks.yaml`. Consumers add the repo to `.pre-commit-config.yaml`
and pin a `rev:`.

If the `rev:` points to a moving ref like `develop`, pre-commit resolves it to
a commit SHA on first install and never updates automatically. If the `rev:`
points to a tag, consumers stay pinned until they manually bump. For hobby
work, neither manual bumps nor permanent staleness is desirable.

## Design

### Change to `git/hooks/post-checkout`

After the existing tooling sync, run `pre-commit autoupdate`. Invoke through `uv`
with a frozen lockfile, matching how other Python tools are used in this
repository. Autoupdate failures are reported but do not fail the hook, so
network outages do not block branch checkouts or tooling sync. If `uv` itself
is missing, the hook fails so the developer knows the expected tooling is not
installed.

```sh
command -v uv >/dev/null 2>&1 || {
  echo "ERROR: uv is required but not found." >&2
  exit 1
}

uv run --frozen pre-commit autoupdate || true
```

### Behavior

- `pre-commit autoupdate` fetches the configured repo refs and rewrites `rev:`
  only if the remote ref points to a different commit than the current pin.
- If the ref has not moved, `.pre-commit-config.yaml` is unchanged.
- The step runs on branch checkouts (native git) and under pre-commit's own
  `post-checkout` stage.
- CI is already skipped via the existing `[ -n "$CI" ] && exit 0` guard.

### Documentation updates

- `README.md` — note that `share-post-checkout` includes best-effort autoupdate.
- `AGENTS.md` — mention that hook changes must not break autoupdate or assume
  it is always present.

## Trade-offs

| Approach                       | Pros                                         | Cons                                                                   |
| ------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------- |
| Autoupdate on post-checkout    | Automatic; no tags needed; runs infrequently | Network call on every checkout; may surprise users by rewriting config |
| Versioned tags + Renovate      | Reproducible; standard ecosystem pattern     | Requires tagging and consumer Renovate setup                           |
| Manual `pre-commit autoupdate` | Simple                                       | Relies on humans; goes stale                                           |

## Risks

- If `uv` is missing, the hook fails so the developer knows expected tooling is
  not installed.
- Network or pre-commit failures during autoupdate are warned but do not fail
  the hook, so checkout-time tooling sync still runs.
- Rewriting `.pre-commit-config.yaml` on checkout may be unexpected; document it
  clearly.

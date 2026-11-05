<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Headerless Licensing: reuse Owns Headers, the Template Does Not

Status: Accepted

Extends
[`2026-11-04-revive-source-of-truth-design.md`](2026-11-04-revive-source-of-truth-design.md) and
[`2026-11-05-update-contract-design.md`](2026-11-05-update-contract-design.md). Those make the
template the source of truth for shared tooling and define what an update may
change. This one decides who writes license headers.

## Intent

The template renders no SPDX license or copyright header text. `reuse annotate`,
run by lint-staged at a consumer's first commit, is the sole producer of in-file
headers. Generated projects are headerless until then.

## Why

Baking headers in the template fights the tool that owns them. `reuse annotate`
merges rather than replaces, so a baked header plus an annotate run produces a
dual declaration. The baked copyright year is one value spread across files
with different inception years, so it can never be right per file. The baked
license on docs disagreed with lint-staged's doc row. Every wart the github
adoption surfaced traced back to the template doing reuse's job.

## Decision

- **The license scheme lives in `.lintstagedrc.cjs`.** Its per-file-type rows
  (`code → {{ license }}`, scripts `→ MIT`, config `→ CC0-1.0`, docs `→
CC-BY-NC-SA-4.0`) are the single home for which file gets which license.
- **`reuse annotate` is the only header writer.** With nothing pre-baked, its
  lack of a replace mode is inert: it stamps a headerless file, then re-sees
  its own output and no-ops.
- **Template `.jinja` sources are headerless.** The authoring `REUSE.toml`
  licenses them as a class with `path = "**/*.jinja"` → `CC0-1.0`.
- **Generated files are headerless.** A consumer's `REUSE.toml` carries only
  exemptions — lockfiles, `.tool-versions`, `.python-version`, the Maven wrapper
  files — not speculative annotations. Drop `.gitmodules`: no repository in the
  family has one.
- **`.license` sidecars are annotate's output, not template renders.** Remove
  the `.license.jinja` templates; lint-staged creates the sidecars for files
  that cannot carry a header (JSON, JVM flags).
- **Remove the header machinery from `copier.yml`.** Drop the `spdx_copyright_line`,
  `spdx_license_line`, and `project_license_line` computed answers, and the
  `copyright_year` question. Keep `copyright_holder` (lint-staged passes it to
  `reuse annotate` as `--copyright`), `license` (the answered code license and the
  `package.json`/`pom.xml` fields), and `license_url` (the pom `licenses.url`
  field, not a header).

## Approaches considered

1. **Template bakes headers; reuse post-processes.** Rejected. The current
   state; produces dual declarations and wrong per-file years.
2. **Scheme in `REUSE.toml`, files headerless forever.** Rejected. Loses
   in-file headers, so a copied file no longer tells its license — a step away
   from REUSE's "license travels with the file" norm.
3. **Scheme in lint-staged; template bakes nothing.** Chosen.

## Consequences

- A fresh render fails `reuse lint` until annotate runs. The template's own
  render verification must run lint-staged (which annotates) before linting,
  mirroring the consumer flow.
- In-file headers exist only after a consumer's first commit.
- No copyright year is rendered anywhere; annotate writes holder-only
  `SPDX-FileCopyrightText`, which is spec-compliant.
- `copyright_year`, added for adopted-repo ranges, is removed again — the
  per-file-year capability it could not provide is moot once headers go away.

## Acceptance

- Rendered `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.envrc`, `.gitignore`,
  `.prettierignore`, `.lintstagedrc.cjs`, `pyproject.toml`, `REUSE.toml`, java
  and typescript sources, and `staged/` files carry no `SPDX-FileCopyrightText`
  and no `SPDX-License-Identifier` line.
- The authoring `.jinja` files pass `reuse lint` via the `**/*.jinja` annotation,
  with no inline SPDX lines.
- Running lint-staged on a render adds exactly one header per file, and a second
  run adds nothing (no dual declarations).
- `pytest`, `tests/verify.sh` for java/typescript/config, and `pnpm lint` pass.

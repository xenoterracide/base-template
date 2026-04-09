#!/usr/bin/env tsx

// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Cli } from "clipanion";
import { SyncCommand } from "./commands/sync.js";
import { UpdateCommand } from "./commands/update.js";

const cli = new Cli({
  binaryLabel: "secrets-sync",
  binaryName: "secrets",
});

cli.register(SyncCommand);
cli.register(UpdateCommand);

void cli
  .run(process.argv.slice(2), Cli.defaultContext)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  });

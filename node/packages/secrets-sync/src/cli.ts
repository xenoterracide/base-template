#!/usr/bin/env tsx

// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Cli } from "clipanion";
import { SyncCommand } from "./commands/sync.js";
import { BulkSetCommand } from "./commands/bulk-set.js";
import { PullCommand } from "./commands/pull.js";
import { UpdateCommand } from "./commands/update.js";

const cli = new Cli({
  binaryLabel: "secrets-sync",
  binaryName: "secrets-sync",
});

cli.register(SyncCommand);
cli.register(BulkSetCommand);
cli.register(PullCommand);
cli.register(UpdateCommand);

void cli.runExit(process.argv.slice(2), Cli.defaultContext);

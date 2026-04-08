// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Types
export type { CommandRunner, EnvEntry, SetSecretOptions } from "./types.js";

// Environment file utilities
export { parseEnvFile, resolveSecretValue } from "./env.js";

// GitHub operations (exported for testing)
export { listSecretNames, setSecret, findReposByLabel, getCurrentUser } from "./github.js";

// Commands (exported for testing)
export { SyncCommand } from "./commands/sync.js";
export { BulkSetCommand } from "./commands/bulk-set.js";
export { UpdateCommand } from "./commands/update.js";

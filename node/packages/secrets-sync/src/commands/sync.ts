// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";
import { logger } from "../logger.js";
import { parseEnvFile, resolveSecretValue } from "../env.js";
import { setSecret } from "../github.js";
import type { CommandRunner } from "../types.js";

export class SyncCommand extends Command {
  public static paths = [["sync"]];

  public secrets = Option.String("--secrets,-s", {
    required: true,
    description: "Secret names to sync (comma-separated)",
  });

  public to = Option.String("--to,-t", {
    required: true,
    description: "Target repo(s), comma-separated (OWNER/REPO format)",
  });

  public fromEnvFile = Option.String("--from-env-file", {
    description: "Load values from env file",
  });

  public dryRun = Option.Boolean("--dry-run", false, {
    description: "Show what would be done",
  });

  // Optional runner for testing - uses default gh runner if not set
  public runner?: CommandRunner;

  public async execute(): Promise<number> {
    // Parse secret names
    const secretNames = this.secrets
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (secretNames.length === 0) {
      logger.error("Error: No secrets specified");
      return 1;
    }

    // Parse target repos
    const targetRepos = this.to
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (targetRepos.length === 0) {
      logger.error("Error: No target repos specified");
      return 1;
    }

    // Parse env file if provided
    const envFileEntries =
      typeof this.fromEnvFile === "string" && this.fromEnvFile !== "" ? parseEnvFile(this.fromEnvFile) : undefined;

    // Resolve all secret values
    const secretsToSync: { name: string; value: string }[] = [];

    for (const name of secretNames) {
      const value = resolveSecretValue(name, envFileEntries);
      if (value === undefined) {
        logger.warn(`Warning: Could not resolve value for secret "${name}", skipping`);
        continue;
      }
      secretsToSync.push({ name, value });
    }

    if (secretsToSync.length === 0) {
      logger.error("Error: Could not resolve values for any secrets.");
      logger.error("Secrets must be provided via environment variables or --from-env-file.");
      logger.error("Example: export SECRET_NAME=value && yarn secrets sync ...");
      return 1;
    }

    logger.info(`Will sync ${String(secretsToSync.length)} secret(s) to ${String(targetRepos.length)} repo(s):`);
    logger.info(`  Repos: ${targetRepos.join(", ")}`);
    logger.info(`  Secrets: ${secretsToSync.map((s) => s.name).join(", ")}`);

    if (this.dryRun) {
      logger.info("[Dry Run] No changes made");
      return 0;
    }

    // Confirm if interactive
    if (process.stdin.isTTY) {
      process.stdout.write("\nProceed? [Y/n] ");
      const reply = await new Promise<string>((res) => {
        process.stdin.once("data", (data): void => {
          res(data.toString().trim().toLowerCase());
        });
      });
      if (reply === "n" || reply === "no") {
        logger.info("Cancelled");
        return 0;
      }
    }

    // Sync to each target repo
    for (const repo of targetRepos) {
      logger.info(`\nSyncing to ${repo}...`);
      for (const { name, value } of secretsToSync) {
        try {
          setSecret({ repo, name, value, runner: this.runner });
          logger.info(`  ✓ ${name}`);
        } catch (e) {
          logger.error(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    logger.info("\nSync complete!");
    return 0;
  }
}

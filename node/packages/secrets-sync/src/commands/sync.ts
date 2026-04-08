// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";
import { logger } from "../logger.js";
import { parseEnvFile, resolveSecretValue } from "../env.js";
import { listSecretNames, setSecret } from "../github.js";
import type { CommandRunner } from "../types.js";

export class SyncCommand extends Command {
  public static paths = [["sync"]];

  public from = Option.String("--from,-f", {
    required: true,
    description: "Source repository (OWNER/REPO format)",
  });

  public to = Option.String("--to,-t", {
    required: true,
    description: "Target repo(s), comma-separated",
  });

  public include = Option.String("--include,-i", {
    description: "Only sync specific secrets (comma-separated)",
  });

  public exclude = Option.String("--exclude,-e", {
    description: "Exclude specific secrets (comma-separated)",
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
    logger.info(`Syncing secrets from ${this.from}...`);

    // Parse target repos
    const targetRepos = this.to
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (targetRepos.length === 0) {
      logger.error("Error: No target repos specified");
      return 1;
    }

    // Get secret names from source repo
    const secretNames = listSecretNames(this.from, this.runner);
    logger.info(`Found ${String(secretNames.length)} secrets in source repo`);

    // Apply include/exclude filters
    let filteredNames = secretNames;

    if (typeof this.include === "string" && this.include !== "") {
      const includeSet = new Set(this.include.split(",").map((s) => s.trim()));
      filteredNames = filteredNames.filter((n) => includeSet.has(n));
      logger.info(`Included ${String(filteredNames.length)} secrets based on --include filter`);
    }

    if (typeof this.exclude === "string" && this.exclude !== "") {
      const excludeSet = new Set(this.exclude.split(",").map((s) => s.trim()));
      filteredNames = filteredNames.filter((n) => !excludeSet.has(n));
      logger.info(`Excluded secrets, ${String(filteredNames.length)} remaining`);
    }

    if (filteredNames.length === 0) {
      logger.info("No secrets to sync after filtering");
      return 0;
    }

    // Parse env file if provided
    const envFileEntries =
      typeof this.fromEnvFile === "string" && this.fromEnvFile !== "" ? parseEnvFile(this.fromEnvFile) : undefined;

    // Resolve all secret values
    const secretsToSync: { name: string; value: string }[] = [];

    for (const name of filteredNames) {
      const value = resolveSecretValue(name, envFileEntries);
      if (value === undefined) {
        logger.warn(`Warning: Could not resolve value for secret "${name}", skipping`);
        continue;
      }
      secretsToSync.push({ name, value });
    }

    if (secretsToSync.length === 0) {
      logger.info("No secrets to sync (could not resolve any values)");
      return 0;
    }

    logger.info(`\nWill sync ${String(secretsToSync.length)} secrets to ${String(targetRepos.length)} repo(s):`);
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

    logger.info("Sync complete!");
    return 0;
  }
}

// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";
import { logger } from "../logger.js";
import { parseEnvFile, resolveSecretValue } from "../env.js";
import { findReposByLabel, getCurrentUser, setSecret } from "../github.js";

export class BulkSetCommand extends Command {
  public static paths = [["bulk-set"]];

  public owner = Option.String("--owner,-o", {
    description: "GitHub owner/organization (defaults to current user)",
  });

  public label = Option.String("--label,-l", {
    required: true,
    description: "Repository topic/label to filter by",
  });

  public secretName = Option.String("--secret-name,-n", {
    description: "Secret name to set",
  });

  public secretValue = Option.String("--secret-value,-v", {
    description: "Secret value",
  });

  public fromEnvFile = Option.String("--from-env-file", {
    description: "Load secrets from env file",
  });

  public dryRun = Option.Boolean("--dry-run", false, {
    description: "Show what would be done",
  });

  public async execute(): Promise<number> {
    const owner = this.owner ?? getCurrentUser();
    logger.info(`Finding repos for owner "${owner}" with label "${this.label}"...`);

    const repos = findReposByLabel(owner, this.label);
    logger.info(`Found ${String(repos.length)} non-archived repos with label "${this.label}"`);

    if (repos.length === 0) {
      logger.info("No repos to update");
      return 0;
    }

    // Collect secrets to set
    const secretsToSet: { name: string; value: string }[] = [];

    if (this.fromEnvFile != null && this.fromEnvFile !== "") {
      const envFileEntries = parseEnvFile(this.fromEnvFile);

      for (const name of Object.keys(envFileEntries)) {
        const value = resolveSecretValue(name, envFileEntries);
        if (value !== undefined) {
          secretsToSet.push({ name, value });
        }
      }
    } else if (this.secretName != null && this.secretName !== "") {
      const value = resolveSecretValue(this.secretName, undefined, this.secretValue);
      if (value !== undefined) {
        secretsToSet.push({ name: this.secretName, value });
      } else {
        logger.error(`Error: Could not resolve value for secret "${this.secretName}"`);
        return 1;
      }
    } else {
      logger.error("Error: Must provide either --from-env-file or --secret-name");
      return 1;
    }

    if (secretsToSet.length === 0) {
      logger.info("No secrets to set");
      return 0;
    }

    logger.info(`\nWill set ${String(secretsToSet.length)} secret(s) on ${String(repos.length)} repo(s):`);
    logger.info(`  Repos: ${repos.join(", ")}`);
    logger.info(`  Secrets: ${secretsToSet.map((s) => s.name).join(", ")}`);

    if (this.dryRun) {
      logger.info("\n[Dry Run] No changes made");
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

    // Set secrets on each repo
    for (const repo of repos) {
      logger.info(`\nSetting secrets on ${repo}...`);
      for (const { name, value } of secretsToSet) {
        try {
          setSecret({ repo, name, value });
          logger.info(`  ✓ ${name}`);
        } catch (e) {
          logger.error(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    logger.info("\nBulk set complete!");
    return 0;
  }
}

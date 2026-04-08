// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";
import { writeFileSync } from "fs";
import { logger } from "../logger.js";
import { listSecretNames } from "../github.js";
import { setSecurePermissions } from "../fs-utils.js";

export class PullCommand extends Command {
  public static paths = [["pull"]];

  public from = Option.String("--from,-f", {
    required: true,
    description: "Source repository (OWNER/REPO format)",
  });

  public output = Option.String("--output,-o", "secrets.env", {
    description: "Output file path",
  });

  public format = Option.String("--format", "env", {
    description: "Output format: env or file",
  });

  public dryRun = Option.Boolean("--dry-run", false, {
    description: "Show what would be done",
  });

  // Required by clipanion interface - async needed even without await
  // eslint-disable-next-line @typescript-eslint/require-await
  public async execute(): Promise<number> {
    if (this.format !== "env" && this.format !== "file") {
      logger.error("Error: Format must be 'env' or 'file'");
      return 1;
    }
    logger.info(`Fetching secrets from ${this.from}...`);

    const secretNames = listSecretNames(this.from);
    logger.info(`Found ${String(secretNames.length)} secrets`);

    if (secretNames.length === 0) {
      logger.info("No secrets to write");
      return 0;
    }

    // Sort names for consistent output
    secretNames.sort();

    const lines: string[] = [
      "# Secrets pulled from " + this.from,
      "#",
      "# Format options:",
      "#   KEY=env://ENV_VAR_NAME     - Read from environment variable",
      "#   KEY=file://./path/to/file  - Read from file (for GPG keys, certs)",
      "#   KEY=value                  - Direct value (not recommended for secrets)",
      "",
    ];

    for (const name of secretNames) {
      if (this.format === "file") {
        // Suggest file paths based on common patterns
        if (name.toLowerCase().includes("gpg") || name.toLowerCase().includes("key")) {
          lines.push(`${name}=file://./keys/${name.toLowerCase().replace(/_/g, "-")}.asc`);
        } else {
          lines.push(`${name}=env://${name}`);
        }
      } else {
        lines.push(`${name}=env://${name}`);
      }
    }

    const content = lines.join("\n") + "\n";

    if (this.dryRun) {
      logger.info("\n[Dry Run] Would write to " + this.output + ":");
      logger.info(content);
      return 0;
    }

    writeFileSync(this.output, content, "utf8");
    setSecurePermissions(this.output);
    logger.info(`\nWrote ${String(secretNames.length)} secret entries to ${this.output} (permissions: 600)`);
    return 0;
  }
}

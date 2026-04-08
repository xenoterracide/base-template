#!/usr/bin/env tsx

// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync } from "child_process";
import { existsSync, readFileSync, statSync, writeFileSync, chmodSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { tmpdir } from "os";
import { join } from "path";
import { Command, Option, Cli } from "clipanion";
import type { Logger } from "pino";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pino = require("pino") as (options: unknown) => Logger;

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: false,
      ignore: "pid,hostname",
    },
  },
});

export interface CommandRunner {
  runArgv: (cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }) => string;
}

function setSecurePermissions(filePath: string): void {
  try {
    chmodSync(filePath, 0o600);
  } catch (e) {
    logger.warn(`Could not set permissions on ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function checkFilePermissions(filePath: string): void {
  try {
    const stats = statSync(filePath);
    const mode = stats.mode & 0o777;
    if (mode !== 0o600) {
      logger.warn(`${filePath} has permissions ${mode.toString(8)}, setting to 600`);
      setSecurePermissions(filePath);
    }
  } catch {
    // Ignore if file doesn't exist or can't be stat'd
  }
}

function createDefaultCommandRunner(): CommandRunner {
  return {
    runArgv(cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }): string {
      return execFileSync(cmd, args, {
        encoding: "utf8",
        cwd: opts?.cwd,
        env: { ...process.env, ...opts?.env },
      }).trim();
    },
  };
}

const defaultRunner = createDefaultCommandRunner();

export interface EnvEntry {
  type: "value" | "env" | "file";
  value: string;
}

export function parseEnvFile(filePath: string): Record<string, EnvEntry> {
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Env file not found: ${filePath}`);
  }

  checkFilePermissions(resolvedPath);

  const content = readFileSync(resolvedPath, "utf8");
  const entries: Record<string, EnvEntry> = {};
  const baseDir = dirname(resolvedPath);

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    if (!key) continue;

    // Check for file:// prefix
    if (value.startsWith("file://")) {
      const referencedPath = value.slice(7);
      const resolvedFilePath = resolve(baseDir, referencedPath);
      entries[key] = { type: "file", value: resolvedFilePath };
    }
    // Check for env:// prefix
    else if (value.startsWith("env://")) {
      const envVar = value.slice(6);
      entries[key] = { type: "env", value: envVar };
    }
    // Plain value
    else {
      entries[key] = { type: "value", value };
    }
  }

  return entries;
}

export function resolveSecretValue(
  name: string,
  envFileEntries?: Record<string, EnvEntry>,
  explicitValue?: string,
): string | undefined {
  // Priority 1: Explicit value
  if (explicitValue !== undefined) {
    return explicitValue;
  }

  // Priority 2: From env file entry
  if (envFileEntries && name in envFileEntries) {
    const entry = envFileEntries[name];

    switch (entry.type) {
      case "value": {
        return entry.value;
      }
      case "env": {
        const envValue = process.env[entry.value];
        if (envValue !== undefined) {
          return envValue;
        }
        logger.warn(`Warning: Environment variable "${entry.value}" not found for secret "${name}"`);
        return undefined;
      }
      case "file": {
        if (!existsSync(entry.value)) {
          logger.warn(`Warning: File "${entry.value}" not found for secret "${name}"`);
          return undefined;
        }
        // Check file permissions
        try {
          const stats = statSync(entry.value);
          const mode = stats.mode & 0o777;
          if (mode & 0o044) {
            logger.warn(
              `Warning: File "${entry.value}" has permissive permissions (${mode.toString(8)}), should be 0400 or 0600`,
            );
          }
        } catch {
          // Ignore permission check errors
        }
        const content = readFileSync(entry.value, "utf8");
        return content;
      }
    }
  }

  // Priority 3: Environment variable matching secret name
  const envValue = process.env[name];
  if (envValue !== undefined) {
    return envValue;
  }

  return undefined;
}

function listSecretNames(repo: string, runner: CommandRunner = defaultRunner): string[] {
  try {
    const output = runner.runArgv("gh", ["secret", "list", "--repo", repo, "--json", "name"]);
    const parsed = JSON.parse(output) as { name: string }[];
    return parsed.map((s) => s.name);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to list secrets for ${repo}: ${msg}`);
  }
}

interface SetSecretOptions {
  repo: string;
  name: string;
  value: string;
  runner?: CommandRunner;
}

function setSecret(opts: SetSecretOptions): void {
  const { repo, name, value, runner = defaultRunner } = opts;
  const tmpFile = join(tmpdir(), `secret-${name}-${String(Date.now())}.txt`);
  try {
    writeFileSync(tmpFile, value, "utf8");
    setSecurePermissions(tmpFile);
    runner.runArgv("gh", ["secret", "set", name, "--repo", repo, "--body-file", tmpFile]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to set secret "${name}" on ${repo}: ${msg}`);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

function findReposByLabel(owner: string, label: string, runner: CommandRunner = defaultRunner): string[] {
  try {
    const output = runner.runArgv("gh", [
      "repo",
      "list",
      owner,
      "--topic",
      label,
      "--no-archived",
      "--limit",
      "1000",
      "--json",
      "nameWithOwner",
    ]);
    const parsed = JSON.parse(output) as { nameWithOwner: string }[];
    return parsed.map((r) => r.nameWithOwner);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to list repos for owner "${owner}" with label "${label}": ${msg}`);
  }
}

function getCurrentUser(runner: CommandRunner = defaultRunner): string {
  try {
    const output = runner.runArgv("gh", ["api", "user", "--jq", ".login"]);
    return output.trim();
  } catch {
    throw new Error("Failed to get current user. Make sure you're authenticated with 'gh auth login'");
  }
}

// Sync Command
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
    const secretNames = listSecretNames(this.from);
    logger.info(`Found ${String(secretNames.length)} secrets in source repo`);

    // Apply include/exclude filters
    let filteredNames = secretNames;

    if (this.include != null && this.include !== "") {
      const includeSet = new Set(this.include.split(",").map((s) => s.trim()));
      filteredNames = filteredNames.filter((n) => includeSet.has(n));
      logger.info(`Included ${String(filteredNames.length)} secrets based on --include filter`);
    }

    if (this.exclude != null && this.exclude !== "") {
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
      this.fromEnvFile != null && this.fromEnvFile !== "" ? parseEnvFile(this.fromEnvFile) : undefined;

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

    // Sync to each target repo
    for (const repo of targetRepos) {
      logger.info(`\nSyncing to ${repo}...`);
      for (const { name, value } of secretsToSync) {
        try {
          setSecret({ repo, name, value });
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

// Bulk Set Command
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

// Pull Command
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

// Update Command
export class UpdateCommand extends Command {
  public static paths = [["update"]];

  public file = Option.String("--file,-f", "secrets.env", {
    description: "Secrets env file path",
  });

  public key = Option.String("--key,-k", {
    required: true,
    description: "Secret name to update",
  });

  public value = Option.String("--value,-v", {
    required: true,
    description: "Secret value",
  });

  // Required by clipanion interface - async needed even without await
  // eslint-disable-next-line @typescript-eslint/require-await
  public async execute(): Promise<number> {
    const resolvedPath = resolve(this.file);

    // Check/fix existing file permissions
    if (existsSync(resolvedPath)) {
      checkFilePermissions(resolvedPath);
    }

    // Read existing content or start fresh
    let content = "";
    if (existsSync(resolvedPath)) {
      content = readFileSync(resolvedPath, "utf8");
    }

    const lines = content.split("\n");
    let found = false;
    const newLines: string[] = [];

    for (const line of lines) {
      // Check if this is a key=value line
      const eqIndex = line.indexOf("=");
      if (eqIndex > 0 && !line.startsWith("#")) {
        const lineKey = line.slice(0, eqIndex).trim();
        if (lineKey === this.key) {
          newLines.push(`${this.key}=${this.value}`);
          found = true;
          continue;
        }
      }
      newLines.push(line);
    }

    // If key not found, append it
    if (!found) {
      // Add a blank line if file doesn't end with one
      if (newLines.length > 0 && newLines[newLines.length - 1] !== "") {
        newLines.push("");
      }
      newLines.push(`${this.key}=${this.value}`);
      logger.info(`Added ${this.key} to ${this.file}`);
    } else {
      logger.info(`Updated ${this.key} in ${this.file}`);
    }

    writeFileSync(resolvedPath, newLines.join("\n") + "\n", "utf8");
    setSecurePermissions(resolvedPath);
    return 0;
  }
}

// Main CLI
const cli = new Cli({
  binaryLabel: "secrets-sync",
  binaryName: "secrets-sync",
});

cli.register(SyncCommand);
cli.register(BulkSetCommand);
cli.register(PullCommand);
cli.register(UpdateCommand);

void cli.runExit(process.argv.slice(2), Cli.defaultContext);

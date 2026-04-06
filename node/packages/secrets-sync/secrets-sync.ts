#!/usr/bin/env tsx

// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync } from "child_process";
import { existsSync, readFileSync, statSync, writeFileSync, chmodSync } from "fs";
import { createInterface } from "readline";
import { resolve, dirname } from "path";

export interface CommandRunner {
  runArgv(cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }): string;
}

function setSecurePermissions(filePath: string): void {
  try {
    chmodSync(filePath, 0o600);
  } catch (e) {
    console.warn(`Warning: Could not set permissions on ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function checkFilePermissions(filePath: string): void {
  try {
    const stats = statSync(filePath);
    const mode = stats.mode & 0o777;
    if (mode !== 0o600) {
      console.warn(`Warning: ${filePath} has permissions ${mode.toString(8)}, setting to 600`);
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

interface SyncArgs {
  from: string;
  to: string[];
  exclude?: string[];
  include?: string[];
  fromEnvFile?: string;
  interactive: boolean;
  dryRun: boolean;
}

interface BulkSetArgs {
  owner: string;
  label: string;
  secretName?: string;
  secretValue?: string;
  fromEnvFile?: string;
  dryRun: boolean;
}

interface PullArgs {
  from: string;
  output: string;
  format: "env" | "file";
  dryRun?: boolean;
}

interface UpdateArgs {
  file: string;
  key: string;
  value: string;
}

interface EnvEntry {
  type: "value" | "env" | "file";
  value: string;
}

function parseEnvFile(filePath: string): Record<string, EnvEntry> {
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
      const filePath = value.slice(7);
      const resolvedFilePath = resolve(baseDir, filePath);
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

function resolveSecretValue(
  name: string,
  envFileEntries?: Record<string, EnvEntry>,
  explicitValue?: string,
  interactive?: boolean,
): Promise<string | undefined> {
  // Priority 1: Explicit value
  if (explicitValue !== undefined) {
    return Promise.resolve(explicitValue);
  }

  // Priority 2: From env file entry
  if (envFileEntries && name in envFileEntries) {
    const entry = envFileEntries[name];

    if (entry.type === "value") {
      return Promise.resolve(entry.value);
    }

    if (entry.type === "env") {
      const envValue = process.env[entry.value];
      if (envValue !== undefined) {
        return Promise.resolve(envValue);
      }
      console.warn(`Warning: Environment variable "${entry.value}" not found for secret "${name}"`);
      return Promise.resolve(undefined);
    }

    if (entry.type === "file") {
      if (!existsSync(entry.value)) {
        console.warn(`Warning: File "${entry.value}" not found for secret "${name}"`);
        return Promise.resolve(undefined);
      }
      // Check file permissions
      try {
        const stats = statSync(entry.value);
        const mode = stats.mode & 0o777;
        if (mode & 0o044) {
          console.warn(
            `Warning: File "${entry.value}" has permissive permissions (${mode.toString(8)}), should be 0400 or 0600`,
          );
        }
      } catch {
        // Ignore permission check errors
      }
      const content = readFileSync(entry.value, "utf8");
      return Promise.resolve(content);
    }
  }

  // Priority 3: Environment variable matching secret name
  const envValue = process.env[name];
  if (envValue !== undefined) {
    return Promise.resolve(envValue);
  }

  // Priority 4: Interactive prompt
  if (interactive) {
    return promptForSecret(name);
  }

  return Promise.resolve(undefined);
}

function promptForSecret(name: string): Promise<string | undefined> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    // For multi-line secrets like GPG keys, allow empty line to finish
    console.log(`Enter value for secret "${name}" (press Ctrl+D or enter an empty line twice to finish):`);

    const lines: string[] = [];
    let emptyLineCount = 0;

    rl.on("line", (line) => {
      if (line === "") {
        emptyLineCount++;
        if (emptyLineCount >= 2 || lines.length === 0) {
          rl.close();
          return;
        }
      } else {
        emptyLineCount = 0;
      }
      lines.push(line);
    });

    rl.on("close", () => {
      const value = lines.join("\n");
      resolve(value || undefined);
    });

    // Handle Ctrl+D gracefully
    rl.on("SIGINT", () => {
      rl.close();
      resolve(undefined);
    });
  });
}

function listSecretNames(repo: string, runner: CommandRunner = defaultRunner): string[] {
  try {
    const output = runner.runArgv("gh", ["secret", "list", "--repo", repo, "--json", "name"]);
    const parsed = JSON.parse(output) as Array<{ name: string }>;
    return parsed.map((s) => s.name);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to list secrets for ${repo}: ${msg}`);
  }
}

function setSecret(repo: string, name: string, value: string, runner: CommandRunner = defaultRunner): void {
  try {
    runner.runArgv("gh", ["secret", "set", name, "--repo", repo, "--body", value]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to set secret "${name}" on ${repo}: ${msg}`);
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
    const parsed = JSON.parse(output) as Array<{ nameWithOwner: string }>;
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
  } catch (e) {
    throw new Error("Failed to get current user. Make sure you're authenticated with 'gh auth login'");
  }
}

async function syncCommand(args: SyncArgs): Promise<void> {
  console.log(`Syncing secrets from ${args.from}...`);

  // Get secret names from source repo
  const secretNames = listSecretNames(args.from);
  console.log(`Found ${secretNames.length} secrets in source repo`);

  // Apply include/exclude filters
  let filteredNames = secretNames;

  if (args.include && args.include.length > 0) {
    const includeSet = new Set(args.include);
    filteredNames = filteredNames.filter((n) => includeSet.has(n));
    console.log(`Included ${filteredNames.length} secrets based on --include filter`);
  }

  if (args.exclude && args.exclude.length > 0) {
    const excludeSet = new Set(args.exclude);
    filteredNames = filteredNames.filter((n) => !excludeSet.has(n));
    console.log(`Excluded secrets, ${filteredNames.length} remaining`);
  }

  if (filteredNames.length === 0) {
    console.log("No secrets to sync after filtering");
    return;
  }

  // Parse env file if provided
  let envFileEntries: Record<string, EnvEntry> | undefined;
  if (args.fromEnvFile) {
    envFileEntries = parseEnvFile(args.fromEnvFile);
  }

  // Resolve all secret values
  const secretsToSync: Array<{ name: string; value: string }> = [];

  for (const name of filteredNames) {
    const value = await resolveSecretValue(name, envFileEntries, undefined, args.interactive);
    if (value === undefined) {
      console.warn(`Warning: Could not resolve value for secret "${name}", skipping`);
      continue;
    }
    secretsToSync.push({ name, value });
  }

  if (secretsToSync.length === 0) {
    console.log("No secrets to sync (could not resolve any values)");
    return;
  }

  console.log(`\nWill sync ${secretsToSync.length} secrets to ${args.to.length} repo(s):`);
  console.log(`  Repos: ${args.to.join(", ")}`);
  console.log(`  Secrets: ${secretsToSync.map((s) => s.name).join(", ")}`);

  if (args.dryRun) {
    console.log("\n[Dry Run] No changes made");
    return;
  }

  // Confirm if interactive
  if (process.stdin.isTTY) {
    process.stdout.write("\nProceed? [Y/n] ");
    const reply = await new Promise<string>((resolve) => {
      process.stdin.once("data", (data) => resolve(data.toString().trim().toLowerCase()));
    });
    if (reply === "n" || reply === "no") {
      console.log("Cancelled");
      return;
    }
  }

  // Sync to each target repo
  for (const repo of args.to) {
    console.log(`\nSyncing to ${repo}...`);
    for (const { name, value } of secretsToSync) {
      try {
        setSecret(repo, name, value);
        console.log(`  ✓ ${name}`);
      } catch (e) {
        console.error(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  console.log("\nSync complete!");
}

async function bulkSetCommand(args: BulkSetArgs): Promise<void> {
  console.log(`Finding repos for owner "${args.owner}" with label "${args.label}"...`);

  const repos = findReposByLabel(args.owner, args.label);
  console.log(`Found ${repos.length} non-archived repos with label "${args.label}"`);

  if (repos.length === 0) {
    console.log("No repos to update");
    return;
  }

  // Collect secrets to set
  const secretsToSet: Array<{ name: string; value: string }> = [];

  if (args.fromEnvFile) {
    const envFileEntries = parseEnvFile(args.fromEnvFile);

    for (const [name, entry] of Object.entries(envFileEntries)) {
      let value: string | undefined;

      if (entry.type === "value") {
        value = entry.value;
      } else if (entry.type === "env") {
        value = process.env[entry.value];
        if (value === undefined) {
          console.warn(`Warning: Environment variable "${entry.value}" not found, skipping "${name}"`);
          continue;
        }
      } else if (entry.type === "file") {
        if (!existsSync(entry.value)) {
          console.warn(`Warning: File "${entry.value}" not found, skipping "${name}"`);
          continue;
        }
        value = readFileSync(entry.value, "utf8");
      }

      if (value !== undefined) {
        secretsToSet.push({ name, value });
      }
    }
  } else if (args.secretName && args.secretValue !== undefined) {
    secretsToSet.push({ name: args.secretName, value: args.secretValue });
  } else if (args.secretName) {
    // Try to get from environment
    const envValue = process.env[args.secretName];
    if (envValue !== undefined) {
      secretsToSet.push({ name: args.secretName, value: envValue });
    } else {
      console.error(`Error: Secret value not provided for "${args.secretName}"`);
      process.exit(1);
    }
  } else {
    console.error("Error: Must provide either --from-env-file or --secret-name (with --secret-value or env var)");
    process.exit(1);
  }

  if (secretsToSet.length === 0) {
    console.log("No secrets to set");
    return;
  }

  console.log(`\nWill set ${secretsToSet.length} secret(s) on ${repos.length} repo(s):`);
  console.log(`  Repos: ${repos.join(", ")}`);
  console.log(`  Secrets: ${secretsToSet.map((s) => s.name).join(", ")}`);

  if (args.dryRun) {
    console.log("\n[Dry Run] No changes made");
    return;
  }

  // Confirm if interactive
  if (process.stdin.isTTY) {
    process.stdout.write("\nProceed? [Y/n] ");
    const reply = await new Promise<string>((resolve) => {
      process.stdin.once("data", (data) => resolve(data.toString().trim().toLowerCase()));
    });
    if (reply === "n" || reply === "no") {
      console.log("Cancelled");
      return;
    }
  }

  // Set secrets on each repo
  for (const repo of repos) {
    console.log(`\nSetting secrets on ${repo}...`);
    for (const { name, value } of secretsToSet) {
      try {
        setSecret(repo, name, value);
        console.log(`  ✓ ${name}`);
      } catch (e) {
        console.error(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  console.log("\nBulk set complete!");
}

async function pullCommand(args: PullArgs): Promise<void> {
  console.log(`Fetching secrets from ${args.from}...`);

  const secretNames = listSecretNames(args.from);
  console.log(`Found ${secretNames.length} secrets`);

  if (secretNames.length === 0) {
    console.log("No secrets to write");
    return;
  }

  // Sort names for consistent output
  secretNames.sort();

  const lines: string[] = [
    "# Secrets pulled from " + args.from,
    "#",
    "# Format options:",
    "#   KEY=env://ENV_VAR_NAME     - Read from environment variable",
    "#   KEY=file://./path/to/file  - Read from file (for GPG keys, certs)",
    "#   KEY=value                  - Direct value (not recommended for secrets)",
    "",
  ];

  for (const name of secretNames) {
    if (args.format === "file") {
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

  if (args.dryRun) {
    console.log("\n[Dry Run] Would write to " + args.output + ":");
    console.log(content);
    return;
  }

  writeFileSync(args.output, content, "utf8");
  setSecurePermissions(args.output);
  console.log(`\nWrote ${secretNames.length} secret entries to ${args.output} (permissions: 600)`);
}

async function updateCommand(args: UpdateArgs): Promise<void> {
  const resolvedPath = resolve(args.file);

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
  let inMultiline = false;
  let multilineKey = "";
  let multilineLines: string[] = [];
  const newLines: string[] = [];

  for (const line of lines) {
    // Handle multiline values (lines between key= and next key= or blank line)
    if (inMultiline) {
      // Check if this line starts a new key
      const keyMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
      if (keyMatch || line.trim() === "" || line.startsWith("#")) {
        // End of multiline, process what we collected
        if (multilineKey === args.key) {
          newLines.push(`${args.key}=${args.value}`);
          found = true;
        } else {
          newLines.push(`${multilineKey}=${multilineLines.join("\n")}`);
        }
        inMultiline = false;
        multilineLines = [];
        // Don't skip this line, process it normally
      } else {
        multilineLines.push(line);
        continue;
      }
    }

    // Check if this is a key=value line
    const eqIndex = line.indexOf("=");
    if (eqIndex > 0 && !line.startsWith("#")) {
      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1);

      if (key === args.key) {
        // Check if value continues on next lines (no file:// or env:// prefix)
        if (!value.startsWith("file://") && !value.startsWith("env://")) {
          // Might be multiline, check next line
          inMultiline = true;
          multilineKey = key;
          multilineLines = [value];
          continue;
        }
        newLines.push(`${key}=${args.value}`);
        found = true;
      } else {
        newLines.push(line);
      }
    } else {
      newLines.push(line);
    }
  }

  // Handle case where multiline value was at end of file
  if (inMultiline) {
    if (multilineKey === args.key) {
      newLines.push(`${args.key}=${args.value}`);
      found = true;
    } else {
      newLines.push(`${multilineKey}=${multilineLines.join("\n")}`);
    }
  }

  // If key not found, append it
  if (!found) {
    // Add a blank line if file doesn't end with one
    if (newLines.length > 0 && newLines[newLines.length - 1] !== "") {
      newLines.push("");
    }
    newLines.push(`${args.key}=${args.value}`);
    console.log(`Added ${args.key} to ${args.file}`);
  } else {
    console.log(`Updated ${args.key} in ${args.file}`);
  }

  writeFileSync(resolvedPath, newLines.join("\n") + "\n", "utf8");
  setSecurePermissions(resolvedPath);
}

function printUsage(): void {
  console.log(`
Usage: secrets-sync <command> [options]

Commands:
  sync       Sync secrets from one repo to another
  bulk-set   Set secrets on all repos with a specific label
  pull       Fetch secret names from a repo and create env file template
  update     Update a key in secrets.env file

Sync Options:
  --from, -f <repo>          Source repository (OWNER/REPO format)
  --to, -t <repos>           Target repo(s), comma-separated
  --include, -i <names>      Only sync specific secrets (comma-separated)
  --exclude, -e <names>      Exclude specific secrets (comma-separated)
  --from-env-file <path>     Load values from env file
  --interactive              Prompt for missing values
  --dry-run                  Show what would be done

Bulk Set Options:
  --owner, -o <owner>        GitHub owner/organization (defaults to current user)
  --label, -l <label>        Repository topic/label to filter by
  --secret-name, -n <name>   Secret name to set
  --secret-value, -v <value> Secret value
  --from-env-file <path>     Load secrets from env file
  --dry-run                  Show what would be done

Pull Options:
  --from, -f <repo>          Source repository (OWNER/REPO format)
  --output, -o <path>        Output file path (default: secrets.env)
  --format <format>          Output format: env (default) or file

Update Options:
  --file, -f <path>          Secrets env file path (default: secrets.env)
  --key, -k <name>           Secret name to update
  --value, -v <value>        Secret value

Env File Format:
  # Simple values
  API_KEY=env://API_KEY                    # Read from environment variable
  DATABASE_URL=env://DATABASE_URL
  
  # Multi-line values (GPG keys, certificates)
  GPG_KEY=file://./keys/signing.asc        # Read from file
  
  # Direct values (not recommended for sensitive data)
  DEBUG_MODE=true

Examples:
  # Pull secrets from remote repo to create template
  secrets-sync pull --from org/source-repo
  
  # Pull with file references for GPG keys
  secrets-sync pull --from org/source-repo --format file
  
  # Update a key in secrets.env
  secrets-sync update --key API_KEY --value "new-value"
  secrets-sync update --file ./my-secrets.env --key GPG_KEY --value "file://./keys/new.asc"
  
  # Sync all secrets (values from environment)
  secrets-sync sync --from org/source --to org/target
  
  # Sync with interactive prompting
  secrets-sync sync --from org/source --to org/target --interactive
  
  # Sync from env file with file references
  secrets-sync sync --from org/source --to org/target --from-env-file ./secrets.env
  
  # Bulk set on repos with label
  secrets-sync bulk-set --owner org --label production --from-env-file ./secrets.env
`);
}

function parseArgs(): { command: string; args: SyncArgs | BulkSetArgs | PullArgs | UpdateArgs } | null {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    return null;
  }

  const command = args[0];
  const opts: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--interactive") {
      opts.interactive = true;
    } else if (arg.startsWith("--") || arg.startsWith("-")) {
      const key = arg.replace(/^-+/, "");
      const value = args[i + 1];
      if (value && !value.startsWith("-")) {
        opts[key] = value;
        i++;
      } else {
        opts[key] = true;
      }
    }
  }

  if (command === "sync") {
    if (!opts.from || !opts.to) {
      console.error("Error: sync command requires --from and --to");
      return null;
    }

    return {
      command,
      args: {
        from: String(opts.from),
        to: String(opts.to)
          .split(",")
          .map((s) => s.trim()),
        exclude: opts.exclude
          ? String(opts.exclude)
              .split(",")
              .map((s) => s.trim())
          : undefined,
        include: opts.include
          ? String(opts.include)
              .split(",")
              .map((s) => s.trim())
          : undefined,
        fromEnvFile: opts["from-env-file"] ? String(opts["from-env-file"]) : undefined,
        interactive: opts.interactive === true,
        dryRun: opts.dryRun === true,
      },
    };
  }

  if (command === "bulk-set") {
    if (!opts.label) {
      console.error("Error: bulk-set command requires --label");
      return null;
    }

    const owner = opts.owner ? String(opts.owner) : getCurrentUser();

    return {
      command,
      args: {
        owner,
        label: String(opts.label),
        secretName: opts["secret-name"] || opts.n ? String(opts["secret-name"] || opts.n) : undefined,
        secretValue: opts["secret-value"] || opts.v ? String(opts["secret-value"] || opts.v) : undefined,
        fromEnvFile: opts["from-env-file"] ? String(opts["from-env-file"]) : undefined,
        dryRun: opts.dryRun === true,
      },
    };
  }

  if (command === "pull") {
    if (!opts.from) {
      console.error("Error: pull command requires --from");
      return null;
    }

    const format = opts.format === "file" ? "file" : "env";

    return {
      command,
      args: {
        from: String(opts.from),
        output: opts.output ? String(opts.output) : "secrets.env",
        format,
        dryRun: opts.dryRun === true,
      },
    };
  }

  if (command === "update") {
    if (!opts.key) {
      console.error("Error: update command requires --key");
      return null;
    }
    if (opts.value === undefined) {
      console.error("Error: update command requires --value");
      return null;
    }

    return {
      command,
      args: {
        file: opts.file ? String(opts.file) : "secrets.env",
        key: String(opts.key),
        value: String(opts.value),
      },
    };
  }

  console.error(`Error: Unknown command "${command}"`);
  return null;
}

async function main(): Promise<void> {
  const parsed = parseArgs();

  if (!parsed) {
    printUsage();
    process.exit(1);
  }

  try {
    if (parsed.command === "sync") {
      await syncCommand(parsed.args as SyncArgs);
    } else if (parsed.command === "bulk-set") {
      await bulkSetCommand(parsed.args as BulkSetArgs);
    } else if (parsed.command === "pull") {
      await pullCommand(parsed.args as PullArgs);
    } else if (parsed.command === "update") {
      await updateCommand(parsed.args as UpdateArgs);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

// Only run main if this file is executed directly
const isMainModule = process.argv[1]?.endsWith("secrets-sync.ts") || process.argv[1]?.endsWith("secrets-sync.js");
if (isMainModule) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

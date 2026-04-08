// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, readFileSync, statSync } from "fs";
import { resolve, dirname } from "path";
import type { EnvEntry } from "./types.js";
import { checkFilePermissions } from "./fs-utils.js";
import { logger } from "./logger.js";

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

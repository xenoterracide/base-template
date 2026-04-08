// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { SyncCommand } from "../../src/commands/sync.js";
import type { CommandRunner } from "../../src/types.js";

function createFakeRunner(responses: Map<string, string>): CommandRunner {
  return {
    runArgv: (cmd: string, args: string[]): string => {
      const key = `${cmd} ${args.join(" ")}`;
      const response = responses.get(key);
      if (response === undefined) {
        throw new Error(`Unexpected command: ${key}`);
      }
      return response;
    },
  };
}

describe("SyncCommand", () => {
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "sync-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return error when no target repos", async () => {
    const cmd = new SyncCommand();
    cmd.from = "owner/source";
    cmd.to = ""; // Empty targets
    cmd.dryRun = true;

    const result = await cmd.execute();

    expect(result).toBe(1);
  });

  it("should return success with no matching secrets after filter", async () => {
    const runner = createFakeRunner(
      new Map([["gh secret list --repo owner/source --json name", '[{"name":"SECRET1"}]']]),
    );

    const cmd = new SyncCommand();
    cmd.runner = runner;
    cmd.from = "owner/source";
    cmd.to = "owner/target";
    cmd.include = "NONEXISTENT"; // Won't match any secrets
    cmd.dryRun = true;

    const result = await cmd.execute();

    expect(result).toBe(0); // No secrets to sync
  });

  it("should return error when secrets found but no values provided", async () => {
    const runner = createFakeRunner(
      new Map([["gh secret list --repo owner/source --json name", '[{"name":"API_KEY"},{"name":"SECRET"}]']]),
    );

    const cmd = new SyncCommand();
    cmd.runner = runner;
    cmd.from = "owner/source";
    cmd.to = "owner/target";
    cmd.dryRun = true;

    const result = await cmd.execute();

    expect(result).toBe(1); // Error: no values provided
  });

  it("should apply include filter", async () => {
    const envPath = join(tmpDir, "secrets.env");
    writeFileSync(envPath, "API_KEY=from-env\nSECRET=also-from-env\n", "utf8");

    const runner = createFakeRunner(
      new Map([
        ["gh secret list --repo owner/source --json name", '[{"name":"API_KEY"},{"name":"SECRET"},{"name":"OTHER"}]'],
      ]),
    );

    const cmd = new SyncCommand();
    cmd.runner = runner;
    cmd.from = "owner/source";
    cmd.to = "owner/target";
    cmd.include = "API_KEY,SECRET";
    cmd.fromEnvFile = envPath;
    cmd.dryRun = true;

    const result = await cmd.execute();

    expect(result).toBe(0);
  });

  it("should apply exclude filter", async () => {
    const runner = createFakeRunner(
      new Map([["gh secret list --repo owner/source --json name", '[{"name":"KEEP"},{"name":"REMOVE"}]']]),
    );

    const cmd = new SyncCommand();
    cmd.runner = runner;
    cmd.from = "owner/source";
    cmd.to = "owner/target";
    cmd.exclude = "REMOVE";
    cmd.dryRun = true;

    const result = await cmd.execute();

    expect(result).toBe(1); // KEEP secret only, but no env value so error
  });
});

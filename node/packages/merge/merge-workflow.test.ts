// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateMessage, waitForChecks, type CommandRunner } from "./merge";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Mock child_process
vi.mock("child_process", () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

import { execSync, execFileSync } from "child_process";

describe("generateMessage", () => {
  let tmpDir: string;
  let titleFile: string;
  let bodyFile: string;
  let originalExit: typeof process.exit;
  let runner: CommandRunner;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "msg-test-"));
    titleFile = join(tmpDir, "title.txt");
    bodyFile = join(tmpDir, "body.txt");
    originalExit = process.exit;
    process.exit = vi.fn() as unknown as typeof process.exit;

    runner = {
      run: vi.fn(),
      runSilent: vi.fn(),
      runArgv: vi.fn(),
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    process.exit = originalExit;
    vi.clearAllMocks();
  });

  it.skip("should exit when no changes detected", async () => {
    // Mock git diff to return no changes (exit 0)
    (runner.run as ReturnType<typeof vi.fn>).mockImplementation(() => "");

    await generateMessage(titleFile, bodyFile, tmpDir, runner);

    expect(process.exit).toHaveBeenCalledWith(2);
  });

  it.skip("should generate message with changed files and diff", async () => {
    // Create kimi output file first
    const kimiOut = join(tmpDir, "kimi-out.txt");
    writeFileSync(kimiOut, "feat: test message\n\n- Change 1\n- Change 2", "utf8");

    // Mock git diff to have changes (throw on first call = exit 1)
    (runner.run as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => {
        throw new Error("exit 1");
      })
      .mockImplementationOnce(() => "file1.ts\nfile2.ts") // changed files
      .mockImplementationOnce(() => "diff content"); // changed diff

    const originalEnv = process.env.ENGINE;
    process.env.ENGINE = "kimi";

    (execSync as ReturnType<typeof vi.fn>).mockImplementation(() => "");

    await generateMessage(titleFile, bodyFile, tmpDir, runner);

    expect(runner.run).toHaveBeenCalledWith(expect.stringContaining("git diff --name-only"));
    expect(runner.run).toHaveBeenCalledWith(expect.stringContaining("git diff"));

    process.env.ENGINE = originalEnv;
  });
});

describe("waitForChecks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should call gh pr checks with watch flag", async () => {
    (execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => "");

    await waitForChecks("/repo/root");

    expect(execFileSync).toHaveBeenCalledWith(
      "gh",
      ["pr", "checks", "--fail-fast", "--watch"],
      expect.objectContaining({ stdio: "inherit", cwd: "/repo/root" }),
    );
  });

  it("should exit when checks fail", async () => {
    const originalExit = process.exit;
    process.exit = vi.fn() as unknown as typeof process.exit;

    (execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("checks failed");
    });

    await waitForChecks("/repo/root");

    expect(process.exit).toHaveBeenCalledWith(1);

    process.exit = originalExit;
  });
});

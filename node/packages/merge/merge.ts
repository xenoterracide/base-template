#!/usr/bin/env tsx

// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync, execSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ENGINE = process.env.ENGINE || "kimi";

export interface CommandRunner {
  run(cmd: string, opts?: { cwd?: string; env?: Record<string, string> }): string;
  runSilent(cmd: string, args: string[], opts?: { cwd?: string }): string;
  // Safer argv-based execution to avoid shell injection
  runArgv(cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }): string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FileSystem = any;

/**
 * Find the main git repository root (not a submodule).
 * This is needed because the script may run from within a submodule.
 */
export function findMainRepoRoot(
  cwd: string = process.cwd(),
  fs: Pick<FileSystem, "existsSync"> = { existsSync },
): string {
  // Walk up to find the top-level git directory that is not a submodule
  let currentDir = cwd;
  while (true) {
    const gitDir = join(currentDir, ".git");
    if (fs.existsSync(gitDir)) {
      // Check if this is a submodule by looking for .gitmodules in parent
      const parentDir = join(currentDir, "..");
      const parentGitmodules = join(parentDir, ".gitmodules");
      // If parent has .gitmodules, we're likely in a submodule, go up
      if (fs.existsSync(parentGitmodules)) {
        currentDir = parentDir;
      } else {
        // Found the main repo root
        return currentDir;
      }
    } else {
      const parentDir = join(currentDir, "..");
      // Stop if we've reached the filesystem root (handles Windows and Unix)
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }
  }
  // Fallback: use git rev-parse to find the top-level
  return execSync("git rev-parse --show-toplevel", { encoding: "utf8", cwd }).trim();
}

const MAIN_REPO_ROOT = findMainRepoRoot();

function createDefaultCommandRunner(repoRoot: string = MAIN_REPO_ROOT): CommandRunner {
  return {
    run(cmd: string, opts?: { cwd?: string; env?: Record<string, string> }): string {
      const isGitCommand = cmd.startsWith("git ") || cmd.startsWith("gh ");
      const cwd = opts?.cwd ?? (isGitCommand ? repoRoot : undefined);
      return execSync(cmd, { encoding: "utf8", cwd, env: { ...process.env, ...opts?.env } }).trim();
    },
    runSilent(cmd: string, args: string[], opts?: { cwd?: string }): string {
      try {
        const isGitCommand = cmd === "git" || cmd === "gh";
        const cwd = opts?.cwd ?? (isGitCommand ? repoRoot : undefined);
        return execFileSync(cmd, args, { encoding: "utf8", cwd }).trim();
      } catch {
        return "";
      }
    },
    runArgv(cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }): string {
      const isGitCommand = cmd === "git" || cmd === "gh";
      const cwd = opts?.cwd ?? (isGitCommand ? repoRoot : undefined);
      return execFileSync(cmd, args, { encoding: "utf8", cwd, env: { ...process.env, ...opts?.env } }).trim();
    },
  };
}

const defaultRunner = createDefaultCommandRunner();

export function getBranch(runner: CommandRunner = defaultRunner): string {
  return runner.run("git branch --show-current");
}

export function hasPR(branch?: string, runner: CommandRunner = defaultRunner): boolean {
  try {
    const args = ["pr", "view", "--json", "number"];
    if (branch) {
      args.push(branch);
    }
    runner.runArgv("gh", args);
    return true;
  } catch {
    return false;
  }
}

export function getHead(runner: CommandRunner = defaultRunner): string {
  return runner.run("git rev-parse --verify HEAD");
}

export async function generateMessage(
  titleFile: string,
  bodyFile: string,
  tmpDir: string,
  runner: CommandRunner = defaultRunner,
): Promise<void> {
  const diffRange = "origin/HEAD...HEAD";

  // Check for changes
  try {
    runner.run(`git diff --quiet --exit-code ${diffRange}`);
    console.log("No changes to generate message for");
    process.exit(2);
  } catch {
    // Has changes, continue
  }

  const changedFiles = runner.run(`git diff --name-only ${diffRange}`).split("\n").slice(0, 400).join("\n");
  const changedDiff = runner.run(`git diff ${diffRange}`).split("\n").slice(0, 2000).join("\n");

  if (ENGINE === "kimi") {
    await generateWithKimi(titleFile, bodyFile, changedDiff, tmpDir);
  } else if (ENGINE === "junie") {
    await generateWithJunie(titleFile, bodyFile, changedDiff, tmpDir);
  } else {
    await generateWithCopilot(titleFile, bodyFile, changedDiff, changedFiles, tmpDir);
  }
}

async function generateWithKimi(titleFile: string, bodyFile: string, diff: string, tmpDir: string): Promise<void> {
  const skillsDir = ".agents/skills";
  const hasSkillsDir = existsSync(skillsDir);

  const prompt = `Generate a conventional commit message for the following diff and write the subject line to '${titleFile}' and the body to '${bodyFile}'. Do not run any tests or gradle commands.

Diff:
${diff}`;

  const promptFile = join(tmpDir, "kimi-prompt.txt");
  writeFileSync(promptFile, prompt, "utf8");

  const kimiArgs = ["--no-thinking", "--quiet"];
  if (hasSkillsDir) {
    kimiArgs.unshift("--skills-dir", skillsDir);
  }

  const kimiOut = join(tmpDir, "kimi-out.txt");

  try {
    try {
      execSync(`kimi ${kimiArgs.join(" ")} < "${promptFile}" > "${kimiOut}" 2>&1 || true`, {
        encoding: "utf8",
        shell: "/bin/bash",
      });
    } catch {
      // Ignore errors, check output below
    }

    try {
      readFileSync(titleFile, "utf8");
      console.log("kimi wrote title/body directly");
      return;
    } catch {
      if (!existsSync(kimiOut)) {
        throw new Error("kimi failed to generate message");
      }
      const output = readFileSync(kimiOut, "utf8");
      await parseAndWriteMessage(output, titleFile, bodyFile);
    }
  } finally {
    try {
      unlinkSync(promptFile);
      unlinkSync(kimiOut);
    } catch {}
  }
}

async function generateWithJunie(titleFile: string, bodyFile: string, diff: string, tmpDir: string): Promise<void> {
  const promptFile = join(tmpDir, "junie-prompt.txt");
  const prompt = `Generate a conventional commit message for the following diff and write the subject line to '${titleFile}' and the body to '${bodyFile}'. Do not run any tests or gradle commands.

Diff:
${diff}`;
  writeFileSync(promptFile, prompt, "utf8");

  try {
    execFileSync("junie", ["--skip-update-check", "--cache-dir=.junie/cache", "--prompt-file", promptFile], {
      encoding: "utf8",
    });
    readFileSync(titleFile, "utf8");
    return;
  } catch {
    try {
      const output = execFileSync(
        "junie",
        ["--skip-update-check", "--cache-dir=.junie/cache", "--output-format=json", "--prompt-file", promptFile],
        { encoding: "utf8" },
      );
      const result = execFileSync("jq", ["-r", ".result"], { input: output, encoding: "utf8" });
      await parseAndWriteMessage(result.trim(), titleFile, bodyFile);
    } catch {
      throw new Error("junie failed to generate message");
    }
  } finally {
    try {
      unlinkSync(promptFile);
    } catch {}
  }
}

async function generateWithCopilot(
  titleFile: string,
  bodyFile: string,
  diff: string,
  files: string,
  tmpDir: string,
): Promise<void> {
  const allowedTypes = "ci feat fix perf refactor style test build ops docs chore merge revert";

  const promptFile = join(tmpDir, "copilot-prompt.txt");
  const prompt = `You are writing a git commit message for a human developer.

You MUST follow this exact template:

<type>(<scope>): <summary>

<body>

Rules:
- Output plain text only. No markdown fences.
- First line MUST be a valid Conventional Commit subject.
- Keep the FIRST line <= 72 characters.
- Use a specific scope when possible.
- Body:
  - Provide 0-6 bullet points.
  - Explain WHAT changed and WHY.
  - Wrap body lines to <= 72 characters.
  - Do not repeat the subject.

IMPORTANT: Use ONLY these commit types: ${allowedTypes}
If unsure, choose 'chore'.

Changed files:
${files}

Diff:
${diff}`;
  writeFileSync(promptFile, prompt, "utf8");

  const copilotOut = join(tmpDir, "copilot-out.txt");
  const copilotErr = join(tmpDir, "copilot-err.txt");

  try {
    const model = process.env.COPILOT_PRMSG_MODEL || "gpt-5.1-codex-mini";
    try {
      const result = execFileSync("copilot", ["--model", model, "-s", "-p", promptFile], {
        encoding: "utf8",
      });
      writeFileSync(copilotOut, result, "utf8");
    } catch (e: unknown) {
      const stderr = e && typeof e === "object" && "stderr" in e ? String((e as { stderr: unknown }).stderr) : "";
      writeFileSync(copilotErr, stderr, "utf8");
    }

    let output = readFileSync(copilotOut, "utf8");
    const err = readFileSync(copilotErr, "utf8");

    if (!output && err.includes("enable this model")) {
      const fallback = process.env.COPILOT_PRMSG_FALLBACK_MODEL || "gpt-5.1-codex";
      try {
        const result = execFileSync("copilot", ["--model", fallback, "-s", "-p", promptFile], {
          encoding: "utf8",
        });
        writeFileSync(copilotOut, result, "utf8");
      } catch (e) {
        console.warn("Warning: Fallback model also failed:", e instanceof Error ? e.message : String(e));
      }
      output = readFileSync(copilotOut, "utf8");
    }

    await parseAndWriteMessage(output, titleFile, bodyFile);
  } finally {
    try {
      unlinkSync(promptFile);
      unlinkSync(copilotOut);
      unlinkSync(copilotErr);
    } catch {}
  }
}

export async function parseAndWriteMessage(
  aiOutput: string,
  titleFile: string,
  bodyFile: string,
  fs: FileSystem = { existsSync, readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync },
): Promise<void> {
  const allowedTypes = "ci feat fix perf refactor style test build ops docs chore merge revert";
  const lines = aiOutput.replace(/\r/g, "").split("\n");

  // Find subject line matching conventional commit pattern
  let subject = "";
  const allowedTypesAlt = allowedTypes.replace(/ /g, "|");
  const pattern = new RegExp(`^(${allowedTypesAlt})(\\(([^)]+)\\))?(!)?: .+`);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(pattern);
    if (match) {
      subject = trimmed;
      break;
    }
  }

  // Clean up common prefixes
  subject = subject.replace(/^(I'll|I will|Sure,?|Here's|Proposed|Suggested)[: -]+/i, "");

  if (!subject) {
    // Check if there's an existing valid PR message to preserve
    try {
      const existing = fs.readFileSync(titleFile, { encoding: "utf8" }).trim();
      if (existing && !existing.match(/^error\([^)]+\):/)) {
        console.log("Preserving existing PR message");
        process.exit(0);
      }
    } catch {}

    console.error("ERROR: Failed to generate valid conventional commit subject");
    if (aiOutput) {
      console.error("--- AI Output ---");
      console.error(aiOutput);
    }
    process.exit(1);
  }

  // Extract body (lines after first blank line after subject)
  let subjectFound = false;
  let blankFound = false;
  const bodyLines: string[] = [];

  for (const line of lines) {
    if (!subjectFound) {
      if (line.trim() === subject) subjectFound = true;
      continue;
    }
    if (!blankFound) {
      if (line.trim() === "") blankFound = true;
      continue;
    }
    bodyLines.push(line);
  }

  // Clean up body
  const body = bodyLines
    .filter((l) => !l.match(/^(I'll|I will|Sure|Here's|Proposed|Suggested|I inspected|Let's)\b/i))
    .slice(0, 12)
    .join("\n")
    .trim();

  fs.writeFileSync(titleFile, subject.substring(0, 72) + "\n", { encoding: "utf8" });
  fs.writeFileSync(bodyFile, body, { encoding: "utf8" });
}

async function waitForChecks(repoRoot: string = MAIN_REPO_ROOT): Promise<void> {
  console.log("Waiting for PR checks to complete...");

  try {
    execFileSync("gh", ["pr", "checks", "--fail-fast", "--watch"], { stdio: "inherit", cwd: repoRoot });
  } catch {
    console.error("Error: PR checks failed or timed out.");
    process.exit(1);
  }
}

export async function createOrUpdatePR(
  branch: string,
  runner: CommandRunner = defaultRunner,
  fs: FileSystem = { existsSync, readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync },
): Promise<void> {
  const tmpDir = fs.mkdtempSync(join(tmpdir(), "pr-"));
  const titleFile = join(tmpDir, "title.txt");
  const bodyFile = join(tmpDir, "body.txt");

  const headBefore = getHead(runner);

  try {
    if (hasPR(branch, runner)) {
      console.log("Updating PR message...");
    }

    await generateMessage(titleFile, bodyFile, tmpDir, runner);
    const headAfter = getHead(runner);

    // Regenerate if HEAD changed during generation
    if (headBefore !== headAfter) {
      await generateMessage(titleFile, bodyFile, tmpDir, runner);
    }

    const title = fs.readFileSync(titleFile, { encoding: "utf8" }).trim();

    if (hasPR(branch, runner)) {
      // Use runArgv to avoid shell injection with title
      runner.runArgv("gh", ["pr", "edit", branch, "--title", title, "--body-file", bodyFile]);
      try {
        // Use env option instead of inline shell variable
        runner.runArgv("gh", ["pr", "view", branch], { env: { GH_PAGER: "cat" } });
      } catch (e) {
        console.warn("Warning: Could not view PR after edit:", e instanceof Error ? e.message : String(e));
      }
    } else {
      // Verify we're still on the expected branch before creating PR
      const currentBranch = getBranch(runner);
      if (currentBranch !== branch) {
        console.error(`Error: Branch changed from "${branch}" to "${currentBranch}". Aborting PR creation.`);
        process.exit(1);
      }
      // Use runArgv to avoid shell injection with title
      runner.runArgv("gh", ["pr", "create", "--title", title, "--body-file", bodyFile]);
      console.log("PR created with generated message.");
      try {
        // Use env option instead of inline shell variable
        runner.runArgv("gh", ["pr", "view", branch], { env: { GH_PAGER: "cat" } });
      } catch (e) {
        console.warn("Warning: Could not view PR after creation:", e instanceof Error ? e.message : String(e));
      }
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const dryRun = args.includes("--dry-run");

  if (command === "pr-message") {
    let titleFile = "";
    let bodyFile = "";

    for (let i = 1; i < args.length; i += 2) {
      if (args[i] === "--title-file") titleFile = args[i + 1];
      if (args[i] === "--body-file") bodyFile = args[i + 1];
    }

    if (!titleFile || !bodyFile) {
      console.error("Usage: merge.ts pr-message --title-file PATH --body-file PATH");
      process.exit(2);
    }

    const tmpDir = mkdtempSync(join(tmpdir(), "prmsg-"));
    try {
      await generateMessage(titleFile, bodyFile, tmpDir);
    } finally {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
    return;
  }

  // Full merge workflow
  // Capture branch name BEFORE any git operations that might change it
  const currentBranch = getBranch();
  console.log(`Current branch: ${currentBranch}`);

  console.log("Fetching and merging origin/HEAD...");
  defaultRunner.run("git fetch --all --prune --prune-tags --tags --force");
  defaultRunner.run("git merge origin/HEAD");

  console.log("Pushing...");
  defaultRunner.run("git push");

  const hasExistingPR = hasPR(currentBranch);

  if (hasExistingPR) {
    await waitForChecks();
    await createOrUpdatePR(currentBranch);
  } else {
    await createOrUpdatePR(currentBranch);
    await waitForChecks();
  }

  if (dryRun) {
    console.log("\n[Dry Run] Would proceed with squash merge. Exiting without merging.");
    process.exit(0);
  }

  // Merge squash
  const hasUncommitted = defaultRunner.runSilent("git", ["status", "--porcelain=1"]) !== "";
  if (hasUncommitted) {
    console.warn("WARNING: Uncommitted changes detected. Review before merge.");
  }

  process.stdout.write("Proceed with squash merge? [Y/n] ");

  if (!process.stdin.isTTY) {
    console.error("Interactive confirmation required, but no TTY is available. Aborting squash merge.");
    process.exit(1);
  }

  const reply = await new Promise<string>((resolve) => {
    process.stdin.once("data", (data) => resolve(data.toString().trim().toLowerCase()));
  });

  if (reply === "n" || reply === "no") {
    console.log("Merge cancelled.");
    process.exit(1);
  }

  defaultRunner.run("gh pr merge --squash --delete-branch --admin");
  process.exit(0);
}

// Only run main if this file is executed directly (not imported for testing)
// Check if we're the entry point by comparing process.argv[1]
const isMainModule = process.argv[1]?.endsWith("merge.ts") || process.argv[1]?.endsWith("merge.js");
if (isMainModule) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

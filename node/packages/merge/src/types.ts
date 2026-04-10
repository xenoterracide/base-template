// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

export interface CommandRunner {
  run: (cmd: string, opts?: { cwd?: string; env?: Record<string, string> }) => string;
  runSilent: (cmd: string, args: string[], opts?: { cwd?: string }) => string;
  runArgv: (cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }) => string;
}

export interface FileSystem {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, options: { encoding: string }) => string;
  writeFileSync: (path: string, data: string, options: { encoding: string }) => void;
  unlinkSync: (path: string) => void;
  mkdtempSync: (prefix: string) => string;
  rmSync: (path: string, options: { recursive: boolean; force: boolean }) => void;
}

export type Engine = "kimi" | "junie" | "copilot";

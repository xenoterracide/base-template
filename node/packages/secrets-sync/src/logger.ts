// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Logger } from "pino";

// Pino is a CommonJS module, use require for compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pino = require("pino") as (options: unknown, destination?: unknown) => Logger;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pinoPretty = require("pino-pretty") as (options: unknown) => unknown;

// Use pino-pretty as a destination (sync) instead of transport (async worker)
export const logger = pino(
  {
    level: "info",
  },
  pinoPretty({
    colorize: true,
    translateTime: false,
    ignore: "pid,hostname,time",
  }),
);

export function setLogLevel(level: "info" | "debug"): void {
  logger.level = level;
}

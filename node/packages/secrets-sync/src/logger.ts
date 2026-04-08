// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Logger } from "pino";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pino = require("pino") as (options: unknown) => Logger;

export const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: false,
      ignore: "pid,hostname",
    },
  },
});

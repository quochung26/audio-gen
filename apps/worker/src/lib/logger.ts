type Level = "debug" | "info" | "warn" | "error";

const COLORS: Record<Level, string> = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};
const RESET = "\x1b[0m";

const showDebug = process.env.LOG_LEVEL === "debug" || process.env.NODE_ENV !== "production";

function log(level: Level, msg: string, meta?: unknown) {
  if (level === "debug" && !showDebug) return;
  const time = new Date().toISOString().slice(11, 19);
  const line = `${COLORS[level]}${time} ${level.toUpperCase().padEnd(5)}${RESET} ${msg}`;
  if (meta !== undefined) console.log(line, meta);
  else console.log(line);
}

export const logger = {
  debug: (m: string, meta?: unknown) => log("debug", m, meta),
  info: (m: string, meta?: unknown) => log("info", m, meta),
  warn: (m: string, meta?: unknown) => log("warn", m, meta),
  error: (m: string, meta?: unknown) => log("error", m, meta),
};

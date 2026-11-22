import { redact } from "./providers/redact";

/**
 * Structured logging: one JSON object per line, so a log search can filter by level and event. Nothing secret is
 * written. Free text is scrubbed (database addresses with passwords, bearer tokens, API key and password
 * assignments, long hex strings), and objects go through the same key-based redaction used for provider calls.
 */
const PATTERNS: [RegExp, string][] = [
  [/mongodb(?:\+srv)?:\/\/[^@\s]+@/gi, "mongodb://[redacted]@"],
  [/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g, "Bearer [redacted]"],
  [
    /(api[-_ ]?key|secret[-_ ]?key|public[-_ ]?key|client[-_ ]?secret|password|passwd|token|authorization)(["']?\s*[:=]\s*["']?)[^\s"',}]{6,}/gi,
    "$1$2[redacted]",
  ],
  [/\b(?:SK|PK)_[A-Za-z0-9]{12,}\b/g, "[redacted]"],
  [/\b[A-Fa-f0-9]{40,}\b/g, "[redacted-hex]"],
];

export function scrub(text: string): string {
  let out = String(text);
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  return out.length > 2000 ? `${out.slice(0, 2000)}…` : out;
}

type Level = "info" | "warn" | "error";

function describe(v: unknown): Record<string, unknown> {
  if (v instanceof Error) return { error: scrub(v.message), errorName: v.name };
  if (typeof v === "string") return { detail: scrub(v) };
  if (v && typeof v === "object") {
    const r = redact(v) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(r).map(([k, x]) => [
        k,
        typeof x === "string" ? scrub(x) : x,
      ]),
    );
  }
  return v === undefined ? {} : { detail: scrub(String(v)) };
}

function write(level: Level, msg: string, rest: unknown[]) {
  const line = {
    t: new Date().toISOString(),
    level,
    msg: scrub(msg),
    ...rest.reduce<Record<string, unknown>>(
      (a, v) => ({ ...a, ...describe(v) }),
      {},
    ),
  };
  // One line of JSON. Never throw from a logger.
  try {
    const text = JSON.stringify(line);
    if (level === "error") console.error(text);
    else if (level === "warn") console.warn(text);
    else console.log(text);
  } catch {
    console.error(`{"level":"error","msg":"log serialisation failed"}`);
  }
}

export const log = {
  info: (msg: string, ...rest: unknown[]) => write("info", msg, rest),
  warn: (msg: string, ...rest: unknown[]) => write("warn", msg, rest),
  error: (msg: string, ...rest: unknown[]) => write("error", msg, rest),
};

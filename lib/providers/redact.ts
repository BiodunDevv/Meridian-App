/** Keys whose values must never be logged or stored. Matched case-insensitively, anywhere in the object. */
const SECRET_KEYS =
  /^(api-?key|public-?key|secret-?key|authorization|client_?secret|client_?id|access_?token|token|purchased_?code|pin_?code|card_?number|redemption_?url|password|cookie|x-.*-?signature)$/i;

/** Deep copy with secret values replaced. Safe to store or print. Depth and size are capped. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[deep]";
  if (Array.isArray(value))
    return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
    return out;
  }
  if (typeof value === "string" && value.length > 500)
    return `${value.slice(0, 500)}…`;
  return value;
}

/** Headers with credentials removed, for logging a request. */
export function redactHeaders(h: Record<string, string>) {
  return redact(h) as Record<string, string>;
}

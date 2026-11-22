export interface HttpResult {
  /** HTTP status, or 0 when there was no response at all. */
  status: number;
  json: unknown;
  /** True when the request timed out or the network failed: the other side may still have acted. */
  noResponse: boolean;
}

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * One HTTP call with a timeout. It never throws: a timeout or network error comes back as
 * `noResponse`, so a caller cannot mistake it for a refusal and buy twice.
 */
export async function httpJson(
  doFetch: FetchLike,
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
  } = {},
): Promise<HttpResult> {
  try {
    const res = await doFetch(url, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: { "content-type": "application/json", ...init.headers },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null; // an HTML error page or a truncated body: treated as an unclear reply
    }
    return { status: res.status, json, noResponse: false };
  } catch {
    return { status: 0, json: null, noResponse: true };
  }
}

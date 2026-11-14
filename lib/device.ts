/** Turns a raw user-agent string into a readable device name, e.g. "Chrome on macOS". No dependencies. */
export interface Device {
  browser: string;
  os: string;
  kind: "desktop" | "phone" | "tablet";
  /** "Chrome on macOS" */
  name: string;
}

export function parseDevice(ua?: string | null): Device {
  const s = ua ?? "";
  if (!s)
    return {
      browser: "Unknown browser",
      os: "Unknown system",
      kind: "desktop",
      name: "Unknown device",
    };

  const os = /Windows NT 10|Windows NT 11/i.test(s)
    ? "Windows"
    : /Windows/i.test(s)
      ? "Windows"
      : /iPhone|iPod/i.test(s)
        ? "iPhone"
        : /iPad/i.test(s) || (/Macintosh/i.test(s) && /Mobile/i.test(s))
          ? "iPad"
          : /Android/i.test(s)
            ? "Android"
            : /CrOS/i.test(s)
              ? "ChromeOS"
              : /Mac OS X|Macintosh/i.test(s)
                ? "macOS"
                : /Linux|X11/i.test(s)
                  ? "Linux"
                  : "Unknown system";

  // Order matters: many browsers also say "Chrome" and "Safari".
  const browser = /Edg(e|A|iOS)?\//i.test(s)
    ? "Edge"
    : /OPR\/|Opera/i.test(s)
      ? "Opera"
      : /SamsungBrowser/i.test(s)
        ? "Samsung Internet"
        : /Firefox|FxiOS/i.test(s)
          ? "Firefox"
          : /Brave/i.test(s)
            ? "Brave"
            : /CriOS|Chrome|Chromium/i.test(s)
              ? "Chrome"
              : /Safari/i.test(s)
                ? "Safari"
                : /node|curl|python|okhttp|axios/i.test(s)
                  ? "Script"
                  : "Unknown browser";

  const kind: Device["kind"] =
    os === "iPad" || (os === "Android" && !/Mobile/i.test(s))
      ? "tablet"
      : os === "iPhone" || os === "Android"
        ? "phone"
        : "desktop";

  const name =
    browser === "Unknown browser" && os === "Unknown system"
      ? "Unknown device"
      : browser === "Unknown browser"
        ? os
        : os === "Unknown system"
          ? browser
          : `${browser} on ${os}`;
  return { browser, os, kind, name };
}

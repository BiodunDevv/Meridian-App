/**
 * Meridian email design module.
 *
 * Templates are written as a list of typed blocks and rendered to
 * email-safe HTML (tables, inline styles, bulletproof button, dark-mode
 * overrides) plus a plain-text alternative. Change the tokens below to
 * restyle every email at once.
 */

export const tokens = {
  brand: "#2459f2",
  gold: "#d4af37",
  goldText: "#8a6508",
  navy: "#0a1230",
  body: "#3b4560",
  muted: "#6b7694",
  page: "#f4f6fb",
  card: "#ffffff",
  border: "#e4e8f2",
  soft: "#f6f8fd",
  success: "#16a34a",
  danger: "#dc2626",
  font: "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'SF Mono', Menlo, Consolas, monospace",
};

export type Tone = "info" | "success" | "warn" | "danger";

export type Block =
  | { t: "h"; text: string }
  | { t: "p"; text: string }
  | { t: "small"; text: string }
  | { t: "button"; label: string; url: string }
  | { t: "details"; rows: [label: string, value: string][] }
  | { t: "callout"; tone: Tone; text: string }
  | { t: "code"; text: string }
  | { t: "divider" };

export interface RenderOptions {
  /** Inbox preview text. */
  preheader: string;
  blocks: Block[];
  brandName: string;
  siteUrl: string;
  /** Extra line in the footer, e.g. why the user received this. */
  reason?: string;
  riskLine?: string;
}

export interface Rendered {
  html: string;
  text: string;
}

export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** Escapes text, then turns **bold** into <strong> and keeps newlines. */
const rich = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1");

const toneColor: Record<Tone, { bar: string; bg: string; darkBg: string }> = {
  info: { bar: tokens.brand, bg: "#eef3ff", darkBg: "#16203f" },
  success: { bar: tokens.success, bg: "#eefbf3", darkBg: "#12301f" },
  warn: { bar: tokens.gold, bg: "#fdf8e9", darkBg: "#33290c" },
  danger: { bar: tokens.danger, bg: "#fdf0f0", darkBg: "#3a1616" },
};

function block(b: Block, i: number): string {
  switch (b.t) {
    case "h":
      return `<tr><td class="txt" style="padding:4px 32px 8px;font-size:22px;line-height:1.3;font-weight:700;color:${tokens.navy};letter-spacing:-0.01em">${esc(b.text)}</td></tr>`;
    case "p":
      return `<tr><td class="body" style="padding:6px 32px;font-size:15px;line-height:1.7;color:${tokens.body}">${rich(b.text)}</td></tr>`;
    case "small":
      return `<tr><td class="muted" style="padding:6px 32px;font-size:13px;line-height:1.6;color:${tokens.muted}">${rich(b.text)}</td></tr>`;
    case "button":
      return `<tr><td style="padding:14px 32px 10px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${tokens.brand}" style="border-radius:8px;background:${tokens.brand}"><a href="${esc(b.url)}" target="_blank" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;font-family:${tokens.font}">${esc(b.label)}</a></td></tr></table></td></tr>`;
    case "details":
      return `<tr><td style="padding:10px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="soft" style="background:${tokens.soft};border:1px solid ${tokens.border};border-radius:10px">${b.rows
        .map(
          ([l, v], idx) =>
            `<tr><td class="muted" style="padding:${idx === 0 ? 14 : 8}px 16px ${idx === b.rows.length - 1 ? 14 : 8}px;font-size:13px;color:${tokens.muted};width:40%;vertical-align:top">${esc(l)}</td><td class="txt" align="right" style="padding:${idx === 0 ? 14 : 8}px 16px ${idx === b.rows.length - 1 ? 14 : 8}px;font-size:14px;font-weight:600;color:${tokens.navy};word-break:break-word">${esc(v)}</td></tr>`,
        )
        .join("")}</table></td></tr>`;
    case "callout": {
      const c = toneColor[b.tone];
      return `<tr><td style="padding:10px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="callout-${b.tone}" style="background:${c.bg};border-left:4px solid ${c.bar};border-radius:8px"><tr><td class="body" style="padding:12px 16px;font-size:14px;line-height:1.6;color:${tokens.body}">${rich(b.text)}</td></tr></table></td></tr>`;
    }
    case "code":
      return `<tr><td style="padding:10px 32px"><div class="soft txt" style="background:${tokens.soft};border:1px solid ${tokens.border};border-radius:8px;padding:12px 14px;font-family:${tokens.mono};font-size:13px;color:${tokens.navy};word-break:break-all">${esc(b.text)}</div></td></tr>`;
    case "divider":
      return `<tr><td style="padding:12px 32px"><div class="line" style="height:1px;background:${tokens.border};line-height:1px;font-size:1px">&nbsp;</div></td></tr>`;
    default:
      return `<!-- ${i} -->`;
  }
}

const darkCss = `
@media (prefers-color-scheme: dark) {
  .page { background:#08090d !important; }
  .card { background:#0d0f16 !important; border-color:#1d2130 !important; }
  .txt { color:#f3f6ff !important; }
  .body { color:#c3c8d8 !important; }
  .muted { color:#8b91a4 !important; }
  .soft { background:#141722 !important; border-color:#1d2130 !important; }
  .line { background:#1d2130 !important; }
  .callout-info { background:${toneColor.info.darkBg} !important; }
  .callout-success { background:${toneColor.success.darkBg} !important; }
  .callout-warn { background:${toneColor.warn.darkBg} !important; }
  .callout-danger { background:${toneColor.danger.darkBg} !important; }
}`;

export function renderEmail(opts: RenderOptions): Rendered {
  const { preheader, blocks, brandName, siteUrl, reason, riskLine } = opts;
  const links = [
    ["Terms", `${siteUrl}/terms`],
    ["Privacy", `${siteUrl}/privacy`],
    ["Risk disclosure", `${siteUrl}/risk`],
  ];

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(brandName)}</title>
<style>${darkCss}</style>
</head>
<body class="page" style="margin:0;padding:0;background:${tokens.page};font-family:${tokens.font}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}${"&nbsp;&zwnj;".repeat(20)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="page" style="background:${tokens.page}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" class="card" style="width:100%;max-width:560px;background:${tokens.card};border:1px solid ${tokens.border};border-top:4px solid ${tokens.brand};border-radius:14px">
<tr><td style="padding:26px 32px 10px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="30" height="30" align="center" bgcolor="${tokens.brand}" style="width:30px;height:30px;background:${tokens.brand};border-radius:8px;color:#ffffff;font-size:15px;line-height:30px;font-weight:700">&#9650;</td>
<td class="txt" style="padding-left:10px;font-size:18px;font-weight:700;color:${tokens.navy};letter-spacing:-0.01em">${esc(brandName)}</td>
</tr></table></td></tr>
${blocks.map(block).join("\n")}
<tr><td style="padding:18px 32px 4px"><div class="line" style="height:1px;background:${tokens.border};line-height:1px;font-size:1px">&nbsp;</div></td></tr>
<tr><td class="muted" style="padding:10px 32px 6px;font-size:12px;line-height:1.6;color:${tokens.muted}">${esc(riskLine ?? "")}</td></tr>
<tr><td class="muted" style="padding:2px 32px 26px;font-size:12px;line-height:1.6;color:${tokens.muted}">${reason ? esc(reason) + "<br>" : ""}${links.map(([l, u]) => `<a href="${u}" style="color:${tokens.brand};text-decoration:none">${l}</a>`).join(" &middot; ")}</td></tr>
</table>
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px"><tr><td class="muted" align="center" style="padding:16px;font-size:11px;color:${tokens.muted}">&copy; ${new Date().getFullYear()} ${esc(brandName)}</td></tr></table>
</td></tr></table></body></html>`;

  const text = [
    brandName.toUpperCase(),
    "",
    ...blocks.map((b) => {
      switch (b.t) {
        case "h":
          return `${b.text}\n${"-".repeat(Math.min(b.text.length, 40))}`;
        case "p":
        case "small":
          return plain(b.text);
        case "button":
          return `${b.label}: ${b.url}`;
        case "details":
          return b.rows.map(([l, v]) => `${l}: ${v}`).join("\n");
        case "callout":
          return `Note: ${plain(b.text)}`;
        case "code":
          return b.text;
        default:
          return "";
      }
    }),
    "",
    riskLine ?? "",
    reason ?? "",
    links.map(([l, u]) => `${l}: ${u}`).join(" | "),
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");

  return { html, text };
}

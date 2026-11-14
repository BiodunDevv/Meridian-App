import { ImageResponse } from "next/og";

const SIZES = ["180", "192", "512", "512-maskable"];

export const dynamicParams = false;
export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size } = await params;
  const maskable = size.endsWith("-maskable");
  const px = parseInt(size, 10);
  // Maskable icons keep the mark inside the central safe zone; others fill more of the tile.
  const mark = Math.round(px * (maskable ? 0.46 : 0.6));

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(ellipse 80% 60% at 50% 110%, #2459f2 0%, #0b1230 55%, #08090d 100%)",
        borderRadius: maskable ? 0 : Math.round(px * 0.22),
      }}
    >
      <svg width={mark} height={mark} viewBox="0 0 32 32">
        <rect width="32" height="32" rx="8" fill="#2459f2" />
        <path
          d="M8.5 21.5V9.5l7.5 7.5 7.5-7.5v12"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M7 26h18"
          stroke="#d4af37"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </div>,
    { width: px, height: px },
  );
}

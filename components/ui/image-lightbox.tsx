"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const OPEN_MS = 440;
const CLOSE_MS = 320;
const RADIUS = 12;
/** The resting clip is wider than the frame so it never cuts the shadow. */
const REST_CLIP = `inset(-80px -80px -80px -80px round ${RADIUS}px)`;

type Size = { width: number; height: number };

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The keyframe that makes the full-size frame look like the thumbnail it came from: a uniform scale (so the
 * image never stretches), a move between the two centres, and a clip that crops the frame to the thumbnail's box.
 */
function originKeyframe(
  frame: DOMRect,
  origin: DOMRect,
  radius: number,
): Keyframe {
  const scale = Math.max(
    origin.width / frame.width,
    origin.height / frame.height,
  );
  const dx = origin.left + origin.width / 2 - (frame.left + frame.width / 2);
  const dy = origin.top + origin.height / 2 - (frame.top + frame.height / 2);
  const insetX = Math.max(0, (frame.width - origin.width / scale) / 2);
  const insetY = Math.max(0, (frame.height - origin.height / scale) / 2);
  return {
    transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
    clipPath: `inset(${insetY}px ${insetX}px ${insetY}px ${insetX}px round ${radius / scale}px)`,
    opacity: 1,
  };
}

const REST: Keyframe = { transform: "none", clipPath: REST_CLIP, opacity: 1 };
const FADE: Keyframe = {
  transform: "scale(0.96)",
  clipPath: REST_CLIP,
  opacity: 0,
};

export interface ImageLightboxProps {
  images: string[];
  /** null = closed */
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  /** Box of the thumbnail that was clicked, from getBoundingClientRect(). */
  originRect?: DOMRect | null;
  /** Where the thumbnail is now. Asked when closing, in case it moved. */
  getOriginRect?: () => DOMRect | null;
  /** Known pixel sizes, so the frame is the right shape before the image loads. */
  sizes?: Record<string, Size> | null;
  title?: string;
  /** Optional line shown next to the counter, one per image. */
  captions?: string[];
}

/** A full-screen image viewer that grows out of the clicked thumbnail and flies back into it. */
export function ImageLightbox(props: ImageLightboxProps) {
  const open = props.index !== null;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={() => {}}>
      {open && (
        <DialogPrimitive.Portal>
          <LightboxContent {...props} index={props.index as number} />
        </DialogPrimitive.Portal>
      )}
    </DialogPrimitive.Root>
  );
}

function LightboxContent({
  images,
  index,
  onIndexChange,
  onClose,
  originRect = null,
  getOriginRect,
  sizes = null,
  title = "Image",
  captions,
}: ImageLightboxProps & { index: number }) {
  const content = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const openedAt = useRef(index);
  const current = useRef(index);
  useLayoutEffect(() => {
    current.current = index;
  }, [index]);
  const [loaded, setLoaded] = useState<Record<string, Size>>({});
  const many = images.length > 1;
  const src = images[index];

  const sizeOf = (url: string): Size | undefined => loaded[url] ?? sizes?.[url];
  const size = sizeOf(src);
  const portrait = size ? size.height / size.width >= 1.2 : false;

  // Open: grow out of the thumbnail.
  useLayoutEffect(() => {
    const f = frame.current;
    const root = content.current;
    if (!f || !root || reducedMotion()) return;
    const rect = f.getBoundingClientRect();
    const from = originRect ? originKeyframe(rect, originRect, RADIUS) : FADE;
    const anims: Animation[] = [
      f.animate([from, REST], { duration: OPEN_MS, easing: EASE }),
    ];
    if (backdrop.current)
      anims.push(
        backdrop.current.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 300,
          easing: "ease-out",
        }),
      );
    root.querySelectorAll("[data-chrome]").forEach((el) =>
      anims.push(
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 260,
          delay: OPEN_MS * 0.45,
          easing: "ease-out",
          fill: "backwards",
        }),
      ),
    );
    return () => anims.forEach((a) => a.cancel());
    // Runs once on mount, on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close: fly back to the thumbnail if still on the image that was opened, otherwise fade.
  const close = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    const f = frame.current;
    const root = content.current;
    if (!f || !root || reducedMotion()) {
      onClose();
      return;
    }
    const target = getOriginRect ? getOriginRect() : originRect;
    const same = current.current === openedAt.current;
    const to =
      same && target
        ? originKeyframe(f.getBoundingClientRect(), target, RADIUS)
        : FADE;
    const anims: Animation[] = [
      f.animate([REST, to], {
        duration: CLOSE_MS,
        easing: EASE,
        fill: "forwards",
      }),
    ];
    if (backdrop.current)
      anims.push(
        backdrop.current.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: CLOSE_MS - 40,
          easing: "ease-in",
          fill: "forwards",
        }),
      );
    root.querySelectorAll("[data-chrome]").forEach((el) =>
      anims.push(
        el.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 140,
          fill: "forwards",
        }),
      ),
    );
    await Promise.all(anims.map((a) => a.finished.catch(() => undefined)));
    onClose();
  }, [getOriginRect, onClose, originRect]);

  const step = useCallback(
    (d: number) =>
      onIndexChange((current.current + d + images.length) % images.length),
    [images.length, onIndexChange],
  );

  useEffect(() => {
    if (!many) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [many, step]);

  // Keep the current thumbnail in the middle of the strip.
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>(`[data-i="${index}"]`)
      ?.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: "smooth",
      });
  }, [index]);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <DialogPrimitive.Content
      ref={content}
      aria-describedby={undefined}
      onEscapeKeyDown={(e) => {
        e.preventDefault();
        close();
      }}
      onInteractOutside={(e) => e.preventDefault()}
      className="fixed inset-0 z-[100] flex flex-col outline-none"
    >
      <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>

      <div
        ref={backdrop}
        onClick={close}
        className="bg-background/90 absolute inset-0 backdrop-blur-md"
      />

      <div
        data-chrome
        className="relative flex items-center justify-between gap-4 px-4 py-3 md:px-6"
      >
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="truncate text-sm font-medium">{title}</span>
          {captions?.[index] && (
            <span className="text-muted-foreground hidden truncate text-sm sm:inline">
              {captions[index]}
            </span>
          )}
          {many && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {pad(index + 1)} / {pad(images.length)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          className="bg-card hover:bg-accent flex h-9 items-center gap-2 rounded-full border pr-2 pl-3 text-sm font-medium transition-colors"
        >
          Close
          <kbd className="text-muted-foreground rounded border px-1.5 py-0.5 text-[10px] leading-none">
            Esc
          </kbd>
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div
        onClick={(e) => e.target === e.currentTarget && close()}
        className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-2 md:px-16"
      >
        {many && (
          <>
            <button
              type="button"
              data-chrome
              onClick={() => step(-1)}
              aria-label="Previous image"
              className="bg-card hover:bg-accent absolute top-1/2 left-3 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-colors md:left-5"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              data-chrome
              onClick={() => step(1)}
              aria-label="Next image"
              className="bg-card hover:bg-accent absolute top-1/2 right-3 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-colors md:right-5"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
        <div
          onClick={(e) => e.target === e.currentTarget && close()}
          className="flex size-full items-center justify-center"
        >
          <div
            ref={frame}
            style={{
              clipPath: REST_CLIP,
              ...(portrait && size
                ? { aspectRatio: `${size.width} / ${size.height}` }
                : {}),
            }}
            className={cn(
              "bg-card overflow-hidden rounded-xl border shadow-2xl",
              portrait
                ? "h-full max-h-full max-w-full"
                : "h-full w-full max-w-[1500px]",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={src}
              src={src}
              alt={captions?.[index] ?? title}
              draggable={false}
              onLoad={(e) => {
                const { naturalWidth: width, naturalHeight: height } =
                  e.currentTarget;
                if (width && height)
                  setLoaded((s) =>
                    s[src] ? s : { ...s, [src]: { width, height } },
                  );
              }}
              className="size-full object-contain select-none"
            />
          </div>
        </div>
      </div>

      {many && (
        <div
          ref={strip}
          data-chrome
          className="relative flex justify-center gap-2 overflow-x-auto px-4 py-3"
        >
          <div className="flex gap-2">
            {images.map((url, i) => {
              const s = sizeOf(url);
              return (
                <button
                  key={url}
                  type="button"
                  data-i={i}
                  onClick={() => onIndexChange(i)}
                  aria-label={`Show image ${i + 1}`}
                  aria-current={i === index}
                  style={{ aspectRatio: s ? s.width / s.height : 1.5 }}
                  className={cn(
                    "h-12 shrink-0 overflow-hidden rounded-md border-2 transition-opacity",
                    i === index
                      ? "border-brand opacity-100"
                      : "border-transparent opacity-60 hover:opacity-90",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    draggable={false}
                    className="size-full object-cover select-none"
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </DialogPrimitive.Content>
  );
}

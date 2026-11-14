"use client";

import { FileImage } from "lucide-react";
import { useRef, useState } from "react";

import { ImageLightbox } from "@/components/ui/image-lightbox";

const LABEL: Record<string, string> = {
  front: "ID, front",
  back: "ID, back",
  selfie: "Selfie with ID",
};

/**
 * The uploaded ID photos for admin review. Each loads through an admin-only route, never a public link.
 * Clicking one opens it full size, growing out of its thumbnail.
 */
export function KycDocuments({
  userId,
  documents,
}: {
  userId: string;
  documents?: { kind: string }[];
}) {
  const [index, setIndex] = useState<number | null>(null);
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const [sizes, setSizes] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const thumbs = useRef<(HTMLImageElement | null)[]>([]);
  const openedFrom = useRef(0);

  if (!documents?.length)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <FileImage className="size-4" aria-hidden="true" /> No document photos
        were uploaded.
      </p>
    );

  const urls = documents.map((d) => `/admin/kyc/${userId}/${d.kind}`);
  const captions = documents.map((d) => LABEL[d.kind] ?? d.kind);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {documents.map((d, i) => (
          <button
            key={d.kind}
            type="button"
            onClick={() => {
              openedFrom.current = i;
              setOrigin(thumbs.current[i]?.getBoundingClientRect() ?? null);
              setIndex(i);
            }}
            className="group block space-y-1.5 text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={(el) => {
                thumbs.current[i] = el;
              }}
              src={urls[i]}
              alt={captions[i]}
              loading="lazy"
              draggable={false}
              onLoad={(e) => {
                const { naturalWidth: width, naturalHeight: height } =
                  e.currentTarget;
                if (width && height)
                  setSizes((s) =>
                    s[urls[i]] ? s : { ...s, [urls[i]]: { width, height } },
                  );
              }}
              className="aspect-[16/10] w-full rounded-lg border bg-black/5 object-cover select-none [-webkit-user-drag:none]"
            />
            <span className="text-muted-foreground block text-xs">
              {captions[i]} · click to enlarge
            </span>
          </button>
        ))}
      </div>
      <ImageLightbox
        images={urls}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setIndex(null)}
        originRect={origin}
        getOriginRect={() =>
          thumbs.current[openedFrom.current]?.getBoundingClientRect() ?? null
        }
        sizes={sizes}
        title="Identity document"
        captions={captions}
      />
    </>
  );
}

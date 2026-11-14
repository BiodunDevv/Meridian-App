"use client";

import {
  Camera,
  CheckCircle2,
  ImagePlus,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { kycUploadTicketAction } from "@/app/actions/user";
import { cn } from "@/lib/utils";

const MAX_EDGE = 1800;

/** Shrinks a photo in the browser so uploads stay fast on weak networks. Returns a JPEG. */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("compress"))),
      "image/jpeg",
      0.85,
    ),
  );
}

type Stage = "empty" | "working" | "done";

/**
 * One document slot. Picks or captures a photo, shrinks it, sends it straight to private storage and fills a
 * hidden input with the stored file's id. The form is only submitted with that id, never with the image.
 */
export function DocumentUpload({
  kind,
  name,
  label,
  hint,
  onChange,
}: {
  kind: "front" | "back" | "selfie";
  name: string;
  label: string;
  hint: string;
  onChange?: (ready: boolean) => void;
}) {
  const [stage, setStage] = useState<Stage>("empty");
  const [publicId, setPublicId] = useState("");
  const [preview, setPreview] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function reset() {
    setStage("empty");
    setPublicId("");
    setPreview("");
    setError("");
    setProgress(0);
    onChange?.(false);
    if (input.current) input.current.value = "";
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Choose a photo (JPG, PNG or WebP).");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("That image is too large. Choose a smaller photo.");
      return;
    }
    setStage("working");
    setProgress(0);
    onChange?.(false);
    try {
      const blob = await compress(file);
      setPreview(URL.createObjectURL(blob));
      const t = await kycUploadTicketAction(kind);
      if (!t.ok) throw new Error(t.error);
      const { ticket } = t;
      const fd = new FormData();
      fd.set("file", blob, `${kind}.jpg`);
      fd.set("api_key", ticket.apiKey);
      fd.set("timestamp", String(ticket.timestamp));
      fd.set("signature", ticket.signature);
      fd.set("public_id", ticket.publicId);
      fd.set("type", ticket.type);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", ticket.url);
        xhr.upload.onprogress = (e) =>
          e.lengthComputable &&
          setProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error("The upload failed. Try again."));
        xhr.onerror = () =>
          reject(
            new Error(
              "We could not reach the server. Check your connection and try again.",
            ),
          );
        xhr.send(fd);
      });
      setPublicId(ticket.publicId);
      setStage("done");
      onChange?.(true);
    } catch (e) {
      setStage("empty");
      setPreview("");
      setError(
        e instanceof Error ? e.message : "The upload failed. Try again.",
      );
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input type="hidden" name={name} value={publicId} />
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture={kind === "selfie" ? "user" : undefined}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {stage === "empty" ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "hover:bg-accent/40 flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-center transition-colors",
            error && "border-destructive-foreground/50",
          )}
        >
          {kind === "selfie" ? (
            <Camera
              className="text-muted-foreground size-6"
              aria-hidden="true"
            />
          ) : (
            <ImagePlus
              className="text-muted-foreground size-6"
              aria-hidden="true"
            />
          )}
          <span className="text-sm font-medium">Upload or take a photo</span>
          <span className="text-muted-foreground text-xs">{hint}</span>
        </button>
      ) : (
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border bg-black/5">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt={`${label} preview`}
              className="size-full object-cover"
            />
          )}
          {stage === "working" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              <span className="text-xs font-medium">Uploading {progress}%</span>
            </div>
          )}
          {stage === "done" && (
            <>
              <span className="bg-success text-primary-foreground absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />{" "}
                Uploaded
              </span>
              <div className="absolute top-2 right-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  aria-label={`Replace ${label}`}
                  className="flex size-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <RefreshCw className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={reset}
                  aria-label={`Remove ${label}`}
                  className="flex size-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {error && (
        <p className="text-destructive-foreground text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

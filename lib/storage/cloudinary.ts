import { createHash, randomBytes } from "node:crypto";

import { getEnv } from "../env";
import { log } from "../log";

/**
 * Cloudinary storage for identity documents. Files are stored as **authenticated** assets, so they have no
 * public URL. The browser uploads straight to Cloudinary with a one-time signature from us, and admins view a
 * document only through an authenticated route on this site, which fetches it with a signed download request.
 */

const ALLOWED = ["jpg", "jpeg", "png", "webp"];
export const MAX_DOC_BYTES = 6 * 1024 * 1024;

export const cloudinaryConfigured = () => {
  const e = getEnv();
  return Boolean(
    e.CLOUDINARY_CLOUD_NAME && e.CLOUDINARY_API_KEY && e.CLOUDINARY_API_SECRET,
  );
};

/** Cloudinary's API signature: sha1 of the sorted `key=value` pairs joined by `&`, plus the secret. */
function sign(params: Record<string, string | number>) {
  const base = Object.keys(params)
    .filter((k) => params[k] !== "" && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1")
    .update(base + getEnv().CLOUDINARY_API_SECRET)
    .digest("hex");
}

const folderFor = (userId: string) => `meridian/kyc/${userId}`;

/** Everything the browser needs to upload one document directly to Cloudinary. */
export function createUploadTicket(userId: string, kind: string) {
  const e = getEnv();
  const publicId = `${folderFor(userId)}/${kind}-${randomBytes(6).toString("hex")}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: publicId, timestamp, type: "authenticated" };
  return {
    url: `https://api.cloudinary.com/v1_1/${e.CLOUDINARY_CLOUD_NAME}/image/upload`,
    apiKey: e.CLOUDINARY_API_KEY,
    timestamp,
    publicId,
    type: "authenticated",
    signature: sign(params),
  };
}

/** A public id belongs to this user's KYC folder (stops a user attaching someone else's file). */
export const ownsDocument = (userId: string, publicId: string) =>
  publicId.startsWith(`${folderFor(userId)}/`) && !publicId.includes("..");

const basic = () =>
  "Basic " +
  Buffer.from(
    `${getEnv().CLOUDINARY_API_KEY}:${getEnv().CLOUDINARY_API_SECRET}`,
  ).toString("base64");

export interface StoredDoc {
  publicId: string;
  format: string;
  bytes: number;
}

/** Confirms an uploaded document really exists, is an allowed image and is not too large. */
export async function verifyDocument(publicId: string): Promise<StoredDoc> {
  const e = getEnv();
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${e.CLOUDINARY_CLOUD_NAME}/resources/image/authenticated/${publicId
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    { headers: { authorization: basic() }, cache: "no-store" },
  );
  if (!res.ok)
    throw new Error(
      "A document upload could not be found. Please upload it again.",
    );
  const r = (await res.json()) as { format?: string; bytes?: number };
  const format = (r.format ?? "").toLowerCase();
  if (!ALLOWED.includes(format))
    throw new Error("Documents must be JPG, PNG or WebP images.");
  if (!r.bytes)
    throw new Error(
      "A document upload could not be found. Please upload it again.",
    );
  if (r.bytes > MAX_DOC_BYTES)
    throw new Error("A document is too large. Keep each image under 6 MB.");
  return { publicId, format, bytes: r.bytes };
}

/** Fetches a stored document's bytes (server side only), using a signed download request. */
export async function downloadDocument(doc: {
  publicId: string;
  format: string;
}) {
  const e = getEnv();
  const params = {
    public_id: doc.publicId,
    format: doc.format,
    type: "authenticated",
    timestamp: Math.floor(Date.now() / 1000),
  };
  const qs = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ),
    api_key: e.CLOUDINARY_API_KEY,
    signature: sign(params),
  });
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${e.CLOUDINARY_CLOUD_NAME}/image/download?${qs}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error("The document could not be loaded.");
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    type: res.headers.get("content-type") ?? `image/${doc.format}`,
  };
}

/** Removes a stored document. Used when someone replaces their files. Failures are not fatal. */
export async function deleteDocument(publicId: string) {
  try {
    const e = getEnv();
    const params = {
      public_id: publicId,
      type: "authenticated",
      timestamp: Math.floor(Date.now() / 1000),
    };
    const body = new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ),
      api_key: e.CLOUDINARY_API_KEY,
      signature: sign(params),
    });
    await fetch(
      `https://api.cloudinary.com/v1_1/${e.CLOUDINARY_CLOUD_NAME}/image/destroy`,
      { method: "POST", body, cache: "no-store" },
    );
  } catch (err) {
    log.error("[cloudinary] delete failed", err);
  }
}

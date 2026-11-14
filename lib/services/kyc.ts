import { decrypt, encrypt, maskId } from "../crypto";
import { connectDb } from "../db";
import { emails } from "../email/templates";
import { Kyc, User } from "../models";
import { deleteDocument, type StoredDoc } from "../storage/cloudinary";
import { alertAdmins, audit, notify } from "./notify";

type Actor = { id: string; email: string };

/** Tidies a legal name: single spaces, and proper capitals when it was typed all lower or all upper case. */
export function properName(raw: string) {
  const s = raw.replace(/\s+/g, " ").trim();
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(
      /(^|[\s'-])(\p{L})/gu,
      (_, sep: string, c: string) => sep + c.toUpperCase(),
    );
}

export async function submitKyc(
  userId: string,
  d: {
    fullName: string;
    dateOfBirth: string;
    country: string;
    address: string;
    idType: string;
    idNumber: string;
  },
  docs: Partial<Record<"front" | "back" | "selfie", StoredDoc>> = {},
) {
  await connectDb();
  const existing = await Kyc.findOne({ userId });
  if (existing?.status === "approved")
    throw new Error("Your identity is already verified.");
  const { idNumber, ...rest } = d;
  const documents = Object.entries(docs).map(([kind, v]) => ({ kind, ...v }));
  await Kyc.findOneAndUpdate(
    { userId },
    {
      ...rest,
      idNumberEnc: encrypt(idNumber),
      idLast4: idNumber.slice(-4),
      ...(documents.length ? { documents } : {}),
      status: "pending",
      reason: undefined,
    },
    { upsert: true },
  );
  // Files from an earlier, rejected attempt that were replaced are removed from storage.
  const keep = new Set(documents.map((x) => x.publicId));
  for (const old of (existing?.documents ?? []) as { publicId: string }[])
    if (documents.length && !keep.has(old.publicId))
      await deleteDocument(old.publicId);
  const u = await User.findById(userId).select("email");
  await notify(
    userId,
    {
      title: "Verification submitted",
      body: "Our team will review your details.",
      href: "/dashboard/settings",
    },
    emails.kycReceived(),
  );
  await alertAdmins(
    "New identity check to review",
    [
      ["User", u?.email ?? ""],
      ["Name", d.fullName],
      ["Country", d.country],
    ],
    "/admin/users",
  );
}

/** For admin review only: the full decrypted ID number. Callers must audit-log the view. */
export function fullIdNumber(enc?: string | null) {
  if (!enc) return "";
  try {
    return decrypt(enc);
  } catch {
    return "";
  }
}

/** Decrypted ID number masked except the last 4. */
export function maskedIdNumber(enc?: string | null) {
  if (!enc) return "";
  try {
    return maskId(decrypt(enc));
  } catch {
    return "";
  }
}

export async function reviewKyc(
  admin: Actor,
  id: string,
  approve: boolean,
  reason: string,
) {
  await connectDb();
  const k = await Kyc.findOneAndUpdate(
    { _id: id, status: "pending" },
    {
      status: approve ? "approved" : "rejected",
      reason: approve ? undefined : reason,
      reviewedBy: admin.id,
      reviewedAt: new Date(),
    },
    { new: true },
  );
  if (!k) throw new Error("This verification is not pending.");
  // Once verified, the account carries the name on the ID, so emails and the app use the real name.
  if (approve && k.fullName) {
    await User.updateOne({ _id: k.userId }, { name: properName(k.fullName) });
  }
  await notify(
    String(k.userId),
    {
      title: approve ? "Identity verified" : "Verification not approved",
      body: approve ? undefined : reason || undefined,
      href: "/dashboard/settings",
    },
    emails.kycResult(approve, reason),
  );
  await audit(admin, approve ? "kyc.approve" : "kyc.reject", String(k._id), {
    reason,
  });
}

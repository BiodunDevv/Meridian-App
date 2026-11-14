"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import { kycAction } from "@/app/actions/user";

import { CountryPicker } from "./country-picker";
import { DocumentUpload } from "./document-upload";
import {
  ActionForm,
  Field,
  NativeSelect,
  SubmitButton,
  TextField,
} from "./form";

const ID_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "national_id", label: "National ID card" },
  { value: "drivers_license", label: "Driver's license" },
];

function Group({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="flex items-center gap-2.5 text-sm font-semibold">
        <span className="bg-brand/10 text-brand flex size-6 items-center justify-center rounded-full text-xs">
          {step}
        </span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

/** Identity verification: personal details, an ID, and photos of it. Photos go straight to private storage. */
export function KycForm({
  defaultName,
  uploads,
}: {
  defaultName?: string;
  /** False when document storage is not set up. The photos are then skipped. */
  uploads: boolean;
}) {
  const [idType, setIdType] = useState("passport");
  const [ready, setReady] = useState({
    front: false,
    back: false,
    selfie: false,
  });
  const needBack = idType !== "passport";
  const complete =
    !uploads || (ready.front && ready.selfie && (!needBack || ready.back));
  // Applicants must be at least 18.
  const [maxDob] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().slice(0, 10);
  });
  const set = (k: keyof typeof ready) => (v: boolean) =>
    setReady((r) => ({ ...r, [k]: v }));

  return (
    <ActionForm action={kycAction} className="gap-8" resetOnSuccess={false}>
      <Group step={1} title="Personal details">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            name="fullName"
            label="Full legal name"
            required
            autoComplete="name"
            defaultValue={defaultName}
            hint="Exactly as it appears on your ID."
          />
          <TextField
            name="dateOfBirth"
            label="Date of birth"
            type="date"
            max={maxDob}
            required
            autoComplete="bday"
          />
          <CountryPicker name="country" label="Country" required />
          <TextField
            name="address"
            iconKey="home"
            label="Residential address"
            required
            autoComplete="street-address"
          />
        </div>
      </Group>

      <Group step={2} title="Identity document">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="ID type" htmlFor="idType">
            <NativeSelect
              id="idType"
              name="idType"
              required
              value={idType}
              onChange={(e) => setIdType(e.target.value)}
            >
              {ID_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <TextField
            name="idNumber"
            label="ID number"
            required
            autoComplete="off"
            hint="Stored encrypted. Only the last 4 characters are ever shown."
          />
        </div>
      </Group>

      {uploads && (
        <Group step={3} title="Photos of your documents">
          <div
            className={`grid grid-cols-1 gap-4 ${needBack ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
          >
            <DocumentUpload
              kind="front"
              name="docFront"
              label={
                idType === "passport" ? "Passport photo page" : "ID, front"
              }
              hint="Clear, uncropped, all four corners visible"
              onChange={set("front")}
            />
            {needBack && (
              <DocumentUpload
                kind="back"
                name="docBack"
                label="ID, back"
                hint="The reverse side of the same ID"
                onChange={set("back")}
              />
            )}
            <DocumentUpload
              kind="selfie"
              name="docSelfie"
              label="Selfie holding your ID"
              hint="Your face and the ID, both clearly readable"
              onChange={set("selfie")}
            />
          </div>
          <p className="text-muted-foreground flex items-start gap-2 text-xs">
            <ShieldCheck
              className="text-brand mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            Your photos are stored privately, with no public link, and are only
            opened by our compliance team to verify your identity. JPG, PNG or
            WebP, up to 6 MB each.
          </p>
        </Group>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending="Submitting…" disabled={!complete}>
          Submit for review
        </SubmitButton>
        {!complete && (
          <span className="text-muted-foreground text-xs">
            Upload every photo to continue.
          </span>
        )}
      </div>
    </ActionForm>
  );
}

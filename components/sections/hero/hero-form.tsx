"use client";

import { AtSign } from "lucide-react";
import { useId, useState } from "react";

import { appLinks, hero } from "@/content/site";

import { IconInput } from "../../app/icon-input";
import { Button } from "../../ui/button";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function HeroForm() {
  const id = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError(hero.emailError);
      return;
    }
    setError("");
    window.location.assign(appLinks.registerWith({ email: value }));
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="mx-auto flex w-full max-w-sm flex-col gap-2"
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor={id} className="sr-only">
          {hero.emailLabel}
        </label>
        <IconInput
          icon={AtSign}
          id={id}
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          placeholder={hero.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-error`}
          groupClassName="bg-secondary w-full min-w-0"
          className="text-base sm:text-sm"
        />
        <Button type="submit" size="lg" className="shrink-0">
          {hero.submit}
        </Button>
      </div>
      <p
        id={`${id}-error`}
        role="status"
        aria-live="polite"
        className="text-destructive-foreground min-h-5 text-left text-sm"
      >
        {error}
      </p>
    </form>
  );
}

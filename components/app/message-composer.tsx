"use client";

import {
  Bell,
  Braces,
  FileText,
  Link2,
  Mail,
  Save,
  Search,
  Send,
  Trash2,
  Type,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import {
  countAudienceAction,
  deleteTemplateAction,
  previewMessageAction,
  saveTemplateAction,
  searchUsersAction,
  sendMessageAction,
  sendTestMessageAction,
} from "@/app/actions/messages";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { BUILT_IN_TEMPLATES, VARIABLES } from "@/content/message-templates";
import { type AudienceKey, AUDIENCES } from "@/lib/services/audiences";
import { cn } from "@/lib/utils";

import { IconInput, IconSelect } from "./icon-input";

type Custom = { id: string; name: string; subject: string; body: string };
type Picked = { id: string; email: string; username: string };

export function MessageComposer({
  customTemplates,
}: {
  customTemplates: Custom[];
}) {
  const router = useRouter();
  const [state, action, sending] = useActionState(sendMessageAction, {
    ok: false,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [templateKey, setTemplateKey] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState(true);
  const [inApp, setInApp] = useState(true);
  const [audience, setAudience] = useState<AudienceKey>("all");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");

  const [count, setCount] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Picked[]>([]);
  const [tplOpen, setTplOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [busy, startBusy] = useTransition();
  const [, startSend] = useTransition();

  const pickedIds = picked.map((p) => p.id);

  // Toast the result, and go to the history once sent.
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.ok) {
      toast.success(state.message ?? "Sent.");
      router.push("/admin/messages");
    }
  }, [state, router]);

  // Live recipient count.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      countAudienceAction(audience, pickedIds)
        .then((n) => live && setCount(n))
        .catch(() => live && setCount(null));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, pickedIds.join(",")]);

  // Live email preview.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      previewMessageAction(subject, body, ctaLabel, ctaUrl)
        .then((h) => live && setPreviewHtml(h))
        .catch(() => {});
    }, 500);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [subject, body, ctaLabel, ctaUrl]);

  // Recipient search.
  useEffect(() => {
    if (audience !== "selected" || query.trim().length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      searchUsersAction(query)
        .then(
          (r) => live && setResults(r.filter((x) => !pickedIds.includes(x.id))),
        )
        .catch(() => {});
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, audience, pickedIds.join(",")]);

  function applyTemplate(key: string, s: string, b: string) {
    setTemplateKey(key);
    setSubject(s);
    setBody(b);
    setTplOpen(false);
    toast.success("Template applied. Edit anything you like.");
  }

  function insertVar(v: string) {
    const el = bodyRef.current;
    const token = `{{${v}}}`;
    if (!el) return setBody((b) => b + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function formData() {
    const fd = new FormData();
    fd.set("subject", subject);
    fd.set("body", body);
    fd.set("ctaLabel", ctaLabel);
    fd.set("ctaUrl", ctaUrl);
    return fd;
  }

  const sendTest = () =>
    startBusy(async () => {
      const r = await sendTestMessageAction(formData());
      r.ok ? toast.success(r.message) : toast.error(r.error);
    });

  const saveTemplate = () =>
    startBusy(async () => {
      const fd = formData();
      fd.set("name", tplName);
      const r = await saveTemplateAction(fd);
      if (r.ok) {
        toast.success(r.message);
        setSaveOpen(false);
        setTplName("");
        router.refresh();
      } else toast.error(r.error);
    });

  const removeTemplate = (id: string) =>
    startBusy(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const r = await deleteTemplateAction(fd);
      r.ok
        ? (toast.success(r.message), router.refresh())
        : toast.error(r.error);
    });

  const channelText =
    [email && "email", inApp && "in-app notification"]
      .filter(Boolean)
      .join(" and ") || "no channel";
  const audienceMeta = AUDIENCES.find((a) => a.key === audience)!;
  const ready =
    subject.trim().length >= 3 &&
    body.trim().length >= 10 &&
    (email || inApp) &&
    (count ?? 0) > 0;
  const categories = Array.from(
    new Set(BUILT_IN_TEMPLATES.map((t) => t.category)),
  );

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      <form
        ref={formRef}
        className="space-y-5 xl:col-span-3"
        onSubmit={(e) => {
          e.preventDefault();
          setConfirmOpen(true);
        }}
      >
        <input type="hidden" name="templateKey" value={templateKey} />
        <input type="hidden" name="audience" value={audience} />
        <input type="hidden" name="userIds" value={JSON.stringify(pickedIds)} />

        <section className="bg-card space-y-4 rounded-xl border p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">1. Recipients</h2>
            <span className="bg-brand/10 text-brand inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
              <Users className="size-3.5" aria-hidden="true" />
              {count === null
                ? "Counting…"
                : `${count} recipient${count === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aud" className="text-sm font-medium">
              Who should receive it?
            </label>
            <IconSelect
              id="aud"
              icon={Users}
              value={audience}
              onChange={(e) => setAudience(e.target.value as AudienceKey)}
            >
              {AUDIENCES.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </IconSelect>
            <p className="text-muted-foreground text-xs">
              {audienceMeta.hint}. Only active users with a confirmed email are
              included.
            </p>
          </div>

          {audience === "selected" && (
            <div className="space-y-3">
              <IconInput
                icon={Search}
                name="user-search"
                placeholder="Search by email or username"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (e.target.value.trim().length < 2) setResults([]);
                }}
                autoComplete="off"
                aria-label="Search users"
              />
              {results.length > 0 && query.trim().length >= 2 && (
                <ul className="divide-y rounded-lg border">
                  {results.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className="hover:bg-accent/50 flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
                        onClick={() => {
                          setPicked((p) => [...p, u]);
                          setResults((r) => r.filter((x) => x.id !== u.id));
                        }}
                      >
                        <span className="truncate">{u.email}</span>
                        <span className="text-muted-foreground shrink-0 text-xs">
                          @{u.username}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {picked.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {picked.map((u) => (
                    <li
                      key={u.id}
                      className="bg-secondary inline-flex items-center gap-1.5 rounded-full py-1 pr-1 pl-3 text-xs"
                    >
                      {u.email}
                      <button
                        type="button"
                        aria-label={`Remove ${u.email}`}
                        className="hover:bg-accent rounded-full p-1"
                        onClick={() =>
                          setPicked((p) => p.filter((x) => x.id !== u.id))
                        }
                      >
                        <X className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className="bg-card space-y-4 rounded-xl border p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">2. Message</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTplOpen(true)}
            >
              <FileText /> Use a template
            </Button>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="subject" className="text-sm font-medium">
              Subject
            </label>
            <IconInput
              id="subject"
              name="subject"
              icon={Type}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={120}
              placeholder="e.g. Scheduled maintenance notice"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="body" className="text-sm font-medium">
                Message
              </label>
              <div className="flex items-center gap-1.5">
                <Braces
                  className="text-muted-foreground size-3.5"
                  aria-hidden="true"
                />
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVar(v)}
                    className="bg-secondary hover:bg-accent rounded-md px-2 py-0.5 font-mono text-[11px]"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              id="body"
              name="body"
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              maxLength={5000}
              placeholder="Write your message. Leave a blank line between paragraphs."
            />
            <p className="text-muted-foreground flex justify-between text-xs">
              <span>Use **bold** and start lines with “- ” for bullets.</span>
              <span>{body.length}/5000</span>
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="ctaLabel" className="text-sm font-medium">
                Button label (optional)
              </label>
              <IconInput
                id="ctaLabel"
                name="ctaLabel"
                icon={Type}
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                maxLength={40}
                placeholder="Open dashboard"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ctaUrl" className="text-sm font-medium">
                Button link
              </label>
              <IconInput
                id="ctaUrl"
                name="ctaUrl"
                icon={Link2}
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="/dashboard/orders"
                autoComplete="off"
              />
            </div>
          </div>
        </section>

        <section className="bg-card space-y-3 rounded-xl border p-5">
          <h2 className="font-semibold">3. Delivery</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              {
                name: "email",
                checked: email,
                set: setEmail,
                icon: Mail,
                title: "Email",
                sub: "Sent to their inbox",
              },
              {
                name: "inApp",
                checked: inApp,
                set: setInApp,
                icon: Bell,
                title: "In-app notification",
                sub: "Shown in their dashboard",
              },
            ].map((c) => (
              <label key={c.name} className="cursor-pointer">
                <input
                  type="checkbox"
                  name={c.name}
                  checked={c.checked}
                  onChange={(e) => c.set(e.target.checked)}
                  className="peer sr-only"
                />
                <span className="peer-checked:border-brand peer-checked:bg-brand/5 peer-checked:ring-brand/20 peer-focus-visible:ring-ring flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors peer-checked:ring-2 peer-focus-visible:ring-2">
                  <c.icon className="text-brand size-5" aria-hidden="true" />
                  <span>
                    <span className="block text-sm font-medium">{c.title}</span>
                    <span className="text-muted-foreground block text-xs">
                      {c.sub}
                    </span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="lg" disabled={!ready || sending}>
            <Send /> {sending ? "Sending…" : "Review and send"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={busy}
            onClick={sendTest}
          >
            Send test to me
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={subject.trim().length < 3 || body.trim().length < 10}
            onClick={() => setSaveOpen(true)}
          >
            <Save /> Save as template
          </Button>
        </div>
      </form>

      <aside className="space-y-3 xl:sticky xl:top-4 xl:col-span-2 xl:self-start">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Email preview
        </h2>
        <iframe
          title="Email preview"
          srcDoc={previewHtml}
          sandbox=""
          className="h-[640px] w-full rounded-xl border bg-white"
        />
        <p className="text-muted-foreground text-xs">
          Preview uses sample values such as “Alex” for {"{{firstName}}"}. Each
          recipient gets their own.
        </p>
      </aside>

      {/* Templates */}
      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Message templates</DialogTitle>
            <DialogDescription>
              Pick one to fill the subject and message. You can edit it before
              sending.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {customTemplates.length > 0 && (
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Your templates
                </p>
                <ul className="space-y-1.5">
                  {customTemplates.map((t) => (
                    <li key={t.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        className="hover:bg-accent/50 flex-1 rounded-lg border px-3 py-2 text-left"
                        onClick={() =>
                          applyTemplate(`custom:${t.id}`, t.subject, t.body)
                        }
                      >
                        <span className="block text-sm font-medium">
                          {t.name}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {t.subject}
                        </span>
                      </button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Delete ${t.name}`}
                        disabled={busy}
                        onClick={() => removeTemplate(t.id)}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {categories.map((cat) => (
              <div key={cat} className="space-y-2">
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  {cat}
                </p>
                <ul className="space-y-1.5">
                  {BUILT_IN_TEMPLATES.filter((t) => t.category === cat).map(
                    (t) => (
                      <li key={t.key}>
                        <button
                          type="button"
                          className={cn(
                            "hover:bg-accent/50 w-full rounded-lg border px-3 py-2 text-left",
                            templateKey === t.key && "border-brand",
                          )}
                          onClick={() => {
                            applyTemplate(t.key, t.subject, t.body);
                            if (t.audience)
                              toast.info(`Suggested audience: ${t.audience}`);
                          }}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">
                              {t.name}
                            </span>
                            {t.audience && (
                              <span className="text-muted-foreground shrink-0 text-[11px]">
                                {t.audience}
                              </span>
                            )}
                          </span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {t.subject}
                          </span>
                        </button>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Save template */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Reuse this subject and message later.
            </DialogDescription>
          </DialogHeader>
          <IconInput
            icon={FileText}
            name="tpl-name"
            placeholder="Template name"
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            autoComplete="off"
            aria-label="Template name"
          />
          <Button
            disabled={busy || tplName.trim().length < 2}
            onClick={saveTemplate}
          >
            Save template
          </Button>
        </DialogContent>
      </Dialog>

      {/* Confirm send */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send to {count ?? 0} user{count === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              “{subject}” will be sent to{" "}
              <strong>{audienceMeta.label.toLowerCase()}</strong> by{" "}
              {channelText}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back to editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!formRef.current) return;
                const fd = new FormData(formRef.current);
                setConfirmOpen(false);
                startSend(() => action(fd));
              }}
            >
              Send message
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

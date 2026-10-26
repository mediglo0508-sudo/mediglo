// ============================================================================
// Mediglo AI Manager — floating assistant drawer.
// Talks to /api/ai-manager with the signed-in user's Supabase bearer token.
// Every answer comes from live ERP data via server-side tools.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Send, X, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { invalidateLedger } from "@/lib/ledger-cache";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
}

const SUGGESTIONS = [
  "Today's collection breakdown",
  "Today's appointments",
  "Clients with pending sessions and a long gap",
  "All pending dues",
  "Low stock products",
  "Run invoice diagnostics for this month",
];

/** Very small markdown table / bold renderer — the AI replies in markdown. */
function Rendered({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let table: string[] = [];

  const flushTable = (key: string) => {
    if (table.length < 2) {
      table.forEach((l, i) => blocks.push(<p key={`${key}-p${i}`} className="text-sm">{inline(l)}</p>));
      table = [];
      return;
    }
    const rows = table
      .filter((l) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(l))
      .map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    const [head, ...body] = rows;
    blocks.push(
      <div key={key} className="my-2 overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/60">
            <tr>{head.map((h, i) => <th key={i} className="px-2 py-1.5 text-left font-semibold">{inline(h)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri} className="border-t">
                {r.map((c, ci) => <td key={ci} className="px-2 py-1.5 align-top">{inline(c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = [];
  };

  lines.forEach((line, i) => {
    if (line.trim().startsWith("|")) {
      table.push(line);
      return;
    }
    if (table.length) flushTable(`t${i}`);
    if (!line.trim()) return;
    const bullet = /^\s*[-*]\s+/.test(line);
    blocks.push(
      <p key={`l${i}`} className={cn("text-sm leading-relaxed", bullet && "pl-3")}>
        {inline(bullet ? `• ${line.replace(/^\s*[-*]\s+/, "")}` : line)}
      </p>,
    );
  });
  if (table.length) flushTable("tail");

  return <div className="space-y-1">{blocks}</div>;
}

function inline(s: string) {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>,
  );
}

export function AIManagerDrawer() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function refreshAfterAction(keys: string[]) {
    if (!keys.length) return;
    invalidateLedger(qc);
    qc.invalidateQueries({ queryKey: ["follow-ups"] });
    qc.invalidateQueries({ queryKey: ["auto-followup-queue"] });
    qc.invalidateQueries({ queryKey: ["appointments"] });
    qc.invalidateQueries({ queryKey: ["smart-calendar"] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next = [...messages, { role: "user" as const, content: question }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Your session expired — please sign in again.");
      const res = await fetch("/api/ai-manager", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const payload = (await res.json()) as { text?: string; error?: string; tools?: string[]; refresh?: string[] };
      if (!res.ok || payload.error) throw new Error(payload.error ?? "The AI Manager could not answer that.");
      setMessages((m) => [...m, { role: "assistant", content: payload.text ?? "", tools: payload.tools }]);
      refreshAfterAction(payload.refresh ?? []);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: err instanceof Error ? err.message : "Something went wrong." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2"
        aria-label="Open Mediglo AI Manager"
      >
        <Sparkles className="h-4 w-4" /> AI Manager
      </Button>
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(false)} className="gap-2" aria-label="Close Mediglo AI Manager">
        <Sparkles className="h-4 w-4" /> AI Manager
      </Button>
      <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setOpen(false)} />
      <Card className="fixed bottom-4 right-4 z-50 flex h-[min(80vh,640px)] w-[min(94vw,460px)] flex-col overflow-hidden p-0 shadow-2xl">
        <div className="flex items-center justify-between border-b bg-primary px-4 py-3 text-primary-foreground">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <div>
              <p className="text-sm font-semibold leading-tight">Mediglo AI Manager</p>
              <p className="text-[11px] opacity-80">Live clinic data · read &amp; assisted actions</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 hover:bg-white/15">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Ask about appointments, collections, dues, sessions or stock — or tell me to schedule a follow-up.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[92%] rounded-xl px-3 py-2",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card",
                )}
              >
                {m.role === "user" ? <p className="text-sm">{m.content}</p> : <Rendered text={m.content} />}
                {m.tools && m.tools.length > 0 && (
                  <p className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {[...new Set(m.tools)].join(" · ")}
                  </p>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading live clinic data…
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t p-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the AI Manager…"
            disabled={busy}
            className="h-9"
          />
          <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={busy || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>
    </>
  );
}

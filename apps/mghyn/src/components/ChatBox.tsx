import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRealtimeSync } from "@/lib/realtime";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, ArrowLeft, Loader2 } from "lucide-react";

// Roles that participate in intra-clinic chat.
const CHAT_ROLE_KEYWORDS = ["doctor", "consult", "counsel", "reception", "front", "market"];

interface Peer {
  user_id: string;
  name: string;
  role_title: string | null;
}

interface ChatMsg {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  is_read: boolean | null;
  created_at: string;
}

export function ChatBox() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [activePeer, setActivePeer] = useState<Peer | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useRealtimeSync(["cos_chat_messages"], ["chat-threads", "chat-thread"]);

  const { data: peers } = useQuery({
    queryKey: ["chat-peers"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("user_id, name, role_title")
        .eq("active", true)
        .not("user_id", "is", null);
      const rows = (data ?? []) as Peer[];
      return rows.filter((p) => {
        if (!p.user_id || p.user_id === user?.id) return false;
        const t = (p.role_title ?? "").toLowerCase();
        return CHAT_ROLE_KEYWORDS.some((k) => t.includes(k));
      });
    },
  });

  // Unread badge — messages sent TO me, not yet read.
  const { data: unreadRows } = useQuery({
    queryKey: ["chat-unread"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("cos_chat_messages")
        .select("id, sender_id")
        .eq("receiver_id", user!.id)
        .eq("is_read", false);
      return (data ?? []) as { id: string; sender_id: string }[];
    },
  });
  const unreadTotal = unreadRows?.length ?? 0;
  const unreadBySender = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of unreadRows ?? []) m.set(r.sender_id, (m.get(r.sender_id) ?? 0) + 1);
    return m;
  }, [unreadRows]);

  // Active thread
  const { data: thread } = useQuery({
    queryKey: ["chat-thread", user?.id, activePeer?.user_id],
    enabled: !!user && !!activePeer,
    queryFn: async () => {
      const me = user!.id;
      const peer = activePeer!.user_id;
      const { data } = await supabase
        .from("cos_chat_messages")
        .select("*")
        .or(
          `and(sender_id.eq.${me},receiver_id.eq.${peer}),and(sender_id.eq.${peer},receiver_id.eq.${me})`,
        )
        .order("created_at", { ascending: true })
        .limit(200);
      return (data ?? []) as ChatMsg[];
    },
  });

  // Auto-mark peer→me messages as read on thread open/update
  useEffect(() => {
    if (!user || !activePeer || !thread) return;
    const unread = thread.filter((m) => m.receiver_id === user.id && !m.is_read).map((m) => m.id);
    if (unread.length === 0) return;
    supabase
      .from("cos_chat_messages")
      .update({ is_read: true })
      .in("id", unread)
      .then(() => qc.invalidateQueries({ queryKey: ["chat-unread"] }));
  }, [thread, user, activePeer, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread]);

  async function send() {
    if (!user || !activePeer || !draft.trim()) return;
    setSending(true);
    const { error } = await supabase.from("cos_chat_messages").insert({
      sender_id: user.id,
      receiver_id: activePeer.user_id,
      message: draft.trim(),
    });
    setSending(false);
    if (error) return;
    setDraft("");
    qc.invalidateQueries({ queryKey: ["chat-thread"] });
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setActivePeer(null); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label="Team chat">
          <MessageCircle className="h-5 w-5" />
          {unreadTotal > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unreadTotal > 99 ? "99+" : unreadTotal}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[92vw] max-w-sm p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          {activePeer && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setActivePeer(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <p className="text-sm font-semibold">
            {activePeer ? activePeer.name : "Team Chat"}
          </p>
          {activePeer?.role_title && (
            <span className="text-xs text-muted-foreground">· {activePeer.role_title}</span>
          )}
        </div>

        {!activePeer ? (
          <div className="max-h-[60vh] divide-y overflow-y-auto">
            {(peers ?? []).map((p) => {
              const n = unreadBySender.get(p.user_id) ?? 0;
              return (
                <button
                  key={p.user_id}
                  onClick={() => setActivePeer(p)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.role_title ?? "Staff"}</p>
                  </div>
                  {n > 0 && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
            {(peers ?? []).length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                No teammates available for chat yet.
              </p>
            )}
          </div>
        ) : (
          <div className="flex h-[60vh] flex-col">
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
              {(thread ?? []).map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${
                        mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                      }`}
                    >
                      {m.message}
                      <div className={`mt-0.5 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })}
              {(thread ?? []).length === 0 && (
                <p className="pt-10 text-center text-xs text-muted-foreground">Say hi to {activePeer.name}.</p>
              )}
            </div>
            <form
              className="flex items-center gap-2 border-t p-2"
              onSubmit={(e) => { e.preventDefault(); send(); }}
            >
              <Input
                autoFocus
                placeholder="Type a message…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <Button type="submit" size="icon" disabled={sending || !draft.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

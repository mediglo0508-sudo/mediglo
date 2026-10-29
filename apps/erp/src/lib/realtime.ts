import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to realtime changes on a set of tables and invalidate the
 * matching react-query keys so every open dashboard stays in sync instantly.
 */
export function useRealtimeSync(tables: string[], queryKeys: string[]) {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel(`rt-${tables.join("-")}-${Math.random().toString(36).slice(2)}`);
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          for (const key of queryKeys) {
            qc.invalidateQueries({ queryKey: [key] });
          }
        },
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(","), queryKeys.join(",")]);
}

/** Fire a short notification beep + haptic vibration (Stage 4 alerts). */
export function fireAlert() {
  try {
    const AudioCtx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    /* audio not available */
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.([120, 60, 120]);
  }
}

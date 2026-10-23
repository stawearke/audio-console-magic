import { useCallback, useEffect, useRef, useState } from "react";
import { nextClipUntil } from "@/lib/clip";

/** Latching clip lamp: lights when `level` (dB peak) reaches the clip line, holds a few seconds, `clear()` resets it. */
export function useClipLatch(level: number) {
  const [lit, setLit] = useState(false);
  const until = useRef(0);
  useEffect(() => {
    const next = nextClipUntil(level, Date.now(), until.current);
    if (next !== until.current) {
      until.current = next;
      setLit(true);
    }
  }, [level]);
  useEffect(() => {
    if (!lit) return;
    const id = setInterval(() => {
      if (Date.now() >= until.current) setLit(false);
    }, 200);
    return () => clearInterval(id);
  }, [lit]);
  const clear = useCallback(() => {
    until.current = 0;
    setLit(false);
  }, []);
  return { lit, clear };
}

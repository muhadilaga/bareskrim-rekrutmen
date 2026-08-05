"use client";

import { useEffect, useRef, useState } from "react";

export function CountdownTimer({
  seconds,
  onExpire,
}: {
  seconds: number;
  onExpire: () => void;
}) {
  const [left, setLeft] = useState(seconds);
  const fired = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true;
      onExpire();
    }
  }, [left, onExpire]);

  const mm = Math.floor(left / 60)
    .toString()
    .padStart(2, "0");
  const ss = (left % 60).toString().padStart(2, "0");
  const danger = left <= 300;
  const critical = left <= 60;

  function playBeep() {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      // Audio not available
    }
  }

  useEffect(() => {
    if (critical && left > 0 && left % 10 === 0) {
      playBeep();
    }
  }, [left, critical]);

  return (
    <div className="space-y-2">
      {danger && (
        <p
          className={`text-center text-xs font-bold ${
            critical ? "animate-pulse text-red-400" : "text-yellow-400"
          }`}
        >
          ⚠️ Waktu hampir habis!
        </p>
      )}
      <div
        className={`rounded-lg border px-4 py-2 font-mono text-lg font-bold tabular-nums ${
          danger
            ? critical
              ? "border-red-500/60 bg-red-500/20 text-red-400 animate-pulse"
              : "border-red-500/50 bg-red-500/10 text-red-400"
            : "border-gold/40 bg-gold/10 text-gold"
        }`}
      >
        ⏱ {mm}:{ss}
      </div>
    </div>
  );
}
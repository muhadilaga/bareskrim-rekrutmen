"use client";

import { useState, useEffect } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") !== "light";
    }
    return true;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <button
      onClick={() => setDark(!dark)}
      className="rounded-md p-2 text-zinc-300 hover:bg-crimson-800/60 hover:text-gold"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}

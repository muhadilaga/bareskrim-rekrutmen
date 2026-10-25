import React from "react";
import "@/styles/casis.css";

// Login is public. Each protected page must check its session before rendering.
export default function CasisLayout({ children }: { children: React.ReactNode }) {
  return <div className="casis-root">{children}</div>;
}

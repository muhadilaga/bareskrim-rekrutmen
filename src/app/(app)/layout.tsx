import React from "react";
import "@/styles/casis.css";

// Layout casis V2: menggunakan styling casis.css tanpa navbar/footer legacy V1
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="casis-root">{children}</div>;
}

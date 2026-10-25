import type { Metadata } from "next";
import "@/styles/admin.css";

export const metadata: Metadata = {
  title: "Admin Panel — Bareskrim Polri RBX",
  description: "Sistem Administrasi dan Penerimaan Pusdik Reserse Bareskrim Polri RBX",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-root min-h-screen bg-[#0b0b0b] text-[#eeeae2]">
      {children}
    </div>
  );
}

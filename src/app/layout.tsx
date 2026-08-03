import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ToastProvider } from "@/components/ui/Toast";
import { MobileCTA } from "@/components/ui/MobileCTA";

export const metadata: Metadata = {
  title: "Rekrutmen Bareskrim Polri RP",
  description:
    "Sistem Rekrutmen & Ujian Online Resmi Bareskrim Polri Roleplay - Red & Gold.",
  icons: { icon: "/shield.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-screen flex-col">
        <ToastProvider>
          <Navbar />
          <main className="flex-1 pb-16 md:pb-0">{children}</main>
          <Footer />
          <MobileCTA />
        </ToastProvider>
      </body>
    </html>
  );
}

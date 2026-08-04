import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ToastProvider } from "@/components/ui/Toast";
import { MobileCTA } from "@/components/ui/MobileCTA";
import { BackToTop } from "@/components/ui/BackToTop";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export const metadata: Metadata = {
  title: {
    default: "Rekrutmen Bareskrim PolriRbx [RI]",
    template: "%s | Rekrutmen Bareskrim PolriRbx [RI]",
  },
  description:
    "Sistem Rekrutmen & Ujian Online Resmi Bareskrim Polri Roleplay - Verifikasi otomatis, ujian akademik, dan pelaporan real-time.",
  openGraph: {
    title: "Rekrutmen Bareskrim PolriRbx [RI]",
    description: "Sistem Rekrutmen & Ujian Online Resmi Bareskrim Polri Roleplay",
    type: "website",
    locale: "id_ID",
  },
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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  if (theme === 'light') {
                    document.documentElement.classList.remove('dark');
                  } else if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    // Default: ikuti system preference
                    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
                      document.documentElement.classList.remove('dark');
                    } else {
                      document.documentElement.classList.add('dark');
                    }
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col">
        <ToastProvider>
          <Navbar />
          <main className="flex-1 pb-16 md:pb-0">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
          <Footer />
          <MobileCTA />
          <BackToTop />
        </ToastProvider>
      </body>
    </html>
  );
}

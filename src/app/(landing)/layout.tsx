import "@/styles/landing.css";
import { DesignNavbar } from "@/components/landing/DesignNavbar";
import { DesignFooter } from "@/components/landing/DesignFooter";
import { getSiteContent } from "@/lib/site-content";

// Chrome desain asli (index.html): header.navbar + main + footer.footer.
// Semua styling dikunci di bawah .design-root (landing.css).
export default async function LandingLayout({ children }: { children: React.ReactNode }) {
  const content = await getSiteContent();

  return (
    <div className="design-root">
      <DesignNavbar />
      <main style={{ minHeight: "909px" }}>{children}</main>
      <DesignFooter motto={content.footerMotto} notice={content.footerNotice} />
    </div>
  );
}

import Link from "next/link";

interface DesignFooterProps {
  motto?: string;
  notice?: string;
}

// Footer desain asli (index.html → footer.footer).
export function DesignFooter({ motto, notice }: DesignFooterProps) {
  return (
    <footer className="footer">
      <div className="footer-brand">
        <img src="/design-assets/logo-pusdik.png" alt="Pusdik Reserse" />
        <div>
          <strong>BARESKRIM POLRI RBX</strong>
          <span>PUSDIK RESERSE</span>
        </div>
      </div>

      <p>{motto || "Disiplin. Integritas. Profesional."}</p>

      <span>{notice || "© 2026 Bareskrim Polri RBX"}</span>
    </footer>
  );
}

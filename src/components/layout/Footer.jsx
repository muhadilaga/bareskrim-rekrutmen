// src/components/layout/Footer.jsx
export function Footer() {
  return (
    <footer className="border-t border-white/10 py-4 text-center text-sm text-zinc-500">
      <div className="mx-auto max-w-6xl px-4">
        <p>© {new Date().getFullYear()} Rekrutmen Bareskrim Polri RP. All rights reserved.</p>
      </div>
    </footer>
  );
}

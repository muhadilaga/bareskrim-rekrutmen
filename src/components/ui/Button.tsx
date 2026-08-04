import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "gold" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-crimson-800 to-crimson text-zinc-50 border border-gold/40 hover:from-crimson hover:to-crimson-700 shadow-glow",
  gold: "bg-gradient-to-r from-gold-300 via-gold to-gold-600 text-crimson-950 border border-gold-400/50 hover:brightness-110 shadow-glow",
  ghost:
    "bg-white/5 text-zinc-200 border border-white/15 hover:bg-white/10 hover:border-gold/40",
  danger:
    "bg-gradient-to-r from-red-900 to-crimson text-zinc-50 border border-red-500/40 hover:from-red-800",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export function Button({ variant = "primary", className, loading, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="btn-spinner" />}
      {children}
    </button>
  );
}

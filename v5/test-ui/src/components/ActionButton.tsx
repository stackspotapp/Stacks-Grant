import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

export function ActionButton({
  loading,
  variant = "primary",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary:
      "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white",
    secondary:
      "border border-[var(--color-border)] bg-transparent hover:bg-white/5 text-white",
    danger: "bg-[var(--color-error)]/90 hover:bg-[var(--color-error)] text-white",
  };

  return (
    <button
      type="button"
      disabled={loading || props.disabled}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${styles[variant]}`}
      {...props}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

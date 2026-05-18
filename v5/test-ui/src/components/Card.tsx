import type { ReactNode } from "react";

export function Card({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-[var(--color-muted)]">{description}</p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

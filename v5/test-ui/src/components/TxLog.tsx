import { ScrollText } from "lucide-react";
import { useApp } from "../context/AppContext";

export function TxLog() {
  const { txLog } = useApp();

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-panel)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <ScrollText size={16} className="text-[var(--color-muted)]" />
        <span className="text-sm font-medium">Transaction log</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {txLog.length === 0 ? (
          <p className="p-2 text-xs text-[var(--color-muted)]">No transactions yet.</p>
        ) : (
          txLog.map((entry) => (
            <div
              key={entry.id}
              className="mb-2 rounded-lg border border-[var(--color-border)] bg-black/20 p-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-white">{entry.label}</span>
                <span
                  className={
                    entry.status === "success"
                      ? "text-[var(--color-success)]"
                      : entry.status === "error"
                        ? "text-[var(--color-error)]"
                        : "text-amber-400"
                  }
                >
                  {entry.status}
                </span>
              </div>
              <p className="text-[var(--color-muted)]">{entry.time}</p>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-slate-300">
                {entry.detail}
              </pre>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

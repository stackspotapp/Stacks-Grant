import { useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";

export function SourceViewer({
  source,
  sourcePath,
}: {
  source: string;
  sourcePath: string;
}) {
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => source.split("\n"), [source]);

  const copy = async () => {
    await navigator.clipboard.writeText(source);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-mono text-xs text-[var(--color-muted)]">{sourcePath}</p>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-white/5"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy source"}
        </button>
      </div>
      <pre className="max-h-[28rem] overflow-auto rounded-lg border border-[var(--color-border)] bg-[#0a0e14] p-0 text-xs leading-relaxed text-slate-300">
        <code className="grid">
          {lines.map((line, i) => (
            <span key={i} className="grid grid-cols-[3rem_1fr] hover:bg-white/[0.03]">
              <span className="select-none border-r border-[var(--color-border)] pr-3 text-right text-[var(--color-muted)]">
                {i + 1}
              </span>
              <span className="overflow-x-auto whitespace-pre px-3">{line || " "}</span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

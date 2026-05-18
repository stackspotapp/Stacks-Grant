import { useMemo, useState } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";

type Props = {
  source: string;
  sourcePath: string;
  onChange: (source: string) => void;
  onReset: () => void;
  isModified: boolean;
};

export function SourceEditor({
  source,
  sourcePath,
  onChange,
  onReset,
  isModified,
}: Props) {
  const [copied, setCopied] = useState(false);
  const lineCount = useMemo(() => source.split("\n").length, [source]);

  const copy = async () => {
    await navigator.clipboard.writeText(source);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-[var(--color-muted)]">{sourcePath}</p>
          <p className="text-[10px] text-[var(--color-muted)]">
            {lineCount.toLocaleString()} lines · edit before deploy
            {isModified && (
              <span className="ml-2 text-amber-400">· modified from template</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isModified && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-white/5"
            >
              <RotateCcw size={12} />
              Reset template
            </button>
          )}
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-white/5"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy source"}
          </button>
        </div>
      </div>

      <textarea
        value={source}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="max-h-[32rem] min-h-[18rem] w-full resize-y rounded-lg border border-[var(--color-border)] bg-[#0a0e14] p-3 font-mono text-xs leading-relaxed text-slate-300 outline-none focus:border-[var(--color-accent)]"
        aria-label="Clarity contract source"
      />
    </div>
  );
}

import { formatClarityJson } from "../lib/clarityDisplay";

export function ResultBox({ data }: { data: unknown }) {
  return (
    <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-black/30 p-3 font-mono text-xs text-slate-300">
      {formatClarityJson(data)}
    </pre>
  );
}

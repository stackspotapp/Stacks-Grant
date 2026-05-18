export type AbiTypeKind =
  | "uint"
  | "int"
  | "bool"
  | "principal"
  | "trait"
  | "buffer"
  | "string-ascii"
  | "string-utf8"
  | "optional"
  | "tuple"
  | "list"
  | "unknown";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Classify Stacks /v2/contracts/interface ABI type (string or nested object). */
export function classifyAbiType(type: unknown): AbiTypeKind {
  if (typeof type === "string") {
    const s = type.toLowerCase();
    if (s === "bool") return "bool";
    if (s === "principal") return "principal";
    if (s.startsWith("uint")) return "uint";
    if (s.startsWith("int")) return "int";
    if (s.includes("trait")) return "trait";
    if (s.includes("buff")) return "buffer";
    if (s.includes("string-ascii")) return "string-ascii";
    if (s.includes("string-utf8")) return "string-utf8";
    if (s.includes("optional")) return "optional";
    if (s.includes("tuple")) return "tuple";
    if (s.includes("list")) return "list";
    return "unknown";
  }

  if (!isRecord(type)) return "unknown";

  if ("buffer" in type) return "buffer";
  if ("string-ascii" in type) return "string-ascii";
  if ("string-utf8" in type) return "string-utf8";
  if ("optional" in type) return "optional";
  if ("tuple" in type) return "tuple";
  if ("list" in type) return "list";
  if ("trait_reference" in type) return "trait";

  return "unknown";
}

/** Human-readable label for UI. */
export function formatAbiType(type: unknown): string {
  if (typeof type === "string") return type;

  if (!isRecord(type)) return String(type);

  const kind = classifyAbiType(type);
  switch (kind) {
    case "buffer": {
      const buf = type.buffer as { length?: number } | undefined;
      return `(buff ${buf?.length ?? "?"})`;
    }
    case "string-ascii": {
      const s = type["string-ascii"] as { length?: number } | undefined;
      return `(string-ascii ${s?.length ?? "?"})`;
    }
    case "string-utf8": {
      const s = type["string-utf8"] as { length?: number } | undefined;
      return `(string-utf8 ${s?.length ?? "?"})`;
    }
    case "optional":
      return `(optional ${formatAbiType(type.optional)})`;
    case "tuple":
      return "(tuple …)";
    case "list": {
      const list = type.list as { length?: number; type?: unknown } | undefined;
      return `(list ${list?.length ?? "?"} ${formatAbiType(list?.type)})`;
    }
    case "trait":
      return "(trait-reference …)";
    default:
      return JSON.stringify(type);
  }
}

export function abiTypeIncludes(type: unknown, needle: string): boolean {
  return formatAbiType(type).toLowerCase().includes(needle.toLowerCase());
}

/** Inner type for `(optional T)` ABI nodes. */
export function getOptionalInnerType(type: unknown): unknown {
  if (!isRecord(type) || !("optional" in type)) return type;
  return type.optional;
}

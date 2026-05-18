/** True when `type` is a composite Clarity type that wraps nested values. */
function isStructuredClarityType(type: string): boolean {
  return (
    type.startsWith("(tuple") ||
    type.startsWith("(response") ||
    type.startsWith("(optional") ||
    type.startsWith("(list")
  );
}

function finalizePrimitive(type: string, value: unknown): unknown {
  if (type === "uint" || type === "int") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (type === "bool") return Boolean(value);
  return value;
}

/**
 * Turn `cvToJSON()` output into plain JSON (numbers, strings, objects)
 * without Clarity type signature strings.
 */
export function clarityToDisplay(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(clarityToDisplay);

  const o = value as Record<string, unknown>;

  if ("type" in o && "value" in o) {
    const typeStr = String(o.type);

    if (o.success === false) {
      return { err: clarityToDisplay(o.value) };
    }

    if (typeStr.includes("none") && (o.value === null || o.value === undefined)) {
      return null;
    }

    if (!isStructuredClarityType(typeStr)) {
      return finalizePrimitive(typeStr, o.value);
    }

    return clarityToDisplay(o.value);
  }

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(o)) {
    if (key === "success") continue;
    out[key] = clarityToDisplay(entry);
  }
  return out;
}

export function formatClarityJson(value: unknown, indent = 2): string {
  return JSON.stringify(clarityToDisplay(value), null, indent);
}

/** JSON.stringify that supports bigint (e.g. Cl.uint values before wallet sign). */
export function safeJsonStringify(value: unknown, indent = 2): string {
  return JSON.stringify(
    value,
    (_key, v) => (typeof v === "bigint" ? v.toString() : v),
    indent,
  );
}

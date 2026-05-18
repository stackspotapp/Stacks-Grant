/** Matches deployer.contract-name (testnet/mainnet ST addresses). */
const CONTRACT_PRINCIPAL_RE =
  /^(ST[A-Z0-9]{10,50})\.([a-z][a-z0-9-]+)$/;

/** First valid contract principal embedded in a Clarity repr or URL fragment. */
const CONTRACT_PRINCIPAL_IN_TEXT_RE =
  /(ST[A-Z0-9]{10,50}\.[a-z][a-z0-9-]+)/;

export function parseContractPrincipal(value: string): {
  address: string;
  name: string;
  full: string;
} | null {
  const trimmed = value.trim();
  const m = CONTRACT_PRINCIPAL_RE.exec(trimmed);
  if (!m) return null;
  return {
    address: m[1]!,
    name: m[2]!,
    full: `${m[1]}.${m[2]}`,
  };
}

/** Pull the first `STxxxx.contract-name` out of arbitrary text (event repr, bad URLs). */
export function extractContractPrincipal(text: string): {
  address: string;
  name: string;
  full: string;
} | null {
  const m = CONTRACT_PRINCIPAL_IN_TEXT_RE.exec(text);
  if (!m?.[1]) return null;
  return parseContractPrincipal(m[1]);
}

/**
 * Parse `STxxxx.contract-name` from a Clarity print repr field.
 * Clarity principals use a leading `'` without a closing `'`, so naive
 * `'([^']+)'` captures the rest of the tuple — we locate the field then
 * match only the principal pattern.
 */
export function fieldContractPrincipal(repr: string, field: string): string {
  const fieldIdx = repr.indexOf(field);
  if (fieldIdx < 0) return "";
  const afterField = repr.slice(fieldIdx + field.length);
  const extracted = extractContractPrincipal(afterField);
  return extracted?.full ?? "";
}

/** Decode React Router pot detail segments into a canonical principal. */
export function parsePotRouteParams(
  addressParam: string,
  nameParam: string,
): { address: string; name: string; full: string } | null {
  const address = decodeURIComponent(addressParam).trim();
  const name = decodeURIComponent(nameParam).trim();

  const combined = parseContractPrincipal(`${address}.${name}`);
  if (combined) return combined;

  return (
    extractContractPrincipal(`${address}.${name}`) ??
    extractContractPrincipal(name) ??
    null
  );
}

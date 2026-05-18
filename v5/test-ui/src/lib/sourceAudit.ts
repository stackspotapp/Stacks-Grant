/** Normalized source fingerprint for human audit trails (not on-chain contract-hash). */
export async function sha256HexUtf8(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function countSourceLines(source: string): number {
  return source.split("\n").length;
}

export function validateContractName(name: string): string | null {
  if (!name.trim()) return "Contract name is required";
  if (name.length > 128) return "Name too long";
  if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) {
    return "Use letters, numbers, hyphens; must start with a letter";
  }
  return null;
}

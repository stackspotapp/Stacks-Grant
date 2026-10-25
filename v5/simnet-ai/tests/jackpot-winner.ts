import { ClarityType } from "@stacks/transactions";

export type WinnerHit = {
  id: string;
  address: string;
  party: string;
};

function unwrapCv(node: unknown): unknown {
  if (node === null || node === undefined) return node;
  if (typeof node !== "object") return node;
  const n = node as { type?: string | number; value?: unknown; data?: unknown };
  if (n.type === ClarityType.OptionalNone || n.type === "none") return null;
  if (n.type === ClarityType.OptionalSome || n.type === "some") return unwrapCv(n.value);
  if (n.type === ClarityType.ResponseOk || n.type === "ok") return unwrapCv(n.value);
  if (n.type === ClarityType.ResponseErr || n.type === "err") return unwrapCv(n.value);
  if (n.type === ClarityType.Tuple || n.type === "tuple") {
    const inner = (n.value ?? n.data) as unknown;
    if (inner && typeof inner === "object" && "data" in (inner as object)) {
      return mapTuple((inner as { data: Record<string, unknown> }).data);
    }
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return mapTuple(inner as Record<string, unknown>);
    }
    return inner;
  }
  if ("data" in n && n.data && typeof n.data === "object") {
    return mapTuple(n.data as Record<string, unknown>);
  }
  if ("value" in n) return unwrapCv(n.value);
  return node;
}

function mapTuple(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) out[k] = unwrapCv(v);
  return out;
}

function asAddress(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node === "object" && "value" in (node as object)) {
    return String((node as { value: unknown }).value ?? "");
  }
  return String(node);
}

function asId(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "bigint" || typeof node === "number" || typeof node === "string") return String(node);
  if (typeof node === "object" && "value" in (node as object)) {
    return String((node as { value: unknown }).value ?? "");
  }
  return String(node);
}

export function partyLabel(address: string | undefined, parties: Record<string, string>): string {
  if (!address) return "none";
  return parties[address] ?? address;
}

function hitFromTuple(v: unknown, parties: Record<string, string>): WinnerHit | null {
  if (!v || typeof v !== "object") return null;
  const t = v as { "winner-id"?: unknown; "winner-address"?: unknown };
  const address = asAddress(t["winner-address"]);
  if (!address) return null;
  return { id: asId(t["winner-id"]), address, party: partyLabel(address, parties) };
}

export function winnerFromGetWinner(result: unknown, parties: Record<string, string>): WinnerHit | null {
  return hitFromTuple(unwrapCv(result), parties);
}

export function winnerFromPotDetails(result: unknown, parties: Record<string, string>): WinnerHit | null {
  const v = unwrapCv(result) as { "winners-values"?: unknown } | null;
  if (!v || typeof v !== "object") return null;
  return hitFromTuple(v["winners-values"], parties);
}

export function principalRole(
  result: unknown,
  field: string,
  parties: Record<string, string>
): WinnerHit | null {
  const v = unwrapCv(result) as Record<string, unknown> | null;
  if (!v || typeof v !== "object") return null;
  const address = asAddress(v[field]);
  if (!address) return null;
  return { id: field, address, party: partyLabel(address, parties) };
}

export function potRewardAmount(result: unknown): string {
  const v = unwrapCv(result) as { "pot-reward-amount"?: unknown } | null;
  if (!v || typeof v !== "object") return "none";
  return asId(v["pot-reward-amount"]);
}

export type SbtcSnap = Record<string, string>;

export function payoutLine(args: {
  scenario: string;
  potPre: string;
  potPost: string;
  potReward: string;
  starter: WinnerHit | null;
  claimer: WinnerHit | null;
  winner: WinnerHit | null;
  starterSbtc: string;
  claimerSbtc: string;
  winnerSbtc: string;
  starterDelta: string;
  claimerDelta: string;
  winnerDelta: string;
}): string {
  return (
    `SBTC ${args.scenario} pot pre=${args.potPre} post=${args.potPost} details-reward=${args.potReward}` +
    ` starter ${args.starter?.party ?? "none"} sbtc=${args.starterSbtc} d=${args.starterDelta}` +
    ` claimer ${args.claimer?.party ?? "none"} sbtc=${args.claimerSbtc} d=${args.claimerDelta}` +
    ` winner ${args.winner?.party ?? "none"} sbtc=${args.winnerSbtc} d=${args.winnerDelta}`
  );
}

export function winnerLine(scenario: string, stored: WinnerHit | null, reroll: WinnerHit | null): string {
  const same = !!(stored?.address && stored.address === reroll?.address);
  return `WINNER ${scenario} stored id=${stored?.id ?? "none"} ${stored?.party ?? "none"} reroll id=${reroll?.id ?? "none"} ${reroll?.party ?? "none"} same=${same}`;
}

export function deltaSbtc(pre: SbtcSnap | undefined, address: string | undefined, post: bigint): string {
  if (!address || !pre || pre[address] === undefined) return "na";
  return (post - BigInt(pre[address])).toString();
}

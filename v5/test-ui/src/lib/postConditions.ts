import {
  Pc,
  type ContractIdString,
  type PostCondition,
  type PostConditionModeName,
} from "@stacks/transactions";

export type PostConditionDraft = {
  id: string;
  principal: "origin" | "standard";
  address?: string;
  comparator: "eq" | "lte" | "gte";
  asset: "ustx" | "ft";
  amount: string;
  ftContract?: string;
  ftAsset?: string;
};

export type PostConditionsState = {
  mode: PostConditionModeName;
  drafts: PostConditionDraft[];
};

export function createPostConditionDraft(
  partial?: Partial<PostConditionDraft>,
): PostConditionDraft {
  return {
    id: crypto.randomUUID(),
    principal: "origin",
    comparator: "lte",
    asset: "ustx",
    amount: "",
    ...partial,
  };
}

export const defaultPostConditionsState = (): PostConditionsState => ({
  mode: "deny",
  drafts: [],
});

export function draftToPostCondition(draft: PostConditionDraft): PostCondition {
  const amount = draft.amount.trim();
  if (!amount) {
    throw new Error("Post condition amount is required");
  }

  let value: bigint;
  try {
    value = BigInt(amount);
  } catch {
    throw new Error(`Invalid post condition amount: ${draft.amount}`);
  }

  const base =
    draft.principal === "origin"
      ? Pc.origin()
      : Pc.principal(draft.address?.trim() ?? "");

  const chain =
    draft.comparator === "eq"
      ? base.willSendEq(value)
      : draft.comparator === "lte"
        ? base.willSendLte(value)
        : base.willSendGte(value);

  if (draft.asset === "ustx") {
    return chain.ustx();
  }

  const ftContract = draft.ftContract?.trim();
  const ftAsset = draft.ftAsset?.trim();
  if (!ftContract || !ftAsset) {
    throw new Error("FT post condition requires contract id and asset name");
  }

  return chain.ft(ftContract as ContractIdString, ftAsset);
}

export function buildPostConditions(
  state: PostConditionsState,
): PostCondition[] {
  return state.drafts.map(draftToPostCondition);
}

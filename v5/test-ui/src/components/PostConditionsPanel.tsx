import { Plus, Trash2 } from "lucide-react";
import type { PostConditionModeName } from "@stacks/transactions";
import { IDS } from "../config/contracts";
import {
  createPostConditionDraft,
  type PostConditionsState,
} from "../lib/postConditions";
import { ActionButton } from "./ActionButton";

type Props = {
  value: PostConditionsState;
  onChange: (value: PostConditionsState) => void;
};

const inputClass =
  "mt-1 w-full rounded border border-[var(--color-border)] bg-black/20 px-2 py-1 font-mono text-sm text-white";

export function PostConditionsPanel({ value, onChange }: Props) {
  const updateDraft = (
    id: string,
    patch: Partial<PostConditionsState["drafts"][number]>,
  ) => {
    onChange({
      ...value,
      drafts: value.drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-black/10 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-[var(--color-muted)]">
          Post-condition mode
          <select
            value={value.mode}
            onChange={(e) =>
              onChange({
                ...value,
                mode: e.target.value as PostConditionModeName,
              })
            }
            className={inputClass}
          >
            <option value="deny">deny — block transfers not listed</option>
            <option value="allow">allow — permit extra transfers</option>
          </select>
        </label>
        <ActionButton
          variant="secondary"
          onClick={() =>
            onChange({
              ...value,
              drafts: [
                ...value.drafts,
                createPostConditionDraft({
                  ftContract: IDS.sbtc,
                  ftAsset: "sbtc-token",
                }),
              ],
            })
          }
        >
          <Plus size={14} />
          Add condition
        </ActionButton>
      </div>

      {value.drafts.length === 0 && (
        <p className="text-xs text-[var(--color-muted)]">
          No post conditions — wallet uses mode only. Add rows to cap STX or FT
          transfers from origin or a principal.
        </p>
      )}

      {value.drafts.map((draft, index) => (
        <div
          key={draft.id}
          className="space-y-2 rounded border border-[var(--color-border)]/60 bg-black/20 p-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--color-muted)]">
              Condition {index + 1}
            </span>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  drafts: value.drafts.filter((d) => d.id !== draft.id),
                })
              }
              className="text-[var(--color-muted)] hover:text-[var(--color-error)]"
              aria-label="Remove condition"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-[var(--color-muted)]">
              Principal
              <select
                value={draft.principal}
                onChange={(e) =>
                  updateDraft(draft.id, {
                    principal: e.target.value as "origin" | "standard",
                  })
                }
                className={inputClass}
              >
                <option value="origin">origin (sender)</option>
                <option value="standard">standard address</option>
              </select>
            </label>

            {draft.principal === "standard" && (
              <label className="text-xs text-[var(--color-muted)] sm:col-span-2">
                Address
                <input
                  type="text"
                  value={draft.address ?? ""}
                  onChange={(e) =>
                    updateDraft(draft.id, { address: e.target.value })
                  }
                  placeholder="ST1PQH…"
                  className={inputClass}
                />
              </label>
            )}

            <label className="text-xs text-[var(--color-muted)]">
              Comparator
              <select
                value={draft.comparator}
                onChange={(e) =>
                  updateDraft(draft.id, {
                    comparator: e.target.value as "eq" | "lte" | "gte",
                  })
                }
                className={inputClass}
              >
                <option value="eq">will send eq</option>
                <option value="lte">will send lte</option>
                <option value="gte">will send gte</option>
              </select>
            </label>

            <label className="text-xs text-[var(--color-muted)]">
              Asset
              <select
                value={draft.asset}
                onChange={(e) =>
                  updateDraft(draft.id, {
                    asset: e.target.value as "ustx" | "ft",
                  })
                }
                className={inputClass}
              >
                <option value="ustx">STX (micro-STX)</option>
                <option value="ft">Fungible token</option>
              </select>
            </label>

            <label className="text-xs text-[var(--color-muted)]">
              Amount
              <input
                type="text"
                value={draft.amount}
                onChange={(e) =>
                  updateDraft(draft.id, { amount: e.target.value })
                }
                placeholder="e.g. 100000"
                className={inputClass}
              />
            </label>

            {draft.asset === "ft" && (
              <>
                <label className="text-xs text-[var(--color-muted)] sm:col-span-2">
                  FT contract
                  <input
                    type="text"
                    value={draft.ftContract ?? ""}
                    onChange={(e) =>
                      updateDraft(draft.id, { ftContract: e.target.value })
                    }
                    placeholder={IDS.sbtc}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs text-[var(--color-muted)]">
                  Asset name
                  <input
                    type="text"
                    value={draft.ftAsset ?? ""}
                    onChange={(e) =>
                      updateDraft(draft.id, { ftAsset: e.target.value })
                    }
                    placeholder="sbtc-token"
                    className={inputClass}
                  />
                </label>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

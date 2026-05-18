import { JsonRpcError, JsonRpcErrorCode } from "@stacks/connect";

export function walletErrorMessage(error: unknown): string {
  if (error instanceof JsonRpcError) {
    if (
      error.code === JsonRpcErrorCode.UserRejection ||
      error.code === JsonRpcErrorCode.UserCanceled
    ) {
      return "Transaction cancelled in wallet";
    }
    if (error.message) return error.message;
  }

  if (error && typeof error === "object") {
    const e = error as { message?: string; data?: { message?: string } };
    const msg = e.message ?? e.data?.message ?? "";
    if (/user rejected|rejected request|cancelled|canceled/i.test(msg)) {
      return "Transaction cancelled in wallet";
    }
    if (msg) return msg;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isWalletUserRejection(error: unknown): boolean {
  return walletErrorMessage(error).includes("cancelled in wallet");
}

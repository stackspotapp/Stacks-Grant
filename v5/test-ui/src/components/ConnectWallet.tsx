import { LogIn, LogOut, Wallet } from "lucide-react";
import { useApp } from "../context/AppContext";
import { ActionButton } from "./ActionButton";
import { formatMicroStx, fetchStxBalance } from "../lib/stacks";
import { useEffect, useState } from "react";

export function ConnectWallet() {
  const { isWalletConnected, connect, disconnect, userAddress } = useApp();
  const [balance, setBalance] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!userAddress) {
      setBalance(null);
      return;
    }
    void fetchStxBalance(userAddress).then(setBalance);
  }, [userAddress]);

  if (isWalletConnected && userAddress) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <Wallet size={14} />
          <span>Connected</span>
        </div>
        <p className="truncate font-mono text-[10px] text-slate-300">{userAddress}</p>
        {balance !== null && (
          <p className="text-xs text-[var(--color-muted)]">{formatMicroStx(balance)}</p>
        )}
        <ActionButton variant="secondary" className="w-full" onClick={disconnect}>
          <LogOut size={14} />
          Disconnect
        </ActionButton>
      </div>
    );
  }

  return (
    <ActionButton
      className="w-full"
      loading={connecting}
      onClick={async () => {
        setConnecting(true);
        try {
          await connect();
        } finally {
          setConnecting(false);
        }
      }}
    >
      <LogIn size={14} />
      Connect wallet
    </ActionButton>
  );
}

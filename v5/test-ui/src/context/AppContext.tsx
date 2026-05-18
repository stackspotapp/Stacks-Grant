import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createNetwork, fetchChainInfo, type ChainInfo } from "../config/network";
import type { StacksNetwork } from "@stacks/network";
import {
  connectWallet,
  disconnectWallet,
  getCachedSession,
  type WalletSession,
} from "../lib/wallet";
export type TxLogEntry = {
  id: string;
  time: string;
  label: string;
  status: "pending" | "success" | "error";
  detail: string;
};

type AppContextValue = {
  network: StacksNetwork;
  chainInfo: ChainInfo | null;
  apiOnline: boolean;
  refreshChain: () => Promise<void>;
  session: WalletSession | null;
  isWalletConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  userAddress: string | null;
  txLog: TxLogEntry[];
  appendLog: (entry: Omit<TxLogEntry, "id" | "time">) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const network = useMemo(() => createNetwork(), []);
  const [chainInfo, setChainInfo] = useState<ChainInfo | null>(null);
  const [apiOnline, setApiOnline] = useState(false);
  const [session, setSession] = useState<WalletSession | null>(() =>
    getCachedSession(),
  );
  const isWalletConnected = Boolean(session?.address);
  const [txLog, setTxLog] = useState<TxLogEntry[]>([]);

  const refreshChain = useCallback(async () => {
    const info = await fetchChainInfo();
    setChainInfo(info);
    setApiOnline(info !== null);
  }, []);

  useEffect(() => {
    void refreshChain();
    const id = setInterval(() => void refreshChain(), 15_000);
    return () => clearInterval(id);
  }, [refreshChain]);

  useEffect(() => {
    setSession(getCachedSession());
  }, []);

  const connect = useCallback(async () => {
    const s = await connectWallet();
    setSession(s);
  }, []);

  const disconnect = useCallback(() => {
    disconnectWallet();
    setSession(null);
  }, []);

  const appendLog = useCallback((entry: Omit<TxLogEntry, "id" | "time">) => {
    setTxLog((prev) => [
      {
        ...entry,
        id: crypto.randomUUID(),
        time: new Date().toLocaleTimeString(),
      },
      ...prev.slice(0, 99),
    ]);
  }, []);

  const value: AppContextValue = {
    network,
    chainInfo,
    apiOnline,
    refreshChain,
    session,
    isWalletConnected,
    connect,
    disconnect,
    userAddress: session?.address ?? null,
    txLog,
    appendLog,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

/**
 * Root application context: configuration, SDK instance, authentication
 * (browser-wallet on devnet/mainnet, auto-created dev keypair on local), the
 * selected pair and the trade client.
 */
import {
  DELEGATION_PROGRAM_ID,
  MagiCLOBSDK,
} from "@magiclob/sdk";
import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import {
  BackpackWalletAdapter,
} from "@solana/wallet-adapter-backpack";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { WalletReadyState, WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { NetworkConfig, NetworkPair } from "@/config/networks";
import { localDemoKeypair } from "@/config/demo";
import { createSDK, clientRpcUrl, tradeLayer } from "@/lib/sdk";
import { TradeClient, type SendMode } from "@/lib/trades";
import { useToast } from "./useToast";

const LOCAL_KEYPAIR_KEY = "magicbook.local.keypair";

function localKeypair(): Keypair {
  return localDemoKeypair();
}

function walletAdapters(network: string) {
  const cluster =
    network === "mainnet" ? WalletAdapterNetwork.Mainnet : WalletAdapterNetwork.Devnet;
  return [
    new PhantomWalletAdapter(),
    new BackpackWalletAdapter(),
    new SolflareWalletAdapter({ network: cluster }),
  ];
}

// Auth

export interface AuthValue {
  status: "loading" | "disconnected" | "connected";
  publicKey: PublicKey | null;
  mode: "wallet" | "keypair" | null;
  signMode: SendMode | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  airdrop: () => Promise<string | null>;
}

const AuthCtx = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthCtx);
  if (!value) throw new Error("useAuth outside AuthProvider");
  return value;
}

/** Local demo: an auto-created dev keypair, airdropped by the local validator. */
function LocalAuthProvider({
  cfg,
  children,
}: {
  cfg: NetworkConfig;
  children: React.ReactNode;
}) {
  const toast = useToast();
  const [keypair, setKeypair] = useState<Keypair | null>(null);

  useEffect(() => {
    let stored: Keypair | null = null;
    try {
      const raw = window.localStorage.getItem(LOCAL_KEYPAIR_KEY);
      if (raw) stored = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    } catch {
      stored = null;
    }
    // Deterministic demo keypair so setup scripts can fund it in advance.
    const demo = localKeypair();
    const use = stored && stored.publicKey.equals(demo.publicKey) ? stored : demo;
    if (!stored || !stored.publicKey.equals(demo.publicKey)) {
      window.localStorage.setItem(
        LOCAL_KEYPAIR_KEY,
        JSON.stringify(Array.from(use.secretKey))
      );
    }
    setKeypair(use);
    const conn = new Connection(clientRpcUrl(cfg.rpcUrl), "confirmed");
    void conn
      .getBalance(use.publicKey)
      .then(async (balance) => {
        if (balance >= 5e8) return;
        try {
          await conn.requestAirdrop(use.publicKey, 10e9);
          toast.push(
            "success",
            "Local demo keypair funded",
            "10 SOL airdropped by the local validator"
          );
        } catch (err) {
          toast.push(
            "error",
            "Airdrop failed - is a local validator running?",
            String(err)
          );
        }
      })
      .catch(() => {});
  }, [cfg.rpcUrl, toast]);

  const airdrop = useCallback(async () => {
    if (!keypair) return null;
    const conn = new Connection(clientRpcUrl(cfg.rpcUrl), "confirmed");
    try {
      return await conn.requestAirdrop(keypair.publicKey, 10e9);
    } catch (err) {
      toast.push("error", "Airdrop failed", String(err));
      return null;
    }
  }, [cfg.rpcUrl, keypair, toast]);

  const value = useMemo<AuthValue>(
    () =>
      keypair
        ? {
            status: "connected",
            publicKey: keypair.publicKey,
            mode: "keypair",
            signMode: { kind: "keypair", keypair },
            connect: async () => {},
            disconnect: async () => {},
            airdrop,
          }
        : {
            status: "loading",
            publicKey: null,
            mode: null,
            signMode: null,
            connect: async () => {},
            disconnect: async () => {},
            airdrop: async () => null,
          },
    [keypair, airdrop]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/** devnet/mainnet: real browser wallet through wallet-adapter. */
function WalletAuthProvider({
  cfg,
  children,
}: {
  cfg: NetworkConfig;
  children: React.ReactNode;
}) {
  const wallet = useWallet();
  const connected = wallet.connected && !!wallet.publicKey;
  const toast = useToast();

  // Live handle: avoid stale closures while waking up the selected adapter.
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  const connect = useCallback(async () => {
    const ctx = walletRef.current;
    if (ctx.connecting || ctx.connected) return;
    if (ctx.wallet) {
      await ctx.connect();
      return;
    }
    // No wallet has been selected yet: pick the first usable adapter and
    // activate it before connecting. `select` only changes the provider's
    // internal selection, so wait until it is wired up, then connect.
    const candidates = (ctx.wallets ?? [])
      .filter(
        (w) =>
          w.readyState === WalletReadyState.Installed ||
          w.readyState === WalletReadyState.Loadable
      )
      .sort((a, b) =>
        a.readyState === b.readyState
          ? 0
          : a.readyState === WalletReadyState.Installed
            ? -1
            : 1
      );
    const candidate = candidates[0];
    if (!candidate) {
      throw new Error("No Solana wallet detected in this browser.");
    }
    ctx.select(candidate.adapter.name);
    for (let i = 0; i < 120 && !walletRef.current.wallet; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!walletRef.current.wallet) {
      throw new Error("Could not activate the Solana wallet.");
    }
    await walletRef.current.connect();
  }, []);

  const value = useMemo<AuthValue>(() => {
    const sendTransaction = wallet.sendTransaction;
    const airdrop =
      cfg.network === "mainnet"
        ? (async () => null)
        : (async () => {
            const pk = walletRef.current.publicKey;
            if (!pk) return null;
            const conn = new Connection(clientRpcUrl(cfg.rpcUrl), "confirmed");
            try {
              const sig = await conn.requestAirdrop(pk, 2e9);
              await conn.confirmTransaction(sig, "confirmed").catch(() => {});
              return sig;
            } catch (err) {
              toast.push("error", "Airdrop failed", String(err));
              return null;
            }
          });
    return {
      status: wallet.connecting ? "loading" : connected ? "connected" : "disconnected",
      publicKey: wallet.publicKey ?? null,
      mode: connected ? "wallet" : null,
      signMode:
        connected && wallet.publicKey
          ? {
              kind: "wallet",
              feePayer: wallet.publicKey,
              sendTransaction,
            }
          : null,
      connect,
      disconnect: () => wallet.disconnect(),
      airdrop,
    };
  }, [wallet, connected, connect, cfg.rpcUrl, cfg.network, toast]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// App context

export interface AppValue {
  cfg: NetworkConfig;
  sdk: MagiCLOBSDK;
  auth: AuthValue;
  pair: NetworkPair;
  setPair: (symbol: string) => void;
  /** PublicKey of the selected market, or null when not set up on this network. */
  market: PublicKey | null;
  tradeClient: TradeClient | null;
  delegated: boolean;
  setDelegated: (value: boolean) => void;
  layer: "base" | "ephemeral";
  /** Monotonic write counter - consumers use it as a refresh dependency. */
  nonce: number;
  bump: () => void;
}

const AppCtx = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const value = useContext(AppCtx);
  if (!value) throw new Error("useApp outside AppProvider");
  return value;
}

function CoreProvider({
  cfg,
  sdk,
  children,
}: {
  cfg: NetworkConfig;
  sdk: MagiCLOBSDK;
  children: React.ReactNode;
}) {
  const auth = useAuth();
  const [pairSymbol, setPairSymbol] = useState<string | null>(null);
  const [delegated, setDelegatedState] = useState(false);
  const [nonce, setNonce] = useState(0);

  const pair =
    cfg.pairs.find((p) => p.symbol === pairSymbol) ??
    cfg.pairs.find((p) => p.market) ??
    cfg.pairs[0];

  const market = useMemo(
    () => (pair?.market ? new PublicKey(pair.market) : null),
    [pair]
  );

  useEffect(() => {
    if (!pairSymbol && pair) setPairSymbol(pair.symbol);
  }, [pair, pairSymbol]);

  const tradeClient = useMemo(() => {
    if (!auth.signMode || !market) return null;
    return new TradeClient(sdk, auth.signMode, market);
  }, [auth.signMode, market, sdk]);

  useEffect(() => {
    tradeClient?.setDelegated(delegated);
  }, [tradeClient, delegated]);

  const setDelegated = useCallback((v: boolean) => setDelegatedState(v), []);
  const bump = useCallback(() => setNonce((n) => n + 1), []);
  const setPair = useCallback((symbol: string) => setPairSymbol(symbol), []);

  const layer = tradeLayer(delegated, sdk);

  const value = useMemo<AppValue>(
    () => ({
      cfg,
      sdk,
      auth,
      pair,
      setPair,
      market,
      tradeClient,
      delegated,
      setDelegated,
      layer,
      nonce,
      bump,
    }),
    [cfg, sdk, auth, pair, setPair, market, tradeClient, delegated, setDelegated, layer, nonce, bump]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

/** Fetch the active network config once; then mount the right auth path. */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg] = useState<NetworkConfig | null>(null);
  const toast = useToast();

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((raw) => {
        setCfg({
          network: raw.network,
          rpcUrl: raw.rpcUrl,
          wsUrl: raw.wsUrl,
          programId: new PublicKey(raw.programId),
          delegationProgramId: DELEGATION_PROGRAM_ID,
          routerUrl: raw.routerUrl,
          pairs: raw.pairs,
        });
      })
      .catch((err) => {
        toast.push("error", "Failed to load configuration", String(err));
      });
  }, [toast]);

  return useMemo(() => {
    if (!cfg) {
      return (
        <div className="flex h-screen items-center justify-center text-sm text-slate-400">
          Loading configuration…
        </div>
      );
    }
    const sdk = createSDK(cfg);
    if (cfg.network === "local") {
      return (
        <LocalAuthProvider cfg={cfg}>
          <CoreProvider cfg={cfg} sdk={sdk}>
            {children}
          </CoreProvider>
        </LocalAuthProvider>
      );
    }
    return (
      <ConnectionProvider endpoint={cfg.rpcUrl}>
        <WalletProvider
          wallets={walletAdapters(cfg.network)}
          autoConnect
          onError={(error) => {
            const message = error instanceof Error ? error.message : String(error);
            toast.push("error", "Wallet error", message);
          }}
        >
          <WalletAuthProvider cfg={cfg}>
            <CoreProvider cfg={cfg} sdk={sdk}>
              {children}
            </CoreProvider>
          </WalletAuthProvider>
        </WalletProvider>
      </ConnectionProvider>
    );
  }, [cfg, children, toast]);
}
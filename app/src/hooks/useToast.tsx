// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

export type ToastKind = "info" | "success" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

interface ToastCtx {
  push: (kind: ToastKind, title: string, detail?: string) => void;
}

const Ctx = createContext<ToastCtx>({ push: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, title: string, detail?: string) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev.slice(-4), { id, kind, title, detail }]);
    window.setTimeout(() => dismiss(id), 6500);
  }, [dismiss]);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`rounded-lg border px-3 py-2 text-left text-xs shadow-lg backdrop-blur ${
              t.kind === "error"
                ? "border-rose-500/40 bg-rose-950/70 text-rose-100"
                : t.kind === "success"
                  ? "border-emerald-500/40 bg-emerald-950/70 text-emerald-100"
                  : "border-slate-600/40 bg-slate-900/80 text-slate-100"
            }`}
          >
            <div className="font-medium">{t.title}</div>
            {t.detail ? (
              <div className="mt-0.5 truncate font-mono text-[10px] opacity-70">
                {t.detail}
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  return useContext(Ctx);
}
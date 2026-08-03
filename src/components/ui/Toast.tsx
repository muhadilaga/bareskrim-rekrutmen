"use client";

import { useCallback, useEffect, useRef, useState, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface ToastItem {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

let toastCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastItem["type"] = "info") => {
      const id = `toast-${++toastCounter}-${Date.now()}`;
      setToasts((prev) => [...prev, { id, message, type }]);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback((msg: string) => addToast(msg, "success"), [addToast]);
  const error = useCallback((msg: string) => addToast(msg, "error"), [addToast]);
  const info = useCallback((msg: string) => addToast(msg, "info"), [addToast]);

  return { toasts, removeToast, success, error, info };
}

const toastCtx = {
  toasts: [] as ToastItem[],
  removeToast: (_id: string) => {},
  success: (_msg: string) => {},
  error: (_msg: string) => {},
  info: (_msg: string) => {},
};

const ToastContext = createContext<ReturnType<typeof useToast>>(toastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
    </ToastContext.Provider>
  );
}

export function useToastContext() {
  return useContext(ToastContext);
}

function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>,
    document.body
  );
}

function Toast({
  toast,
  onRemove,
}: {
  toast: ToastItem;
  onRemove: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";

    const timer = setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(-12px)";
      setTimeout(() => onRemove(toast.id), 300);
    }, 4000);

    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  const colorMap = {
    success: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    error: "border-red-500/40 bg-red-500/15 text-red-300",
    info: "border-gold/40 bg-gold/15 text-gold",
  };

  return (
    <div
      ref={ref}
      className={cn(
        "pointer-events-auto w-full max-w-sm rounded-lg border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-md transition-all duration-300",
        colorMap[toast.type],
      )}
      style={{ opacity: 0, transform: "translateY(-12px)" }}
      onClick={() => onRemove(toast.id)}
    >
      <div className="flex items-center gap-2">
        <span>{toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "ℹ"}</span>
        <span>{toast.message}</span>
      </div>
    </div>
  );
}

import { useEffect } from "react";

export interface ToastMessage {
  id: number;
  kind: "error" | "info";
  text: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

const TOAST_MS = 6000;

/** One toast at a time; errors use an alert role so assistive tech announces them. */
export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;
  return (
    <div
      className={`toast toast--${toast.kind}`}
      role={toast.kind === "error" ? "alert" : "status"}
    >
      <span>{toast.text}</span>
      <button type="button" className="icon-button" aria-label="Dismiss message" onClick={onDismiss}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

import { useEffect } from "react";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastMessage {
  id: number;
  kind: "error" | "info";
  text: string;
  /** Optional button, e.g. "Undo". Toasts with an action stay longer. */
  action?: ToastAction;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

const TOAST_MS = 6000;
const TOAST_WITH_ACTION_MS = 10000;

/** One toast at a time; errors use an alert role so assistive tech announces them. */
export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, toast.action ? TOAST_WITH_ACTION_MS : TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;
  const { action } = toast;
  return (
    <div
      className={`toast toast--${toast.kind}`}
      role={toast.kind === "error" ? "alert" : "status"}
    >
      <span className="toast-text">{toast.text}</span>
      {action && (
        <>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            className="btn toast-action"
            onClick={() => {
              onDismiss();
              action.onClick();
            }}
          >
            {action.label}
          </button>
        </>
      )}
      <button type="button" className="icon-button" aria-label="Dismiss message" onClick={onDismiss}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

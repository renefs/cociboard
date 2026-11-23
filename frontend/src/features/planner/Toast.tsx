import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

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

/** One toast at a time; announced through an always-mounted polite live region. */
export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, toast.action ? TOAST_WITH_ACTION_MS : TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  // The live region stays mounted so that screen readers announce toasts reliably.
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {toast && <ToastBody toast={toast} onDismiss={onDismiss} />}
    </div>
  );
}

function ToastBody({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  const { t } = useTranslation();
  const { action } = toast;
  return (
    <div className={`toast toast--${toast.kind}`} role={toast.kind === "error" ? "alert" : undefined}>
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
      <button type="button" className="icon-button" aria-label={t("common.dismiss")} onClick={onDismiss}>
        <X aria-hidden="true" size={18} />
      </button>
    </div>
  );
}

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Focus the first input on open. Disabled on touch devices to keep the keyboard closed. */
  focusInput?: boolean;
  /** "full" makes the dialog a full-screen sheet on narrow screens (used by forms). */
  size?: "default" | "full";
  /** Clicking the backdrop closes the dialog. Forms turn this off to protect typed input. */
  closeOnBackdrop?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal dialog that is a bottom sheet on narrow screens and a centred dialog on wide
 * ones (see CSS). Handles Escape, backdrop click, focus trapping and focus restore.
 */
export function Modal({
  title,
  onClose,
  children,
  focusInput = false,
  size = "default",
  closeOnBackdrop = true,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const input = focusInput && finePointer() ? dialog?.querySelector<HTMLElement>("input") : null;
    (input ?? dialog)?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [focusInput]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => closeOnBackdrop && event.target === event.currentTarget && onClose()}>
      <div
        className={size === "full" ? "modal modal--full" : "modal"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        <header className="modal-header">
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function finePointer(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
}

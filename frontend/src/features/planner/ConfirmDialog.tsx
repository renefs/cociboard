import type { ReactNode } from "react";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A small modal asking for confirmation of a destructive action. */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="confirm-body">{children}</div>
      <div className="confirm-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

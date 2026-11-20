import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../planner/Modal";

interface ManualCopyDialogProps {
  title: string;
  text: string;
  onClose: () => void;
}

/**
 * The last resort when neither the share sheet nor the clipboard is available (the clipboard
 * API needs a secure context, which plain-http LAN access lacks): the text, selected.
 */
export function ManualCopyDialog({ title, text, onClose }: ManualCopyDialogProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // After the modal has taken focus for itself.
  useEffect(() => {
    const timer = setTimeout(() => {
      areaRef.current?.focus();
      areaRef.current?.select();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Modal title={title} onClose={onClose}>
      <p>{t("share.manualHelp")}</p>
      <label htmlFor={labelId} className="visually-hidden">
        {t("share.manualLabel")}
      </label>
      <textarea
        id={labelId}
        ref={areaRef}
        className="manual-copy"
        readOnly
        rows={12}
        value={text}
        onFocus={(event) => event.currentTarget.select()}
      />
    </Modal>
  );
}

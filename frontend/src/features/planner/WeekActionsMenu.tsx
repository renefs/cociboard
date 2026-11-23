import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Copy, Eraser, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { clampShiftStart } from "../share/popoverLogic";

interface WeekActionsMenuProps {
  /** "Copy last week" is not available (no plan yet, busy, or no empty slot to fill). */
  copyDisabled: boolean;
  /** "Clear week" is not available (no plan yet, busy, or nothing planned). */
  clearDisabled: boolean;
  /** Disables the trigger while the week has not loaded. */
  disabled?: boolean;
  onCopyPrevious: () => void;
  onClear: () => void;
}

/**
 * The planner's "More" button: a disclosure (like the settings and share menus) with the
 * week actions that are used less often than "Fill the week": copy last week and clear.
 */
export function WeekActionsMenu({ copyDisabled, clearDisabled, disabled = false, onCopyPrevious, onClear }: WeekActionsMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  // Outside clicks close the menu without taking the focus from what was clicked.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Focus moves into the panel, which stays inside the viewport.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    panel.style.right = "0px";
    const shift = clampShiftStart(panel.getBoundingClientRect().left);
    if (shift !== 0) panel.style.right = `${-shift}px`;
    panel.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
  }, [open]);

  // Focus goes back to the button first, so it is where a dialog returns to when it closes.
  const run = (action: () => void) => {
    close(true);
    action();
  };

  return (
    <div
      className="more-menu"
      ref={wrapperRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close(true);
        }
      }}
      onBlur={(event) => {
        // Tabbing out of the menu closes it.
        if (open && event.relatedTarget instanceof Node && !wrapperRef.current?.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        ref={triggerRef}
        className="btn more-button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t("planner.moreActions")}
        title={t("planner.moreActions")}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal aria-hidden="true" size={18} />
      </button>
      {open && (
        <div className="more-panel" id={panelId} ref={panelRef} role="group" aria-label={t("planner.moreActionsPanel")}>
          <button
            type="button"
            className="more-item"
            disabled={copyDisabled}
            title={t("planner.copyLastWeekTitle")}
            onClick={() => run(onCopyPrevious)}
          >
            <Copy aria-hidden="true" size={18} />
            {t("planner.copyLastWeek")}
          </button>
          <button type="button" className="more-item" disabled={clearDisabled} onClick={() => run(onClear)}>
            <Eraser aria-hidden="true" size={18} />
            {t("planner.clearWeek")}
          </button>
        </div>
      )}
    </div>
  );
}

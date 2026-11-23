import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { DatabaseBackup, Home, LogOut, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../../i18n/LanguageSwitcher";
import { useLogout } from "../auth/useLogout";
import { clampShiftStart } from "../share/popoverLogic";

interface SettingsMenuProps {
  onOpenHousehold: () => void;
  onOpenBackup: () => void;
  /** Shows "Log out"; only when a password is set. */
  canLogout: boolean;
  onError: (text: string) => void;
}

/**
 * The header's one settings button: a disclosure (like the share menu) with the household
 * preferences, the backup, the language switcher and, when a password is set, "Log out".
 */
export function SettingsMenu({ onOpenHousehold, onOpenBackup, canLogout, onError }: SettingsMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const logout = useLogout(onError);

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

  // The dialog that opens takes over; focus goes back to the button first, so it is where
  // the dialog returns to when it closes.
  const openDialog = (open: () => void) => {
    close(true);
    open();
  };

  return (
    <div
      className="settings-menu"
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
        className="settings-button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t("settings.button")}
        title={t("settings.buttonTitle")}
        onClick={() => setOpen((value) => !value)}
      >
        <Settings aria-hidden="true" size={18} />
      </button>
      {open && (
        <div className="settings-panel" id={panelId} ref={panelRef} role="group" aria-label={t("settings.panelLabel")}>
          <button
            type="button"
            className="settings-item"
            aria-haspopup="dialog"
            title={t("household.buttonTitle")}
            onClick={() => openDialog(onOpenHousehold)}
          >
            <Home aria-hidden="true" size={18} />
            {t("household.button")}
          </button>
          <button
            type="button"
            className="settings-item"
            aria-haspopup="dialog"
            title={t("backup.buttonTitle")}
            onClick={() => openDialog(onOpenBackup)}
          >
            <DatabaseBackup aria-hidden="true" size={18} />
            {t("backup.button")}
          </button>
          <div className="settings-language">
            <span className="settings-language-label" aria-hidden="true">
              {t("language.label")}
            </span>
            <LanguageSwitcher />
          </div>
          {canLogout && (
            <button
              type="button"
              className="settings-item settings-item--logout"
              title={t("auth.logoutTitle")}
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              <LogOut aria-hidden="true" size={18} />
              {t("auth.logout")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

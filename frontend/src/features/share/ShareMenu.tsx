import { Share2 } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WeekPlan } from "../../api/types";
import { useLocale } from "../../i18n/useLocale";
import { icsFileName, weekAsIcs, type MealTimes } from "./ical";
import { PrintPortal, usePrintJob } from "./PrintPortal";
import { PrintWeek } from "./PrintWeek";
import { canShareText, shareOrDownloadFile } from "./shareActions";
import { hasMeals, menuTitle, weekAsText } from "./shareText";
import { clampShift } from "./popoverLogic";
import { useShareText } from "./useShareText";

interface ShareMenuProps {
  plan: WeekPlan | undefined;
  onNotify: (kind: "error" | "info", text: string) => void;
  /** When lunch and dinner start in the calendar export; defaults to 14:00 and 21:00. */
  mealTimes?: MealTimes;
  /** Injectable for tests. */
  now?: () => Date;
}

/** The planner's Share button: a disclosure with print, share-as-text and calendar export. */
export function ShareMenu({ plan, onNotify, mealTimes, now = () => new Date() }: ShareMenuProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const printJob = usePrintJob();
  const { share, dialog } = useShareText(onNotify);
  const empty = !plan || !hasMeals(plan);

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

  // Keyboard users land on the first available item; the panel stays inside the viewport.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    panel.style.left = "0px";
    const { left, width } = panel.getBoundingClientRect();
    const shift = clampShift(left, width, document.documentElement.clientWidth);
    if (shift !== 0) panel.style.left = `${shift}px`;
    panel.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
  }, [open]);

  if (!plan) {
    return (
      <button type="button" className="btn" disabled>
        <Share2 aria-hidden="true" size={18} className="icon" />
        <span className="btn-label">{t("share.menu")}</span>
      </button>
    );
  }

  const run = (action: () => void | Promise<void>) => {
    close(true);
    void action();
  };

  const sharePlan = () =>
    share({
      title: menuTitle(plan.week_start, t, locale),
      text: weekAsText(plan, t, locale),
      copiedMessage: t("share.menuCopied"),
    });

  const exportCalendar = async () => {
    const content = weekAsIcs(plan, t, { now: now(), ...(mealTimes && { times: mealTimes }) });
    const file = new File([content], icsFileName(plan.week_start), { type: "text/calendar;charset=utf-8" });
    const outcome = await shareOrDownloadFile(file);
    if (outcome === "downloaded") onNotify("info", t("share.calendarDownloaded", { name: file.name }));
  };

  return (
    <div
      className="share-menu"
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
        className="btn"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Share2 aria-hidden="true" size={18} className="icon" />
        <span className="btn-label">{t("share.menu")}</span>
      </button>
      {open && (
        <div className="share-panel" id={panelId} ref={panelRef} role="group" aria-label={t("share.menuLabel")}>
          <ul className="share-list">
            <li>
              <button type="button" className="share-item" disabled={empty} onClick={() => run(printJob.print)}>
                {t("share.print")}
              </button>
            </li>
            <li>
              <button type="button" className="share-item" disabled={empty} onClick={() => run(sharePlan)}>
                {canShareText() ? t("share.share") : t("share.copy")}
              </button>
            </li>
            <li>
              <button type="button" className="share-item" disabled={empty} onClick={() => run(exportCalendar)}>
                {t("share.calendar")}
              </button>
            </li>
          </ul>
          {empty && <p className="share-hint">{t("share.emptyWeek")}</p>}
        </div>
      )}
      {printJob.job !== null && (
        <PrintPortal key={printJob.job} onDone={printJob.done}>
          <PrintWeek plan={plan} />
        </PrintPortal>
      )}
      {dialog}
    </div>
  );
}

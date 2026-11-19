import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ShoppingList } from "../../api/types";
import { useLocale } from "../../i18n/useLocale";
import { Modal } from "../planner/Modal";
import { formatWeekRange } from "../planner/weekMath";
import {
  cleanExtraName,
  isEmptyList,
  isPendingExtraId,
  progressOf,
  shoppingListText,
  splitList,
  type ShoppingRow,
} from "./shoppingLogic";
import { useShoppingActions, useShoppingList, type ShoppingActions } from "./useShoppingList";

export type Notify = (kind: "error" | "info", text: string) => void;

interface ShoppingListDialogProps {
  weekStart: string;
  onClose: () => void;
  onNotify: Notify;
}

/** The shopping list of a week: tick items off, add your own, copy or share as text. */
export function ShoppingListDialog({ weekStart, onClose, onNotify }: ShoppingListDialogProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { data: list, isPending, isError, refetch } = useShoppingList(weekStart);
  const actions = useShoppingActions(weekStart, (message) => onNotify("error", message));
  const [announcement, setAnnouncement] = useState("");

  return (
    <Modal
      title={t("shopping.title", { range: formatWeekRange(weekStart, locale) })}
      onClose={onClose}
      size="full"
    >
      <div className="shopping">
        <p className="visually-hidden" role="status" aria-live="polite">
          {announcement}
        </p>
        {list ? (
          <ListBody list={list} actions={actions} announce={setAnnouncement} onNotify={onNotify} />
        ) : isError ? (
          <div className="shopping-scroll">
            <div className="state-box" role="alert">
              <p>{t("shopping.loadError")}</p>
              <button type="button" className="btn" onClick={() => void refetch()}>
                {t("common.retry")}
              </button>
            </div>
          </div>
        ) : (
          isPending && (
            <div className="shopping-scroll">
              <p className="shopping-muted" role="status">
                {t("shopping.loading")}
              </p>
            </div>
          )
        )}
      </div>
    </Modal>
  );
}

interface ListBodyProps {
  list: ShoppingList;
  actions: ShoppingActions;
  announce: (text: string) => void;
  onNotify: Notify;
}

function ListBody({ list, actions, announce, onNotify }: ListBodyProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { toBuy, basket } = splitList(list);
  const progress = progressOf(list);
  const empty = isEmptyList(list);

  const toggle = (row: ShoppingRow) => {
    const checked = !row.checked;
    if (row.kind === "item" && row.key !== undefined) actions.toggleItem(row.key, checked);
    else if (row.extraId !== undefined) actions.toggleExtra(row.extraId, checked);
    announce(t(checked ? "shopping.announce.checked" : "shopping.announce.unchecked", { name: row.name }));
  };

  const remove = (row: ShoppingRow) => {
    if (row.extraId === undefined) return;
    actions.removeExtra(row.extraId);
    announce(t("shopping.announce.removed", { name: row.name }));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shoppingListText(list, t, locale));
      onNotify("info", t("shopping.copied"));
    } catch {
      onNotify("error", t("shopping.copyFailed"));
    }
  };

  const share = async () => {
    try {
      await navigator.share({
        title: t("shopping.open"),
        text: shoppingListText(list, t, locale),
      });
    } catch (error) {
      // Dismissing the share sheet is not an error.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        onNotify("error", t("shopping.shareFailed"));
      }
    }
  };

  const canShare = typeof navigator.share === "function";

  return (
    <>
      <div className="shopping-scroll">
        <p className="shopping-progress">
          {t("shopping.progress", { done: progress.done, count: progress.total })}
        </p>

        <AddForm
          onAdd={(name) => {
            actions.addExtra(name);
            announce(t("shopping.announce.added", { name }));
          }}
        />

        {empty && <p className="shopping-muted">{t("shopping.empty")}</p>}

        {!empty && (
          <Section title={t("shopping.toBuy")} count={toBuy.length}>
            {toBuy.length > 0 ? (
              <RowList rows={toBuy} onToggle={toggle} onRemove={remove} />
            ) : (
              <p className="shopping-muted">{t("shopping.allBought")}</p>
            )}
          </Section>
        )}

        {basket.length > 0 && (
          <Section title={t("shopping.basket")} count={basket.length} muted>
            <RowList rows={basket} onToggle={toggle} onRemove={remove} />
          </Section>
        )}
      </div>

      <div className="form-actions shopping-actions" role="group" aria-label={t("shopping.actions")}>
        <button type="button" className="btn btn-large" disabled={empty} onClick={() => void copy()}>
          {t("shopping.copy")}
        </button>
        {canShare && (
          <button type="button" className="btn btn-large" disabled={empty} onClick={() => void share()}>
            {t("shopping.share")}
          </button>
        )}
        {progress.done > 0 && (
          <button
            type="button"
            className="btn btn-large"
            onClick={() => {
              actions.uncheckAll();
              announce(t("shopping.announce.uncheckedAll"));
            }}
          >
            {t("shopping.uncheckAll")}
          </button>
        )}
      </div>
    </>
  );
}

function Section({
  title,
  count,
  muted = false,
  children,
}: {
  title: string;
  count: number;
  muted?: boolean;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section className={muted ? "shopping-section shopping-section--basket" : "shopping-section"} aria-labelledby={headingId}>
      <h3 id={headingId} className="shopping-heading">
        {title} <span className="shopping-count-chip">{count}</span>
      </h3>
      {children}
    </section>
  );
}

interface RowListProps {
  rows: ShoppingRow[];
  onToggle: (row: ShoppingRow) => void;
  onRemove: (row: ShoppingRow) => void;
}

function RowList({ rows, onToggle, onRemove }: RowListProps) {
  return (
    <ul className="shopping-rows">
      {rows.map((row) => (
        <Row key={row.id} row={row} onToggle={onToggle} onRemove={onRemove} />
      ))}
    </ul>
  );
}

function Row({ row, onToggle, onRemove }: { row: ShoppingRow } & Omit<RowListProps, "rows">) {
  const { t } = useTranslation();
  const inputId = useId();
  // An extra the server has not confirmed yet has no real id to address.
  const pending = row.extraId !== undefined && isPendingExtraId(row.extraId);
  return (
    <li className={row.checked ? "shopping-row is-checked" : "shopping-row"}>
      <input
        id={inputId}
        type="checkbox"
        className="shopping-check"
        checked={row.checked}
        disabled={pending}
        onChange={() => onToggle(row)}
      />
      <label htmlFor={inputId} className="shopping-label">
        <span className="shopping-name">{row.name}</span>
        {row.kind === "extra" && <span className="shopping-sub">{t("shopping.byHand")}</span>}
        {row.recipes.length > 0 && (
          <span className="shopping-sub">{t("shopping.usedIn", { recipes: row.recipes.join(", ") })}</span>
        )}
      </label>
      {row.mealCount > 1 && (
        <span className="shopping-meals">
          <span aria-hidden="true">{t("shopping.mealsCount", { count: row.mealCount })}</span>
          <span className="visually-hidden">{t("shopping.mealsCountLabel", { count: row.mealCount })}</span>
        </span>
      )}
      {row.kind === "extra" && (
        <button
          type="button"
          className="icon-button"
          disabled={pending}
          aria-label={t("shopping.deleteItem", { name: row.name })}
          onClick={() => onRemove(row)}
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </li>
  );
}

function AddForm({ onAdd }: { onAdd: (name: string) => void }) {
  const { t } = useTranslation();
  const inputId = useId();
  const [value, setValue] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = cleanExtraName(value);
    if (name === null) return;
    onAdd(name);
    setValue("");
  };

  return (
    <form className="shopping-add" onSubmit={submit}>
      <label htmlFor={inputId} className="shopping-add-label">
        {t("shopping.addLabel")}
      </label>
      <div className="shopping-add-row">
        <input
          id={inputId}
          type="text"
          className="shopping-input"
          maxLength={80}
          autoComplete="off"
          placeholder={t("shopping.addPlaceholder")}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="submit" className="btn btn-primary">
          {t("shopping.add")}
        </button>
      </div>
    </form>
  );
}

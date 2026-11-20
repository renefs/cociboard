import { useTranslation } from "react-i18next";
import type { ShoppingList } from "../../api/types";
import { useLocale } from "../../i18n/useLocale";
import { formatWeekRange } from "../planner/weekMath";
import { splitList } from "../shopping/shoppingLogic";

/** The shopping list as a printable checklist. Shown only in print. */
export function PrintShopping({ list }: { list: ShoppingList }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { toBuy, basket, pantry } = splitList(list);
  return (
    <article className="print-sheet">
      <h1 className="print-title">{t("shopping.title", { range: formatWeekRange(list.week_start, locale) })}</h1>
      {toBuy.length > 0 ? (
        <ul className="print-checklist">
          {toBuy.map((row) => (
            <li key={row.id}>
              <span className="print-box" aria-hidden="true" />
              {row.name}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("shopping.textNothing")}</p>
      )}
      {basket.length > 0 && (
        <section className="print-secondary">
          <h2>{t("share.printBought")}</h2>
          <ul className="print-plainlist">
            {basket.map((row) => (
              <li key={row.id}>{row.name}</li>
            ))}
          </ul>
        </section>
      )}
      {pantry.length > 0 && (
        <section className="print-secondary">
          <h2>{t("share.printPantry")}</h2>
          <ul className="print-plainlist">
            {pantry.map((row) => (
              <li key={row.id}>{row.name}</li>
            ))}
          </ul>
        </section>
      )}
      <p className="print-footer">{t("app.title")}</p>
    </article>
  );
}

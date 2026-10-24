import { useTranslation } from "react-i18next";
import { MetaIcon } from "./MetaIcon";
import { MEAL_TYPE_META, PROPERTY_META, PROTEIN_META, type Meta } from "./recipeMeta";

function LegendGroup({ title, items }: { title: string; items: Meta[] }) {
  const { t } = useTranslation();
  return (
    <section className="legend-group">
      <h4>{title}</h4>
      <ul>
        {items.map((meta) => (
          <li key={meta.labelKey}>
            <MetaIcon meta={meta} /> <span>{t(meta.labelKey)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Collapsible explanation of every icon used on recipe cards. */
export function Legend() {
  const { t } = useTranslation();
  return (
    <details className="legend">
      <summary>{t("recipes.legend")}</summary>
      <LegendGroup title={t("recipes.legendMeal")} items={Object.values(MEAL_TYPE_META)} />
      <LegendGroup title={t("recipes.mainProtein")} items={Object.values(PROTEIN_META)} />
      <LegendGroup title={t("recipes.properties")} items={Object.values(PROPERTY_META)} />
    </details>
  );
}

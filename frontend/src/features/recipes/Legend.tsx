import { MetaIcon } from "./MetaIcon";
import { MEAL_TYPE_META, PROPERTY_META, PROTEIN_META, type Meta } from "./recipeMeta";

function LegendGroup({ title, items }: { title: string; items: Meta[] }) {
  return (
    <section className="legend-group">
      <h4>{title}</h4>
      <ul>
        {items.map((meta) => (
          <li key={meta.label}>
            <MetaIcon meta={meta} /> <span>{meta.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Collapsible explanation of every icon used on recipe cards. */
export function Legend() {
  return (
    <details className="legend">
      <summary>Legend</summary>
      <LegendGroup title="Meal" items={Object.values(MEAL_TYPE_META)} />
      <LegendGroup title="Main protein" items={Object.values(PROTEIN_META)} />
      <LegendGroup title="Properties" items={Object.values(PROPERTY_META)} />
    </details>
  );
}

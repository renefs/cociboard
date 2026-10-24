import type { Meta } from "./recipeMeta";

interface MetaIconProps {
  meta: Meta;
}

/** An emoji icon with an accessible name and a hover/long-press tooltip. */
export function MetaIcon({ meta }: MetaIconProps) {
  return (
    <span className="meta-icon" role="img" aria-label={meta.label} title={meta.label}>
      {meta.icon}
    </span>
  );
}

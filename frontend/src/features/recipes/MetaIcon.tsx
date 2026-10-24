import { useTranslation } from "react-i18next";
import type { Meta } from "./recipeMeta";

interface MetaIconProps {
  meta: Meta;
}

/** An emoji icon with an accessible name and a hover/long-press tooltip. */
export function MetaIcon({ meta }: MetaIconProps) {
  const { t } = useTranslation();
  const label = t(meta.labelKey);
  return (
    <span className="meta-icon" role="img" aria-label={label} title={label}>
      {meta.icon}
    </span>
  );
}

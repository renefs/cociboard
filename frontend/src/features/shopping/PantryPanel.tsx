import { useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { cleanPantryName } from "./pantryLogic";
import { usePantry, type PantryActions } from "./usePantry";

interface PantryPanelProps {
  actions: PantryActions;
  announce: (text: string) => void;
}

/**
 * Manage the pantry: add any ingredient by name, remove staples, or add a suggestion (an
 * ingredient that many active recipes use) with one tap.
 */
export function PantryPanel({ actions, announce }: PantryPanelProps) {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = usePantry();
  const inputId = useId();
  const [value, setValue] = useState("");

  const add = (name: string) => {
    actions.add(name);
    announce(t("pantry.announce.added", { name }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = cleanPantryName(value);
    if (name === null) return;
    add(name);
    setValue("");
  };

  return (
    <div className="pantry-panel">
      <p className="shopping-muted">{t("pantry.intro")}</p>

      <form className="shopping-add" onSubmit={submit}>
        <label htmlFor={inputId} className="shopping-add-label">
          {t("pantry.addLabel")}
        </label>
        <div className="shopping-add-row">
          <input
            id={inputId}
            type="text"
            className="shopping-input"
            maxLength={80}
            autoComplete="off"
            placeholder={t("pantry.addPlaceholder")}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            {t("pantry.add")}
          </button>
        </div>
      </form>

      {data ? (
        <>
          {data.suggestions.length > 0 && (
            <section className="pantry-block" aria-labelledby={`${inputId}-suggestions`}>
              <h4 id={`${inputId}-suggestions`} className="pantry-subheading">
                {t("pantry.suggestionsHeading")}
              </h4>
              <p className="shopping-muted">{t("pantry.suggestionsHint")}</p>
              <ul className="pantry-chips">
                {data.suggestions.map((suggestion) => {
                  const label = t("pantry.suggest", {
                    name: suggestion.name,
                    count: suggestion.recipe_count,
                  });
                  return (
                    <li key={suggestion.key}>
                      <button
                        type="button"
                        className="pantry-chip"
                        aria-label={label}
                        title={label}
                        onClick={() => add(suggestion.name)}
                      >
                        <span aria-hidden="true">+</span> {suggestion.name}
                        <span className="pantry-chip-count" aria-hidden="true">
                          {suggestion.recipe_count}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="pantry-block" aria-labelledby={`${inputId}-items`}>
            <h4 id={`${inputId}-items`} className="pantry-subheading">
              {t("pantry.itemsHeading")}
            </h4>
            {data.items.length === 0 ? (
              <p className="shopping-muted">{t("pantry.empty")}</p>
            ) : (
              <ul className="shopping-rows">
                {data.items.map((item) => (
                  <li key={item.key} className="shopping-row">
                    <span className="shopping-label pantry-name">
                      <span className="shopping-name">{item.name}</span>
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t("pantry.remove", { name: item.name })}
                      title={t("pantry.remove", { name: item.name })}
                      onClick={() => {
                        actions.remove(item.key, item.id);
                        announce(t("pantry.announce.removed", { name: item.name }));
                      }}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : isError ? (
        <div className="state-box" role="alert">
          <p>{t("pantry.loadError")}</p>
          <button type="button" className="btn" onClick={() => void refetch()}>
            {t("common.retry")}
          </button>
        </div>
      ) : (
        isPending && (
          <p className="shopping-muted" role="status">
            {t("pantry.loading")}
          </p>
        )
      )}
    </div>
  );
}

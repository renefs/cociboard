import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { importRecipe } from "../../api/client";
import type { RecipeDraft } from "../../api/types";
import {
  describeImportError,
  describeWarnings,
  importedHost,
  isImportDisabled,
  normalizeImportUrl,
} from "./importLogic";
import { importSession } from "./importSession";

interface ImportFromLinkProps {
  /** Whether the form holds something typed that an import would overwrite. */
  hasContent: boolean;
  /** Fill the form from the draft. */
  onApply: (draft: RecipeDraft) => void;
  /** A link to import at once (shared from another app). */
  initialUrl?: string | undefined;
}

interface Outcome {
  host: string;
  warnings: string[];
}

/**
 * "Import from a link" at the top of the new-recipe form. It sits inside the form's markup,
 * so Enter in the link field imports instead of submitting the form.
 */
export function ImportFromLink({ hasContent, onApply, initialUrl }: ImportFromLinkProps) {
  const { t } = useTranslation();
  const ids = { heading: useId(), hint: useId(), url: useId(), error: useId(), confirm: useId() };
  const [url, setUrl] = useState(initialUrl ?? "");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState(false);
  const [waiting, setWaiting] = useState<{ draft: RecipeDraft; url: string } | null>(null);
  const [disabledHere, setDisabledHere] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const confirmPanel = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  // The draft arrives later than the click: read the form's state at that moment.
  const hasContentNow = useRef(hasContent);
  useEffect(() => {
    hasContentNow.current = hasContent;
  }, [hasContent]);

  const mutation = useMutation<RecipeDraft, unknown, string>({ mutationFn: (link) => importRecipe(link) });
  const busy = mutation.isPending;

  const accept = (draft: RecipeDraft, requested: string) => {
    onApply(draft);
    setOutcome({ host: importedHost(draft, requested), warnings: describeWarnings(draft, t) });
  };

  const run = async (raw: string) => {
    if (busy) return;
    setError(null);
    setOutcome(null);
    setWaiting(null);
    setKept(false);
    const target = normalizeImportUrl(raw);
    if (target === null) {
      setError(t("recipeForm.import.errors.invalidUrl"));
      input.current?.focus();
      return;
    }
    try {
      const draft = await mutation.mutateAsync(target);
      if (hasContentNow.current) setWaiting({ draft, url: target });
      else accept(draft, target);
    } catch (failure) {
      if (isImportDisabled(failure)) {
        importSession.disabled = true;
        setDisabledHere(true);
      } else {
        setError(describeImportError(failure, t));
      }
    }
  };

  useEffect(() => {
    if (initialUrl && !started.current && !importSession.disabled) {
      started.current = true;
      void run(initialUrl);
    }
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (waiting) confirmPanel.current?.focus();
  }, [waiting]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void run(url);
  };

  if (importSession.disabled && !disabledHere) return null;
  if (disabledHere) {
    return (
      <p className="import-box import-box--note" role="status">
        {t("recipeForm.import.disabled")}
      </p>
    );
  }

  const describedBy = [ids.hint, error ? ids.error : null].filter(Boolean).join(" ");
  return (
    <section className="import-box" aria-labelledby={ids.heading}>
      <h3 id={ids.heading} className="import-heading">
        {t("recipeForm.import.heading")}
      </h3>
      <p id={ids.hint} className="field-hint">
        {t("recipeForm.import.hint")}
      </p>
      <label htmlFor={ids.url} className="visually-hidden">
        {t("recipeForm.import.urlLabel")}
      </label>
      <div className="import-row">
        <input
          id={ids.url}
          ref={input}
          type="url"
          inputMode="url"
          value={url}
          placeholder={t("recipeForm.import.urlPlaceholder")}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="btn"
          aria-busy={busy}
          aria-disabled={busy || undefined}
          onClick={() => void run(url)}
        >
          {busy ? t("recipeForm.import.importing") : t("recipeForm.import.button")}
        </button>
      </div>
      {error && (
        <p id={ids.error} className="field-error" role="alert">
          {error}
        </p>
      )}
      {waiting && (
        <div
          className="import-confirm"
          role="group"
          tabIndex={-1}
          ref={confirmPanel}
          aria-labelledby={ids.confirm}
        >
          <p id={ids.confirm}>{t("recipeForm.import.replaceQuestion")}</p>
          <div className="conflict-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                accept(waiting.draft, waiting.url);
                setWaiting(null);
              }}
            >
              {t("recipeForm.import.replace")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setWaiting(null);
                setKept(true);
                input.current?.focus();
              }}
            >
              {t("recipeForm.import.keepMine")}
            </button>
          </div>
        </div>
      )}
      <div className="import-status" aria-live="polite">
        {outcome && (
          <>
            <p>{t("recipeForm.import.done", { host: outcome.host })}</p>
            {outcome.warnings.length > 0 && (
              <ul>
                {outcome.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </>
        )}
        {kept && <p>{t("recipeForm.import.kept")}</p>}
      </div>
    </section>
  );
}

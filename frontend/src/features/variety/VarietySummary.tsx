import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { PROTEINS, type VarietyIssue, type VarietyReport } from "../../api/types";
import { useLocale } from "../../i18n/useLocale";
import { PROTEIN_META } from "../recipes/recipeMeta";
import { describeIssues, isWarning, issueId, issueMessage, scoreLevel } from "./varietyLogic";

interface VarietySummaryProps {
  variety: VarietyReport;
  /** Id (see `issueId`) of the issue whose slots are highlighted in the grid. */
  highlightedId: string | null;
  onHighlight: (id: string | null) => void;
}

/** Colour-coded score badge that expands into the list of issues. */
export function VarietySummary({ variety, highlightedId, onHighlight }: VarietySummaryProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const level = scoreLevel(variety.score);
  const summary = variety.score === null ? t("variety.notEnoughData") : describeIssues(variety, t);

  return (
    <section className="variety" aria-label={t("variety.heading")}>
      <button
        type="button"
        className={`variety-badge variety-badge--${level}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={
          variety.score === null
            ? t("variety.notEnoughDataYet")
            : t("variety.scoreLabel", { score: variety.score, title: t("variety.heading"), summary })
        }
        onClick={() => setOpen((value) => !value)}
      >
        {/* The literal spaces separate the words for text extraction (WCAG 2.5.3 checks); the
            flex layout ignores them. */}
        <span className="variety-score" aria-hidden="true">
          {variety.score ?? "–"}
        </span>{" "}
        <span className="variety-text" aria-hidden="true">
          <span className="variety-title">{t("variety.heading")}</span>{" "}
          <span className="variety-summary">{summary}</span>
        </span>{" "}
        <span className="variety-chevron" aria-hidden="true" />
      </button>

      <div id={panelId} className="variety-panel" hidden={!open}>
        {variety.score === null ? (
          <p className="variety-empty">{t("variety.planSome")}</p>
        ) : (
          <>
            {variety.issues.length === 0 ? (
              <p className="variety-empty">{t("variety.allGood")}</p>
            ) : (
              <ul className="issue-list">
                {variety.issues.map((issue) => (
                  <IssueItem
                    key={issueId(issue)}
                    issue={issue}
                    pressed={highlightedId === issueId(issue)}
                    onToggle={() => onHighlight(highlightedId === issueId(issue) ? null : issueId(issue))}
                  />
                ))}
              </ul>
            )}
            <ProteinCounts counts={variety.protein_counts} />
          </>
        )}
      </div>
    </section>
  );
}

interface IssueItemProps {
  issue: VarietyIssue;
  pressed: boolean;
  onToggle: () => void;
}

function IssueItem({ issue, pressed, onToggle }: IssueItemProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const warning = isWarning(issue);
  const content = (
    <>
      <span className="issue-icon" aria-hidden="true">
        {warning ? "⚠" : "💡"}
      </span>
      <span className="issue-message">
        <span className="visually-hidden">{warning ? t("variety.warningPrefix") : t("variety.tipPrefix")}</span>
        {issueMessage(issue, t, locale)}
      </span>
    </>
  );
  return (
    <li className={`issue issue--${issue.severity}`}>
      {issue.slots.length > 0 ? (
        <button
          type="button"
          className="issue-button"
          aria-pressed={pressed}
          onClick={onToggle}
          title={pressed ? t("variety.stopHighlight") : t("variety.highlight")}
        >
          {content}
        </button>
      ) : (
        <div className="issue-button issue-button--static">{content}</div>
      )}
    </li>
  );
}

function ProteinCounts({ counts }: { counts: VarietyReport["protein_counts"] }) {
  const { t } = useTranslation();
  const used = PROTEINS.filter((protein) => (counts[protein] ?? 0) > 0);
  if (used.length === 0) return null;
  return (
    <ul className="protein-counts" aria-label={t("variety.proteinCounts")}>
      {used.map((protein) => (
        <li key={protein} className="protein-count">
          <span aria-hidden="true">{PROTEIN_META[protein].icon}</span> {t(PROTEIN_META[protein].labelKey)}{" "}
          <strong>×{counts[protein]}</strong>
        </li>
      ))}
    </ul>
  );
}

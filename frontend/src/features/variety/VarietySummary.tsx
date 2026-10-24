import { useId, useState } from "react";
import { PROTEINS, type VarietyIssue, type VarietyReport } from "../../api/types";
import { PROTEIN_META } from "../recipes/recipeMeta";
import { describeIssues, isWarning, issueId, scoreLevel } from "./varietyLogic";

interface VarietySummaryProps {
  variety: VarietyReport;
  /** Id (see `issueId`) of the issue whose slots are highlighted in the grid. */
  highlightedId: string | null;
  onHighlight: (id: string | null) => void;
}

/** Colour-coded score badge that expands into the list of issues. */
export function VarietySummary({ variety, highlightedId, onHighlight }: VarietySummaryProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const level = scoreLevel(variety.score);
  const summary = variety.score === null ? "Not enough data" : describeIssues(variety);

  return (
    <section className="variety" aria-label="Variety">
      <button
        type="button"
        className={`variety-badge variety-badge--${level}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={
          variety.score === null
            ? "Variety: not enough data yet"
            : `Variety score ${variety.score} out of 100. ${summary}`
        }
        onClick={() => setOpen((value) => !value)}
      >
        <span className="variety-score" aria-hidden="true">
          {variety.score ?? "–"}
        </span>
        <span className="variety-text" aria-hidden="true">
          <span className="variety-title">Variety</span>
          <span className="variety-summary">{summary}</span>
        </span>
        <span className="variety-chevron" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>

      <div id={panelId} className="variety-panel" hidden={!open}>
        {variety.score === null ? (
          <p className="variety-empty">Plan a few meals to see how varied the week is.</p>
        ) : (
          <>
            {variety.issues.length === 0 ? (
              <p className="variety-empty">Nice and varied. No repeats or protein streaks.</p>
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
  const warning = isWarning(issue);
  const content = (
    <>
      <span className="issue-icon" aria-hidden="true">
        {warning ? "⚠" : "💡"}
      </span>
      <span className="issue-message">
        <span className="visually-hidden">{warning ? "Warning: " : "Tip: "}</span>
        {issue.message}
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
          title={pressed ? "Stop highlighting" : "Highlight these meals in the plan"}
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
  const used = PROTEINS.filter((protein) => (counts[protein] ?? 0) > 0);
  if (used.length === 0) return null;
  return (
    <ul className="protein-counts" aria-label="Meals per main protein">
      {used.map((protein) => (
        <li key={protein} className="protein-count">
          <span aria-hidden="true">{PROTEIN_META[protein].icon}</span> {PROTEIN_META[protein].label}{" "}
          <strong>×{counts[protein]}</strong>
        </li>
      ))}
    </ul>
  );
}

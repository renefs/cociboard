import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCandidates } from "../../api/client";
import { SPECIAL_MEALS, type Candidate, type MealSlot, type Recipe, type SpecialMeal } from "../../api/types";
import { reasonText } from "../variety/varietyLogic";
import { RecipeCard } from "../recipes/RecipeCard";
import { Modal } from "./Modal";
import { matchesQuery } from "./slots";
import { SPECIAL_META } from "./specialMeta";

interface RecipePickerProps {
  title: string;
  weekStart: string;
  day: number;
  slot: MealSlot;
  onPick: (recipe: Recipe) => void;
  /** Set the slot to a special meal instead of a recipe. */
  onPickSpecial: (special: SpecialMeal) => void;
  onClose: () => void;
}

/** Filter candidates by name or ingredient, keeping the backend's variety order. */
export function filterCandidates(candidates: readonly Candidate[], query: string): Candidate[] {
  return candidates.filter((candidate) => matchesQuery(candidate.recipe, query));
}

/**
 * Lists the recipes that fit the slot, best for variety first (the server ranks them and
 * explains why), with instant search.
 */
export function RecipePicker({
  title,
  weekStart,
  day,
  slot,
  onPick,
  onPickSpecial,
  onClose,
}: RecipePickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["candidates", weekStart, day, slot],
    queryFn: ({ signal }) => getCandidates(weekStart, day, slot, signal),
    gcTime: 0, // always rank against the plan as it is now
  });
  const candidates = useMemo(() => filterCandidates(data ?? [], query), [data, query]);

  return (
    <Modal title={title} onClose={onClose} focusInput>
      <div className="specials-row" role="group" aria-labelledby="specials-label">
        <p id="specials-label" className="specials-label">
          {t("planner.specialsLabel")}
        </p>
        <div className="chip-group">
          {SPECIAL_MEALS.map((special) => (
            <button
              key={special}
              type="button"
              className="chip"
              onClick={() => onPickSpecial(special)}
            >
              <span aria-hidden="true">{SPECIAL_META[special].icon}</span>{" "}
              {t(SPECIAL_META[special].labelKey)}
            </button>
          ))}
        </div>
      </div>
      <label className="search-field">
        <span className="visually-hidden">{t("recipes.searchLabel")}</span>
        <Search aria-hidden="true" size={16} className="search-icon" />
        <input
          type="search"
          placeholder={t(`planner.pickerSearch.${slot}`)}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {/* Only the count is announced: a live list would read out every card that changes. */}
      <p className="visually-hidden" role="status" data-testid="picker-results-count">
        {data ? t("recipes.resultsCount", { count: candidates.length }) : ""}
      </p>
      <div className="picker-list">
        {isPending && <p className="status-message">{t("planner.pickerLoading")}</p>}
        {isError && (
          <p className="status-message" role="alert">
            {t("planner.pickerError")}{" "}
            <button type="button" className="link-button" onClick={() => void refetch()}>
              {t("common.retry")}
            </button>
          </p>
        )}
        {data && candidates.length === 0 && (
          <p className="status-message">{t(`planner.pickerNoMatch.${slot}`)}</p>
        )}
        {candidates.map((candidate) => (
          <RecipeCard
            key={candidate.recipe.id}
            recipe={candidate.recipe}
            highlight={candidate.good_pick}
            nameTag={
              candidate.good_pick && (
                <span className="good-pick-tag">
                  <Star aria-hidden="true" size={12} fill="currentColor" /> {t("planner.goodPick")}
                </span>
              )
            }
            extra={<PickHint candidate={candidate} />}
            actions={
              <button
                type="button"
                className={candidate.good_pick ? "btn btn-primary btn-choose" : "btn btn-choose"}
                onClick={() => onPick(candidate.recipe)}
              >
                {t("planner.choose")} <span className="visually-hidden">{candidate.recipe.name}</span>
              </button>
            }
          />
        ))}
      </div>
    </Modal>
  );
}

function PickHint({ candidate }: { candidate: Candidate }) {
  const { t } = useTranslation();
  const negative = candidate.score_delta < 0;
  return (
    <p className={negative ? "pick-hint pick-hint--warn" : "pick-hint"}>
      {negative && <AlertTriangle aria-hidden="true" size={13} className="icon" />}
      <span className="pick-reason">{reasonText(candidate, t)}</span>
    </p>
  );
}

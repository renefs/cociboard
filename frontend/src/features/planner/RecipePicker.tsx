import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCandidates } from "../../api/client";
import type { Candidate, MealSlot, Recipe } from "../../api/types";
import { reasonText } from "../variety/varietyLogic";
import { RecipeCard } from "../recipes/RecipeCard";
import { Modal } from "./Modal";
import { matchesQuery } from "./slots";

interface RecipePickerProps {
  title: string;
  weekStart: string;
  day: number;
  slot: MealSlot;
  onPick: (recipe: Recipe) => void;
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
export function RecipePicker({ title, weekStart, day, slot, onPick, onClose }: RecipePickerProps) {
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
      <label className="search-field">
        <span className="visually-hidden">{t("recipes.searchLabel")}</span>
        <input
          type="search"
          placeholder={t(`planner.pickerSearch.${slot}`)}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="picker-list" aria-live="polite">
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
            density="compact"
            extra={<PickHint candidate={candidate} />}
            actions={
              <button
                type="button"
                className="btn btn-primary"
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
      {candidate.good_pick && (
        <span className="badge badge--small good-pick">
          <span aria-hidden="true">★</span> {t("planner.goodPick")}
        </span>
      )}
      <span className="pick-reason">
        {negative && <span aria-hidden="true">⚠ </span>}
        {reasonText(candidate, t)}
      </span>
    </p>
  );
}

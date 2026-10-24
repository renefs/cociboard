import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getCandidates } from "../../api/client";
import type { Candidate, MealSlot, Recipe } from "../../api/types";
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
        <span className="visually-hidden">Search recipes</span>
        <input
          type="search"
          placeholder={`Search ${slot} recipes`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="picker-list" aria-live="polite">
        {isPending && <p className="status-message">Loading recipes…</p>}
        {isError && (
          <p className="status-message" role="alert">
            Could not load recipes.{" "}
            <button type="button" className="link-button" onClick={() => void refetch()}>
              Retry
            </button>
          </p>
        )}
        {data && candidates.length === 0 && (
          <p className="status-message">No {slot} recipes match.</p>
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
                Choose <span className="visually-hidden">{candidate.recipe.name}</span>
              </button>
            }
          />
        ))}
      </div>
    </Modal>
  );
}

function PickHint({ candidate }: { candidate: Candidate }) {
  const negative = candidate.score_delta < 0;
  return (
    <p className={negative ? "pick-hint pick-hint--warn" : "pick-hint"}>
      {candidate.good_pick && (
        <span className="badge badge--small good-pick">
          <span aria-hidden="true">★</span> Good pick
        </span>
      )}
      <span className="pick-reason">
        {negative && <span aria-hidden="true">⚠ </span>}
        {candidate.reason}
      </span>
    </p>
  );
}

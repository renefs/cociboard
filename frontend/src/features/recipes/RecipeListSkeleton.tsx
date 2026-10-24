/** Placeholder cards shown while the recipe list loads. Hidden from assistive tech. */
export function RecipeListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-list" aria-hidden="true" data-testid="recipe-skeleton">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton-card">
          <span className="skeleton-line skeleton-line--title" />
          <span className="skeleton-line" />
          <span className="skeleton-line skeleton-line--short" />
        </div>
      ))}
    </div>
  );
}

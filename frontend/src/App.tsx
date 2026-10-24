import { useEffect, useState } from "react";
import { getHealth } from "./api/client";
import { RecipePanel } from "./features/recipes/RecipePanel";

type VersionState = { kind: "loading" } | { kind: "ready"; version: string } | { kind: "offline" };

export default function App() {
  const [backend, setBackend] = useState<VersionState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal)
      .then((health) => setBackend({ kind: "ready", version: health.version }))
      .catch(() => {
        if (!controller.signal.aborted) setBackend({ kind: "offline" });
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Cociboard</h1>
      </header>
      <main className="app-main">
        <section className="planner-placeholder" aria-labelledby="planner-heading">
          <h2 id="planner-heading">Weekly planner</h2>
          <p className="app-lead">
            Your weekly menu planner is on its way. Browse your recipes meanwhile.
          </p>
        </section>
        <aside className="recipe-area" aria-label="Recipe catalogue">
          <RecipePanel />
        </aside>
      </main>
      <footer className="app-footer">
        <small>
          {backend.kind === "loading" && "Backend: connecting…"}
          {backend.kind === "ready" && `Backend v${backend.version}`}
          {backend.kind === "offline" && "Backend offline"}
        </small>
      </footer>
    </div>
  );
}

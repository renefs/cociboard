import { NARROW_QUERY } from "../features/planner/mobileView";

/**
 * Stub `window.matchMedia` for a test: the phone layout query matches when `narrow`, and
 * `reducedMotion` answers the reduced-motion query. jsdom has no `matchMedia` at all, which
 * the app reads as "desktop"; the setup file removes the stub after each test.
 */
export function stubMatchMedia({ narrow, reducedMotion = false }: { narrow: boolean; reducedMotion?: boolean }): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => {
      const matches =
        query === NARROW_QUERY ? narrow : query === "(prefers-reduced-motion: reduce)" ? reducedMotion : false;
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      };
    },
  });
}

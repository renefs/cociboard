# ADR-0004: TanStack Query for data fetching, emoji for icons

## Status
Accepted

## Context
The recipe panel needs server data with loading and error states, cancellation as
filters change, and caching. v0.3.0 onwards adds week plans that mutate server state
and must keep views consistent. Recipe cards also need icons for properties, proteins
and meal types that are legible on small touch screens.

## Decision
- **TanStack Query** (`@tanstack/react-query`) manages server state. Queries are keyed by
  the active filters, receive an `AbortSignal`, and use `keepPreviousData` so the list
  does not flicker while typing. Mutations in later milestones will invalidate keys.
  The `QueryClientProvider` is created in `main.tsx`; tests wrap components in a client
  with retries disabled. The typed fetch functions stay in `api/client.ts`, so the
  library is only used in hooks.
- **Icons are emoji**, defined once in `features/recipes/recipeMeta.ts` as typed
  `Record<Enum, {icon, label, color}>` maps. The compiler fails if an enum value is
  added without metadata, and a test checks completeness and unique labels/icons.
  Emoji need no dependency or bundle cost, render in colour and are recognisable at a
  glance on mobile.
- Every icon is rendered through `MetaIcon` (`role="img"`, `aria-label` and `title`
  from the label). A collapsible **Legend** in the recipe panel lists all icons, which
  also covers touch devices that have no hover tooltips. Meaning is never conveyed by
  colour alone; the colour is decoration.

## Consequences
- Emoji look different per platform; the label and legend remain the source of truth.
- One extra runtime dependency (about 13 kB gzipped) buys caching, cancellation and a
  consistent loading/error model.
- Swapping to an icon library later only touches `recipeMeta.ts` and `MetaIcon`.

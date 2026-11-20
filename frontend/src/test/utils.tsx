import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import { registerMutationDefaults } from "../offline/defaults";

/** A QueryClient set up like the app's: the waiting-change mutations have their defaults. */
export function makeTestQueryClient(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(client);
  return client;
}

export function renderWithQuery(ui: ReactElement) {
  const client = makeTestQueryClient();
  const result = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { ...result, queryClient: client };
}

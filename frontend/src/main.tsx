import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/planner.css";
import "./styles/recipes.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found");
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

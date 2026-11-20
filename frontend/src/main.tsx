import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./i18n";
import { AuthGate } from "./features/auth/AuthGate";
import { syncOnlineStatus } from "./pwa/online";
import { UpdatePrompt } from "./pwa/UpdatePrompt";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/auth.css";
import "./styles/planner.css";
import "./styles/recipes.css";
import "./styles/shopping.css";
import "./styles/pwa.css";
import "./styles/share.css";
import "./styles/print.css";

// Queries "offlineFirst" still ask the network layer (the service worker answers from its
// cache when offline); mutations keep the default mode and pause until the connection returns.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, networkMode: "offlineFirst" } },
});
syncOnlineStatus();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found");
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <UpdatePrompt />
      <AuthGate>
        <App />
      </AuthGate>
    </QueryClientProvider>
  </StrictMode>,
);

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { api } from "../convex/_generated/api";
import { App } from "@/App";
import "./index.css";

// The contributors page is static data, so it skips Convex and loads on its own chunk.
const ContributorsPage = lazy(() => import("@/components/contributors").then((m) => ({ default: m.ContributorsPage })));
const isContributors = /^\/contributors\/?$/.test(location.pathname);

const convex = isContributors ? null : new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {convex ? (
      <ConvexAuthProvider
        client={convex}
        api={{ refreshSession: api.auth.refreshSession, signOut: api.auth.signOut, isAuthenticated: api.auth.isAuthenticated }}
      >
        <App />
      </ConvexAuthProvider>
    ) : (
      <Suspense fallback={null}>
        <ContributorsPage />
      </Suspense>
    )}
  </StrictMode>,
);

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { api } from "../convex/_generated/api";
import { App } from "@/App";
import "./index.css";

// The contributors and marketing pages are static data, so they skip Convex and load on their own chunks.
const ContributorsPage = lazy(() => import("@/components/contributors").then((m) => ({ default: m.ContributorsPage })));
const MarketingPage = lazy(() => import("@/components/marketing").then((m) => ({ default: m.MarketingPage })));
const StaticPage = /^\/contributors\/?$/.test(location.pathname)
  ? ContributorsPage
  : /^\/marketing\/?$/.test(location.pathname)
    ? MarketingPage
    : null;

const convex = StaticPage ? null : new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {!StaticPage ? (
      <ConvexAuthProvider
        client={convex!}
        api={{ refreshSession: api.auth.refreshSession, signOut: api.auth.signOut, isAuthenticated: api.auth.isAuthenticated }}
      >
        <App />
      </ConvexAuthProvider>
    ) : (
      <Suspense fallback={null}>
        <StaticPage />
      </Suspense>
    )}
  </StrictMode>,
);

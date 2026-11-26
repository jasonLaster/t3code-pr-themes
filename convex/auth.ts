import { setupConvexAuth } from "@convex-dev/auth/server";
import { setupGithub } from "@convex-dev/auth/methods/github/server";
import { components, internal } from "./_generated/api";

const auth = setupConvexAuth({ component: components.auth });
export const { signOut, refreshSession, isAuthenticated } = auth;

// Where GitHub may send people back to after signing in: the deployed site(s),
// comma-separated in SITE_ORIGINS, plus the Vite dev server.
const origins = [
  "http://localhost:5173",
  ...(process.env.SITE_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
];

export const { startSignInWithGithub, completeSignInWithGithub } = setupGithub(auth, {
  component: components.authGithub,
  allowedRedirectOrigins: origins,
}).attachUserCallbacks({ createUser: internal.users.createUser, onSignIn: internal.users.onSignIn });

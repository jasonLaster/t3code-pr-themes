# t3code PR themes

Open pull requests on [pingdotgg/t3code](https://github.com/pingdotgg/t3code) grouped by theme, with Julius and Theo broken out.

- **Convex** stores one row per open PR, each stamped with a sync version so clients fetch only what changed. A cron refreshes it from GitHub's GraphQL API every 5 minutes (`convex/crons.ts`).
- **Stale-while-revalidate:** the page renders its cached rows right away and calls `prs.revalidate`, which starts a background refresh if the snapshot is older than 5 minutes. Convex queries are reactive, so open pages update when the refresh lands.
- **Vite + React** client keeps a local replica of every open PR (IndexedDB), syncs deltas from `prs.since`, and filters locally. Themes come from keyword rules in `shared/themes.ts`; contributor tiers from `.github/VOUCHED.td` and `.github/TRIAGE_EXEMPTIONS.td`.

## Develop

```sh
npm install
npx convex dev          # pushes functions to your dev deployment, writes .env.local
npx convex env set GITHUB_TOKEN <fine-grained token, public repos read-only>
npm run dev
```

## Deploy

```sh
npx convex deploy       # production backend
vercel deploy --prod    # VITE_CONVEX_URL points at the production deployment
```

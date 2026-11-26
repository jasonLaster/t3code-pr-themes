# t3code PR themes

Open pull requests on [pingdotgg/t3code](https://github.com/pingdotgg/t3code) grouped by theme, with Julius and Theo broken out.

- **Convex** stores one snapshot of the themed PRs. A cron refreshes it from GitHub's GraphQL API every 5 minutes (`convex/crons.ts`).
- **Stale-while-revalidate:** the page renders the stored snapshot right away and calls `prs.revalidate`, which starts a background refresh if the snapshot is older than 5 minutes. Convex queries are reactive, so open pages update when the refresh lands.
- **Next.js** hosts the page on Vercel. Themes come from keyword rules on PR titles in `lib/themes.ts` (first match wins).

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
vercel deploy --prod    # NEXT_PUBLIC_CONVEX_URL points at the production deployment
```

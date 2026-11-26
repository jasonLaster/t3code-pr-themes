# t3code PR themes

Pull requests on [pingdotgg/t3code](https://github.com/pingdotgg/t3code) grouped by theme, with Julius and Theo broken out. The default view shows open PRs.

- **Convex** stores one row per open PR, each stamped with a sync version so clients fetch only what changed. A cron refreshes it from GitHub's GraphQL API every 5 minutes (`convex/crons.ts`).
- **Stale-while-revalidate:** the page renders its cached rows right away and calls `prs.revalidate`, which starts a background refresh if the snapshot is older than 5 minutes. Convex queries are reactive, so open pages update when the refresh lands.
- **Vite + React** client keeps a local replica of every open PR (IndexedDB), syncs deltas from `prs.since`, and filters locally. Themes come from keyword rules in `shared/themes.ts`; contributor tiers from `.github/VOUCHED.td` and `.github/TRIAGE_EXEMPTIONS.td`.
- **Filters and grouping** come from one registry, `FIELDS` in `src/fields.tsx`. Each entry says how to bucket a PR, how to label the buckets and, if needed, how to filter. The filter menu, chips, typed `key:value` search, Display → Grouping and the command menu all read it, so a new property is one entry. Use `dateField` and `rangeField` for dates and counts.

- **Sign in with GitHub** (Convex Auth, `convex/auth.ts`) lets people comment on PRs (`convex/comments.ts`) and save views (`convex/views.ts`). Reading stays public. Comments live in the app for now. Authors edit and delete their own, maintainers can delete any, and denounced accounts can't post. Saved views are private or public. Public views show under "Shared views" for everyone.

## GitHub sign-in setup

Create one [GitHub OAuth App](https://github.com/settings/applications/new) per Convex deployment (dev and prod):

- **Homepage URL:** the site (`http://localhost:5173` for dev)
- **Authorization callback URL:** `<CONVEX_SITE_URL>/oauth/github/callback`, e.g. `https://<deployment>.convex.site/oauth/github/callback`

Then, on that deployment:

```sh
npx convex env set AUTH_GITHUB_CLIENT_ID <client id>
npx convex env set AUTH_GITHUB_CLIENT_SECRET <client secret>
npx convex env set SITE_ORIGINS https://<your-vercel-domain>   # comma-separated; localhost:5173 is always allowed
```

`convex.config.ts` declares the two `AUTH_GITHUB_*` vars as required, so a push fails until they are set.

## Develop

```sh
npm install
npx convex dev          # pushes functions to your dev deployment, writes .env.local
npx convex env set GITHUB_TOKEN <fine-grained token, public repos read-only>
npm run dev
npm test                # Convex permission tests (convex-test)
```

## State tabs and merge status

Tabs above the filter bar switch between **Open**, **Drafts**, **Merged**, **Closed** and **All**. They swap only the state and draft filters, so other filters stay. Each count shows what the tab would display. History that hasn't loaded yet shows the snapshot total.

Each open PR shows GitHub's merge status: Ready, Blocked, Behind, Unstable (checks failing) or Conflicts, plus the review decision in the tooltip. A separate refresh stores merge data one page at a time, so a GitHub rate limit preserves completed pages. Filter with `merge:conflicts`, or group by **Merge status** or **State**. Merged and closed rows show their final state and when it happened.

## Historical PRs

Select the **Merged** or **Closed** tab (or **State** in the Filter menu) to browse historical PRs. Closed means closed without a merge. Add a **Label** chip to narrow the history. For example, enter `state:merged label:codex` in search. A positive `label:` filter by itself searches both historical states. History charts and facet counts cover the imported snapshot.

Convex stores history in `prHistory`. The client requests the selected states in pages only when a filter calls for history. It uses the resulting metadata for filters and theme counts, and shows the list in groups of 200 rows. The IndexedDB replica and the `prs.since` cursor serve the open view.

Use Node 24 or later and an authenticated, read-only `gh` CLI to resume the backfill.

1. Run `node scripts/fetch-history.mjs` to fetch the GitHub snapshot. The cutoff and downloaded ranges are checkpointed under `.pr-backfill/`. Use `node scripts/fetch-history.mjs --prepare` to queue saved ranges for labeling while a fetch is incomplete.
2. Run `node scripts/history-labels.mjs status` and `node scripts/history-labels.mjs pending` to track progress. Assign a different batch to each Luna worker and use the [labeling instructions](scripts/history-labeling.md). Every saved row is validated and can be imported as soon as it is ready.
3. Run `CI=1 npx convex dev --once`, then `node scripts/import-history.mjs` to upsert the checkpoints into `intent-marlin-697`. Keep `.pr-backfill/` in the same worktree to resume without relabeling results.

Each historical PR has one of the 13 existing theme slugs, zero to three labels from `shared/history.ts`, a conventional-commit kind, and GitHub state and timestamps. Worker inputs include the title and up to 1,500 characters of the PR description. The import seeds the archive. After that, the open-PR refresh adds new closures and removes reopened PRs from history before applying open-list changes. Newly archived PRs use the same inferred labels as the backfill.

After deploying the production Convex functions, run `node scripts/import-history.mjs --prod` to import a complete fetched snapshot into `glad-dinosaur-732`. It keeps reviewed classifications from the checkpoints or an optional `.pr-backfill/reviewed.json` export from dev. Remaining rows use the open-PR theme rules and vocabulary matches from their titles. The app marks those labels as inferred. Re-running the import upserts PRs by number.

## Deploy

Use the `deploy` skill when releasing. Vercel builds `origin/main` and serves it at `https://t3code-pr-themes.vercel.app`. Release the Convex functions to `glad-dinosaur-732` first when they change, then push or merge the tested commit to `main`. Avoid production CLI uploads from development checkouts. They can replace the public alias with an older frontend even when the Git release is ready.

Watch the Git deployment for the exact SHA, then confirm the public URL still points to that build. Check the live Convex data and exercise the affected app flows before reporting the release complete.

# Building and running GRIDDY locally

## Prerequisites

- **Node.js 20+**. 22 is what's used day to day: check with `node -v`.
- **npm**, which comes with Node.
- **git**, plus access to `github.com/suhasp3/GRIDDY`.

You don't need any environment variables, database, or API keys. The app is
fully client-side. (An old `.env` with Supabase keys may still be on your
machine. Nothing reads it any more.)

## First-time setup

```bash
git clone https://github.com/suhasp3/GRIDDY.git
```

```bash
cd GRIDDY
```

```bash
npm install
```

## Day-to-day commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts Vite at `http://localhost:5173` with hot reload. Use this while developing. |
| `npm run build` | Runs `tsc` (type-check) then `vite build` and writes the site to `dist/`. **This is exactly what Vercel runs**, so if it fails locally, the deploy will fail too. |
| `npm run preview` | Serves `dist/` locally so you can try the production build. Run `build` first. |
| `npm test` | Runs all Vitest tests once. |
| `npm run test:watch` | Re-runs tests as you edit. |
| `npm run test:coverage` | Tests plus a coverage report. |
| `npm run lint` | ESLint over all `.ts`/`.tsx` files. |

## Checklist before you push

```bash
npm run build
```

```bash
npm test
```

`build` is the one that matters for deploying. Tests and lint don't block
Vercel, but run them anyway to catch regressions.

### Known issues on `main` (as of 2026-10-29)

These come from earlier work. They don't affect deploys:

- **1 failing test**: `EditorContext.test.ts > syncCategoryMeta > trims
  whitespace around category names`. The code now keeps blank/space-padded
  names on purpose (see `splitCsvPreservingBlanks`), so the test is out of date.
- **3 lint errors**: unused `_controls` in `TourGuide.tsx`, unused `_ignoredId`
  in `surveysApi.ts`, and an unneeded `eslint-disable` in `HistoryPage.tsx`.

Fixing these is a good small first PR.

## How the build works

1. `tsc` type-checks `src/` using [`tsconfig.json`](../tsconfig.json). Strict
   mode is on, and unused variables or parameters are **errors**, so leftover
   variables will break the build.
2. `vite build` bundles from [`index.html`](../index.html) →
   [`src/main.tsx`](../src/main.tsx) into `dist/index.html` plus
   `dist/assets/*.js|css`.
3. The `@/` import alias maps to `src/` (set in `vite.config.ts` and
   `tsconfig.json`).

The output is plain static files. Any static host can serve `dist/`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `npm run build` fails with `TS6133: 'x' is declared but its value is never read` | Remove the unused variable or import. The strict tsconfig treats this as an error. |
| Weird errors after pulling | Run `npm install` again, since dependencies may have changed. If that doesn't help, delete `node_modules` and run `npm install`. |
| Port 5173 in use | Vite picks the next free port. Use the URL it prints. |
| Saved surveys "disappeared" | They live in that browser's localStorage, per site. `localhost:5173` and the Vercel site keep separate lists. Move them with **My Surveys → Export JSON / Import JSON**. |

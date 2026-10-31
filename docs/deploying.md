# Deploying GRIDDY to GitHub Pages

**Live site:** https://www.jlsola.com/GRIDDY/

## How it's wired

The site is published by GitHub Pages from a GitHub Actions workflow,
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml). You don't run
any deploy command. **Merging to `main` is the deploy:**

| You push to… | What happens |
| --- | --- |
| `main` | The workflow builds the app and publishes `dist/` to the live site. |
| Any other branch, or a PR | Only the CI checks run. The live site isn't touched. |

The workflow runs `npm ci` and `npm run build`, copies `index.html` to
`404.html` (see below), and hands `dist/` to GitHub's Pages deployment. No
environment variables are needed. Progress and logs are under the repo's
**Actions** tab; the finished deployment is listed under **Deployments** on the
repo's front page.

In the repo's **Settings → Pages**, the source must be **GitHub Actions**.
That is the only setting the deploy depends on.

### Where the URL comes from

A project site on GitHub Pages is served at the owner's Pages domain plus the
repository name. The owner's user site uses the custom domain `www.jlsola.com`,
so this repository (`GRIDDY`) is served at `https://www.jlsola.com/GRIDDY/`.
Renaming the repository would move the site to the new name; the workflow
passes the repository name to the build as `BASE_PATH`, so no code changes.

To move the app to its own subdomain instead (for example
`griddy.jlsola.com`), add that domain under **Settings → Pages → Custom
domain**, create the matching DNS record, and change `BASE_PATH` in the
workflow to `/`.

## The workflow for every change

```
main ──●─────────────────────────●── (live site auto-deploys)
        \                       /
         ●──●──●  feature/xyz  ●
              push        PR → merge
```

1. **Start from an up-to-date `main`:**

   ```bash
   git switch main
   ```

   ```bash
   git pull
   ```

2. **Create a branch for the change:**

   ```bash
   git switch -c feature/short-description
   ```

3. **Build it locally** with `npm run dev`. Before each push, check that
   `npm run build`, `npm test` and `npm run lint` pass (see
   [building.md](building.md)).

4. **Commit and push the branch:**

   ```bash
   git add -A
   ```

   ```bash
   git commit -m "Describe the change"
   ```

   ```bash
   git push -u origin feature/short-description
   ```

5. **Open a pull request** into `main` and wait for the green check,
   **CI / Build, test, lint**. Red means the build, the tests or lint failed;
   click **Details** to read the log, fix the problem and push again.

6. **Merge the PR.** The Pages workflow deploys `main` in a minute or two.
   Open https://www.jlsola.com/GRIDDY/ and hard-refresh (Ctrl+Shift+R, or
   Cmd+Shift+R on a Mac) to check it.

Small fixes can go straight to `main`, but a branch and PR get the CI check
before anything reaches the live site.

## Trying the production build locally

The live site runs under the `/GRIDDY/` path, so build with the same base path
to see exactly what will be deployed:

```bash
BASE_PATH=/GRIDDY/ npm run build
```

```bash
npm run preview
```

`vite preview` serves `dist/` at `http://localhost:4173/GRIDDY/`.

## If a deploy breaks the live site

- **Through git:** `git revert <bad-commit>` on `main` and push. The workflow
  deploys a new build without the change.
- **Redeploy the last good build:** under **Actions → Deploy to GitHub
  Pages**, open the last successful run and choose **Re-run all jobs**. That
  rebuilds and republishes that commit.

## Keeping long-lived branches deployable

`main` moves quickly. If a feature branch sits for weeks, it drifts and the merge
gets painful. Bring `main` into your branch regularly:

```bash
git fetch origin
```

```bash
git merge origin/main
```

Fix any conflicts, then run `npm run build` and push.

## `404.html`: why refreshing `/history` works

GRIDDY uses client-side routing, so there is no real `history` file in `dist/`.
GitHub Pages serves `404.html` for any path that isn't a real file, and the
workflow makes `404.html` a copy of `index.html`, so the app loads and React
Router shows the right page. Real files such as `/GRIDDY/assets/*.js` are
still served as-is.

Two pieces of code keep the routes and assets on the `/GRIDDY/` path:

- [`vite.config.ts`](../vite.config.ts) sets Vite's `base` from `BASE_PATH`,
  which rewrites asset URLs in the built `index.html`.
- [`src/main.tsx`](../src/main.tsx) gives React Router the same path as its
  `basename`, so `/history` becomes `/GRIDDY/history`.

Nothing else in the app should hard-code an absolute URL. Use router links
(`<Link to="/history">`) and relative asset imports, and both work in local
development (base `/`) and on the live site.

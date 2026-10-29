# Keeping the Vercel site up to date

**Live site:** https://griddy-survey.vercel.app/

## How it's wired

The Vercel project (`griddy`, under the **suhasp3s-projects** Vercel team) is
connected to the GitHub repo `suhasp3/GRIDDY` through Vercel's Git integration.
You don't run any deploy command. **Pushing to GitHub is the deploy:**

| You push to… | Vercel does… |
| --- | --- |
| `main` | Builds and deploys to **production** (`griddy-survey.vercel.app`). |
| Any other branch, or a PR | Builds a **preview deployment** with its own URL. Production isn't touched. |

Vercel auto-detects Vite. It runs `npm install` and `npm run build`, then serves
`dist/`. No environment variables are needed.

The Vercel bot adds a status check and a preview link to each PR. You can also
see deployments on the repo's GitHub page under **Deployments**, or in the
Vercel dashboard. Only members of the Vercel team can open the dashboard, so ask
Suhas to invite you if you need it.

## The workflow for every new feature

```
main ──●─────────────────────────●── (production auto-deploys)
        \                       /
         ●──●──●  feature/xyz  ●  ← preview URL for every push
              push        PR → merge
```

1. **Start from an up-to-date `main`:**

   ```bash
   git switch main
   ```

   ```bash
   git pull
   ```

2. **Create a branch for the feature:**

   ```bash
   git switch -c feature/short-description
   ```

3. **Build it locally** with `npm run dev`. Before each push, check that
   `npm run build` passes (see [building.md](building.md)).

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

   Vercel builds a **preview URL** for the branch. Open it to test the feature on
   real Vercel hosting, and share it with teammates or the client for feedback.

5. **Open a pull request** into `main`:

   ```bash
   gh pr create --base main --fill
   ```

   Wait for two green checks on the PR:
   - **Vercel**: the preview deployed. Red means `npm run build` failed.
   - **CI / Build, test, lint**: GitHub Actions ran the build, the tests and
     lint. Red means one of them failed.

   Click **Details** next to a red check to read the log. Fix the problem and
   push again; the checks re-run automatically.

6. **Merge the PR.** Vercel deploys `main` to production in about a minute.
   Open https://griddy-survey.vercel.app/ and hard-refresh (Cmd+Shift+R) to
   check it.

Small fixes can go straight to `main` (`git push` on `main`), but using a branch
and PR gives you a preview to check first. Previews are free, so use them.

## If a deploy breaks production

- **Fastest:** in the Vercel dashboard, open **Deployments**, find the last good
  production deployment, then **⋯ → Promote to Production** (Instant Rollback).
  The site is back right away. Fix the bug at your own pace.
- **Through git:** `git revert <bad-commit>` on `main` and push. That deploys a
  new production build without the change.

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

## `vercel.json`: why refreshing `/history` works

GRIDDY uses client-side routing, so there is no real `history` file in `dist/`.
[`vercel.json`](../vercel.json) tells Vercel to serve `index.html` for any path
that isn't a real file, and React Router then shows the right page:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Real files such as `/assets/*.js` are still served as-is. Without this file,
loading or refreshing `/history` or `/history/combine` directly returns a 404.
Keep it in place if you add new routes.

## If you ever need to set up Vercel from scratch

For example, to move the project to a different Vercel account:

1. On vercel.com: **Add New → Project → Import** `suhasp3/GRIDDY`.
2. Framework preset: **Vite**. Build command `npm run build`, output directory
   `dist`, install command `npm install`. These are the defaults.
3. No environment variables. Click **Deploy**.
4. Under **Settings → Domains**, add or keep `griddy-survey.vercel.app`.
5. Under **Settings → Git**, keep the Production Branch as `main`.

Optional CLI for deploying from your machine without git:
`npm i -g vercel`, then `vercel` (preview) or `vercel --prod` (production). The
Git workflow above is still the recommended way.

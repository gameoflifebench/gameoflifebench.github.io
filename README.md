# Leaderboard Site

This directory is a standalone static leaderboard for `cell-auto`.

## GitHub Pages

This repo now includes a GitHub Pages workflow at `.github/workflows/deploy-pages.yml`.

To publish it:

```bash
git init
git add .
git commit -m "Prepare GitHub Pages site"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

Then in GitHub:

1. Open `Settings` -> `Pages`.
2. Set `Source` to `GitHub Actions`.
3. Push changes to `main` and let the `Deploy GitHub Pages` workflow run.

Your site will be available at:

```text
https://<your-user>.github.io/<your-repo>/
```

## Leaderboard Data

The site reads `leaderboard.json` from the repo root. A placeholder file is included so the site still loads before benchmark data exists.

To generate real leaderboard data:

```bash
uv run cell-auto leaderboard --json --out leaderboard.json
```

# Agent Instructions — Federal Infographic Toolkit

Read this before changing anything. It is written for a coding agent working on
this repository on behalf of the operator.

## What this is

An internal AI infographic generator for federal capture and proposal teams at
B&A. Users describe a graphic, and it renders variants through two image models
(OpenAI `gpt-image-2` and Google's Nano Banana), constrained to federal proposal
conventions: compliant typography, USWDS-aligned palettes, Section 508 contrast
modes, and layouts drawn from proposal-graphic archetypes.

Roughly 15 people use it for live proposal work. **Treat production as
production** — real user accounts, real generated work product.

## Layout

```
src/                  Vite + React 19 + TypeScript frontend (SPA)
  App.tsx             The generator: prompt, engines/variations, settings drawers
  HistoryView.tsx     Render history; doubles as the per-project gallery
  ProjectsView.tsx    Projects list + sharing
  AdminView.tsx       User management + usage dashboard (admins only)
  PreviewInWord.tsx   Word-page mockup preview
  lib/                Thin fetch wrappers over the API. NO API keys here.
server/               Hono backend (Node, ESM, its own package.json)
  src/routes/         auth, render, ai, history, users, projects
  src/lib/            openai.ts, gemini.ts, gpt5.ts — the actual model calls
deploy/aws/           CloudFormation + deploy/ops scripts
AWS-DEPLOY.md         Architecture and operations runbook — read it
```

Two separate npm projects: run `npm install` in the root **and** in `server/`.

## Non-negotiables

1. **API keys never reach the browser.** All model calls happen server-side and
   read keys from the environment. If you find yourself adding a `VITE_*` key,
   stop — that ships the secret to every user. This was a real bug once; do not
   reintroduce it.
2. **Do not commit secrets.** `.env` is gitignored. Production secrets live in
   AWS SSM Parameter Store under `/fit/*`.
3. **Type-check both projects before deploying:**
   ```bash
   npx tsc -b --noEmit          # frontend
   cd server && npx tsc --noEmit # backend
   npm run build                # confirms the Vite build works
   ```
4. **The database is SQLite on a mounted volume.** Schema changes must be
   idempotent migrations in `server/src/db.ts` — guarded `CREATE TABLE IF NOT
   EXISTS`, and `PRAGMA table_info` checks before `ALTER TABLE ADD COLUMN`
   (SQLite has no `IF NOT EXISTS` for columns). The database has live user data;
   never write a migration that drops or rewrites existing rows.
5. **Never auto-retry the generation endpoints.** `/api/render`, `/api/plan`,
   `/api/summarize`, `/api/suggest-prompt` are billed per call and a lost
   response does not mean the work did not happen. `src/lib/api.ts` deliberately
   excludes them from its retry logic.

## Deploying

```bash
./deploy/aws/deploy.sh
```

Pulls `main` onto the EC2 host over SSM, rebuilds, restarts, health-checks.
Requires AWS credentials for `us-east-1`; needs no SSH key and no local Docker.

**Deploy only what is committed and pushed to `main`** — the server builds from
GitHub, so uncommitted local changes will not appear. Push first, then deploy.

Logs: `./deploy/aws/logs.sh` (add `caddy` for the TLS layer).
Shell: `aws ssm start-session --target i-0f66cbf26dd97a634 --region us-east-1`.

## Verifying a change reached production

Do not assume a deploy worked. Check:

```bash
curl -s https://13-219-66-240.sslip.io/api/health
```

For a real end-to-end check, log in and render something. Credentials are with
the operator. A render takes 10–60 seconds; if it hangs past ~150 seconds the
server times out and returns a readable error.

## Things that will bite you

- **The frontend and server both have a `variant-overrides.ts`.** They are
  intentional duplicates (no shared package). Change one, change the other.
- **Flow archetype names are duplicated too** — `FLOW_CATEGORIES` in
  `src/App.tsx` and `FLOW_VALUES` in `server/src/lib/gpt5.ts`. They must stay in
  sync or AI-planned variants will fail schema validation.
- **`index.html` must never be cached.** The server sets `Cache-Control:
  no-cache` on HTML and immutable long-cache on hashed `/assets/*`. Breaking
  this strands users on stale bundles that reference deleted files — this
  caused a production outage once.
- **Inline sizes force minimal density.** Picking an inline size auto-sets
  density to `minimal` and disables the control; small canvases cannot carry
  paragraph text legibly.
- **Logos are reproduced by the model, not composited.** The prompt forbids any
  box, frame, or outline around the logo and permits only colour re-tinting.
  Do not reintroduce a "reserve empty space" instruction — models interpreted
  that literally and drew ugly outlined rectangles.
- **The Fly deployment is retired.** It serves a migration notice when
  `MIGRATED_NOTICE=1` is set. Do not deploy features there.

## Conventions

Match the surrounding code. It leans on Tailwind utility classes, Phosphor
icons, `framer-motion` for transitions, and comments that explain *why* rather
than *what*. Commit messages are descriptive and explain the reasoning behind a
change, not just its contents.

When you finish work, state plainly what you changed, whether it is deployed,
and what you verified — including anything you could not verify.

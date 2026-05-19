# Fly.io deployment

One-time setup, then every `git push` followed by `fly deploy` ships an update.

## One-time setup

1. **Install `flyctl`** (`brew install flyctl`) and `fly auth login`.

2. **Launch the app** (claims the name, doesn't deploy yet):
   ```sh
   fly launch --no-deploy --copy-config --name federal-infographic-toolkit --region iad
   ```
   If the name is taken, pick a different one and update `app = "..."` in `fly.toml`.

3. **Create the persistent volume** (holds SQLite + uploads):
   ```sh
   fly volumes create data --size 5 --region iad
   ```

4. **Set the secrets**:
   ```sh
   fly secrets set \
     OPENAI_API_KEY="sk-proj-..." \
     GOOGLE_GEMINI_API_KEY="AIza..." \
     ADMIN_EMAIL="schreyerc@bna-inc.com" \
     ADMIN_PASSWORD="pick-a-real-temp-password"
   ```
   `ADMIN_PASSWORD` is only used on the very first boot to seed the admin.
   After you've changed it via the in-app force-password-change screen, you
   can unset it: `fly secrets unset ADMIN_PASSWORD`.

5. **Deploy**:
   ```sh
   fly deploy
   ```
   First deploy takes ~2-3 minutes (native build of better-sqlite3).
   Subsequent deploys ~1 minute.

6. **Verify**:
   ```sh
   fly status
   fly logs
   curl https://federal-infographic-toolkit.fly.dev/api/health
   ```

## Ongoing operations

- **Deploy a new version**: `fly deploy`
- **View live logs**: `fly logs`
- **Open SSH to the running machine**: `fly ssh console`
- **Inspect the database**:
  ```sh
  fly ssh console -C "sqlite3 /data/app.db .tables"
  fly ssh console -C "sqlite3 /data/app.db 'SELECT email,role FROM users'"
  ```
- **Manually back up the volume** (downloads a snapshot):
  ```sh
  fly volumes list
  fly volumes snapshots create <volume_id>
  ```
- **Scale memory** if needed:
  ```sh
  fly scale memory 1024
  ```

## Cost ballpark

- One `shared-cpu-1x` machine: ~$1.94/mo running 24/7. With
  `auto_stop_machines = "stop"` set in `fly.toml`, it shuts off after
  inactivity and starts within ~1s on the next request — usually under $1/mo.
- 5 GB volume: ~$0.75/mo.
- Bandwidth: free up to 160 GB/mo.

Total expected: **$2–3/mo** plus OpenAI/Gemini usage.

## What's running

- One Node 22 process serving the Hono backend + bundled SPA on port 8080.
- SQLite at `/data/app.db`; image files at `/data/uploads/<user_id>/<render>.png`.
- All AI calls (OpenAI image gen + Gemini + GPT-5 reasoning) happen
  server-side — API keys never reach the browser.
- Session cookies (`fit_session`) signed by the framework, scoped HttpOnly +
  Secure + SameSite=Lax.

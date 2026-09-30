# Deploying BUILDFlow on Railway

Railway deploys automatically from a GitHub branch on every push. Nothing here needs the Railway CLI.

**Branch to deploy from:** `claude/laughing-cori-3gm0z2`

## One-time setup (about 10 minutes)

1. **Create the project.** Go to <https://railway.com/new> → **Deploy from GitHub repo** → choose `vinithkac-yoko/buildflow`.
   If the repo is not listed, click **Configure GitHub App** and give Railway access to it.
2. **Set the branch.** Open the new service → **Settings** → **Source** → **Branch** → choose `claude/laughing-cori-3gm0z2`. Leave "Wait for CI" off.
3. **Add Postgres.** In the project canvas click **+ New** → **Database** → **Add PostgreSQL**.
4. **Add a volume for uploads.** Click **+ New** → **Volume**, attach it to the app service, and set the mount path to `/data`. The same volume holds site photos and project documents (drawings, agreements, handover files).
5. **Set variables** on the app service → **Variables** → **New Variable**:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | click **Add Reference** and pick the Postgres service's `DATABASE_URL` |
   | `SESSION_SECRET` | 32 or more random characters (for example run `openssl rand -hex 32` on any computer) |
   | `UPLOAD_DIR` | `/data/uploads` |
   | `DEMO_MODE` | `true` |
   | `APP_URL` | the public URL from step 6 (add it after step 6, then redeploy) |

6. **Get a public URL.** App service → **Settings** → **Networking** → **Generate Domain**. Copy it into `APP_URL`.
7. **Health check.** Settings → **Deploy** → **Healthcheck Path** should read `/api/health` (it is already in `railway.json`; just confirm).
8. **Deploy.** Click **Deploy** (or push to the branch). The first deploy builds, applies the database migrations and loads the demo data automatically.

## Confirm it works

1. Open the domain. You should see the BUILDFlow sign-in page with a **DEMO** badge and a **Demo accounts** list.
2. Tap **Owner**, then **Sign in** (password `demo1234`). You should land on the dashboard.
3. Open **Projects** — you should see 9 projects.
4. Sign out, sign in as **Site Engineer** — you should see one project and no ₹ amounts anywhere.
5. `https://<your-domain>/api/health` should return `{"status":"ok","db":"up"}`.

If the build fails, open the deployment's **Build Logs** and send the last 30 lines.

## Later

- **Every push to the branch redeploys.** Migrations run automatically at start.
- **Reset demo data** (added in milestone 2): Owner → Settings → *Reset demo data*, only while `DEMO_MODE=true`. Do it just before a demo.
- Set `DEMO_MODE` to `false` to hide the demo accounts list and the reset button.

## Installing on a phone and working offline

- The service worker and "install app" need **HTTPS**. Railway's `*.up.railway.app` domain is HTTPS, so nothing extra is needed.
- On Android Chrome: open the app URL, sign in, wait a few seconds on any screen (the app saves the daily-report screens), then menu → **Install app**. On iPhone Safari: Share → **Add to Home Screen**.
- After a new deploy, the phone picks up the new service worker the next time the app is opened online.
- Nothing to configure: no new environment variables or services.


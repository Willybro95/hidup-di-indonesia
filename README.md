# HIDUP DI INDONESIA: City Edition

*Salary in, trouble out.* A 3D online property game for 2–6 players on a hexagon board of 22 Indonesian cities. Pick a job, buy cities from Cirebon to Jakarta, charge rent, build houses and towers, take over rivals' cities, and survive what Indonesia throws at everyone: fuel hikes, floods, cash aid and surge pricing. Play with friends, against bots, or both.

- **Website:** plain JavaScript + Three.js (3D board with a 2D fallback), installable on phones (PWA)
- **Backend:** Supabase (Postgres, Auth, Realtime, Edge Functions)
- **Hosting:** GitHub Pages, deployed automatically by GitHub Actions on every push

---

## Launch it (about 30 minutes, no coding)

You need two free accounts: **GitHub** (you have one) and **Supabase**.

### 1. Create the Supabase project
1. Go to [supabase.com](https://supabase.com) → **Start your project** → sign in with GitHub.
2. **New project**: name it `hidup-di-indonesia`. Choose region **Southeast Asia (Singapore)**.
3. Set a **database password**, then copy it somewhere safe. You'll need it in step 5.
4. Wait about 2 minutes for the project to finish setting up.

### 2. Collect four values
| Value | Where to find it in Supabase |
|---|---|
| **Project ref** | Project Settings → General → *Project ID / Reference ID* (looks like `abcdefghijklmnopqrst`) |
| **Anon key** | Project Settings → API Keys → the **anon / publishable** key (safe to expose in the website) |
| **Database password** | The one you saved in step 1 |
| **Access token** | Your avatar (top right) → Account preferences → **Access Tokens** → *Generate new token* |

> Never put the **service_role / secret** key anywhere. The game doesn't need it from you.

### 3. Turn on guest login
In Supabase: **Authentication → Sign In / Providers** → enable **Allow anonymous sign-ins** → Save.

### 4. Turn on GitHub Pages
In your GitHub repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

### 5. Add the secrets to GitHub
Repository **Settings → Secrets and variables → Actions → New repository secret**, and add these four:

| Name | Value |
|---|---|
| `SUPABASE_PROJECT_REF` | Project ref |
| `SUPABASE_ANON_KEY` | Anon key |
| `SUPABASE_DB_PASSWORD` | Database password |
| `SUPABASE_ACCESS_TOKEN` | Access token |

### 6. Deploy
Repository **Actions → Test and deploy → Run workflow**. In about 3–5 minutes all three jobs turn green:

1. **test**: the rules engine and server tests
2. **backend**: creates the database tables and security rules, and deploys the `game-action` server function
3. **website**: builds and publishes the site

Your game is live at **`https://<your-github-username>.github.io/hidup-di-indonesia/`**.

From now on, every change pushed to `main` redeploys automatically.

### 7. Try it
Open the link on your laptop, type a nickname and tap **Create a room** (you're signed in as a guest automatically). Tap **Copy invite**, open that link on your phone and join. To play alone, use **🤖 Play against bots**.

### Optional: your own domain
Buy a domain (e.g. `hidupdiindonesia.id`), then go to GitHub **Settings → Pages → Custom domain** and follow GitHub's DNS instructions.

### Good to know
- **Free tier:** Supabase pauses free projects after about a week with no activity. Open the dashboard and click *Restore* to wake it. Upgrade to a paid plan before a real public launch.
- **Abuse protection:** for a public launch, consider turning on CAPTCHA under Authentication → Attack Protection.
- **Hosting on Vercel instead:** import the repo on vercel.com, set the env vars `VITE_SUPABASE_URL=https://<ref>.supabase.co` and `VITE_SUPABASE_ANON_KEY`, build command `npm run build`, output `dist`. The backend still deploys through the GitHub Action.

---

## How it works

```
Browser (Three.js)                     Supabase
───────────────                       ───────────────────────────────────────────
reads room state ───── REST ────────► game_rooms (RLS: members only)
live updates ◄──────── Realtime ───── postgres_changes on game_rooms + presence
every move ──────────► Edge Function game-action
                         │ checks session, validates input, membership, turn
                         │ runs the rules engine (dice, cards, money) on the server
                         └► apply_game_action(): one transaction
                              • version check (two clicks can't both apply)
                              • (user, requestId) unique (retries never double-charge)
                              • membership, private deck state
```

- **The database is the source of truth.** Browsers can only *read* rows they're allowed to see. All writes go through the server function.
- **Dice and card draws** use `crypto.getRandomValues` on the server. Shuffled decks are stored in `game_private`, which no browser can read.
- **Money** is always an integer rupiah amount, and every transaction is written to the game log.
- **Jobs:** after the host starts, each player is offered 4 of the 17 jobs (3 when more than 4 play) and must pick one before the first roll. Bots pick for themselves.
- **Reconnection:** the session persists in the browser. On reload, reconnect or tab focus, the site re-reads the room and re-subscribes to updates.
- **Bots** run in the host's browser, which asks the server to take the bot's step. The server picks the move. If the host goes offline, another player's browser takes over.

### Project layout
```
src/                          website: ui.js (screens), board3d.js (Three.js board), backend-supabase.js, main.js
supabase/functions/_shared/   engine.js: rules, 36-space hexagon, 22 cities, 17 jobs, 66 cards, scoring, bot AI
                              handler.ts: authoritative action handler
supabase/functions/game-action/  edge function entry point
supabase/migrations/          tables, RLS policies, apply_game_action(), reference data
scripts/build-artifact.mjs     builds the same game as one HTML file for a claude.ai artifact
tests/                        engine simulation, server tests on real Postgres, browser end-to-end test
.github/workflows/deploy.yml  test → backend → website
```

### Database tables
`profiles`, `game_rooms`, `game_players`, `game_private`, `game_actions` (the idempotency log), plus read-only `card_definitions` and `job_definitions`. Per-player job, cash, cities and buildings live inside each room's `state`, so one transaction updates them together. (`player_secrets` is unused in this edition.)

---

## Development

```bash
npm install
cp .env.example .env.local      # fill in your project URL and anon key
npm run dev                     # http://localhost:5173
```

Changes to the cards or jobs? Run `npm run gen:reference` to refresh the reference-data migration.

### Tests
```bash
npm test          # 400 simulated games + 50 server/database checks on embedded Postgres
npm run test:e2e  # three real browsers play a full game against a local Supabase stand-in
```
The server tests run the real migrations (RLS, roles, `auth.uid()`) with PGlite. They cover duplicate requests, simultaneous rolls, client-supplied dice or balances, non-members, late joiners, the job draft, rematch and bots.

The end-to-end test needs Playwright: `npm i -D playwright && npx playwright install chromium`.

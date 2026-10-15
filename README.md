# ExpenseBook

A personal cash in / cash out ledger app, modelled on CashBook. Each person signs in with Google, can keep many ledgers, and can share any ledger with another person.

- **Frontend:** React, Vite, TypeScript and Tailwind. It's an installable web app (PWA), hosted free on GitHub Pages.
- **Backend:** Supabase, on the free plan. It provides the Postgres database, Google sign-in, and Row Level Security (database rules that control who can read or change each row).
- **Features:**
  - Ledgers you can share with someone else.
  - Cash in / out entries, each with a remark and an optional category.
  - A running balance for every entry.
  - Filters by date, type, category and who added the entry, plus search on remarks.
  - Bulk categorize or delete.
  - Monthly and per-category reports.
  - Import of a CashBook CSV, skipping duplicates and checking the running balances.
  - CSV export in the same format.

## One-time setup

You'll need a GitHub account, a Supabase account (free) and a Google Cloud account (free).

### 1. Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick the region closest to you (e.g. Mumbai) and save the database password somewhere safe.
2. Open **SQL Editor** → **New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Open **Project Settings** → **API** and copy:
   - the **Project URL**, e.g. `https://abcd1234.supabase.co`
   - the **anon public** key

### 2. Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com), create a project.
2. Set up the consent screen under **APIs & Services** → **OAuth consent screen**:
   - User type: **External**.
   - App name: ExpenseBook.
   - Add your email.
   - Scopes: leave the defaults (email, profile).
   - Click **Publish app** so the sign-in doesn't expire every 7 days. Basic scopes don't need Google's review.
3. Create the client under **Credentials** → **Create credentials** → **OAuth client ID**:
   - Application type: **Web application**.
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - Copy the **Client ID** and **Client secret**.
4. In Supabase, go to **Authentication** → **Sign In / Providers** → **Google**. Enable it and paste the Client ID and secret.
5. In Supabase, go to **Authentication** → **URL Configuration**:
   - **Site URL:** `https://<your-github-username>.github.io/<repo-name>/`
   - **Redirect URLs:** add both the site URL above and `http://localhost:5173/**`

### 3. Run locally

```sh
cp .env.example .env.local   # then fill in the URL and anon key
npm install
npm run dev                  # http://localhost:5173
```

### 4. Deploy to GitHub Pages

1. Create a **public** repo on GitHub. Free GitHub Pages needs a public repo.
   - Your data isn't in the repo: it lives in Supabase, protected by Row Level Security.
   - `*.csv` is gitignored so CashBook exports can't be committed by accident.
2. Set up the repo settings:
   - **Settings** → **Pages** → **Source:** choose **GitHub Actions**.
   - **Settings** → **Secrets and variables** → **Actions** → **Variables** tab: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Push to `main`. The **Deploy to GitHub Pages** workflow tests, builds and publishes the site to `https://<username>.github.io/<repo-name>/`.

The **Keep Supabase awake** workflow pings the database every 3 days. Without it, Supabase pauses free projects after 7 days of no activity.

> Note: GitHub turns off scheduled workflows in repos with no commits for 60 days. If you get an email about that, click **Enable workflow** under the Actions tab.

### 5. Share with family

1. The other person opens the site once and signs in with Google.
2. You open the ledger → ⚙︎ → **Shared with** and enter their email.

Members can add and edit entries. Only the owner can rename or delete the ledger and manage who it's shared with.

## Bringing over CashBook data

1. In CashBook, export each book with **no date filter**. The full history is needed for the opening balance to be right.
2. In ExpenseBook, create a ledger → **Import CashBook CSV** → choose the file.
3. Check the preview:
   - It shows how many entries will be imported and how many are already there.
   - It flags rows it can't read.
   - It warns if the file's running balances don't add up, e.g. a date-filtered export.
4. Importing the same file twice is safe: existing entries are skipped.

## Backups

Supabase's free plan has no downloadable backups. Every now and then, use **Export all entries (CSV)** in each ledger's settings.

## Development

```sh
npm test         # unit tests (CSV parsing, balance checks, duplicate detection)
npm run lint
npm run build
```

- Amounts are stored as `numeric(14,2)` in Postgres and handled as integer paise in the app.
- All dates are shown and entered in India time (Asia/Kolkata), so every device shows the same thing.

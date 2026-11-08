# Happy Body

A daily runner for the exercise program in *The Happy Body* (Aniela and Jerzy Gregorek). Installable progressive web app: plain HTML, CSS and JavaScript modules, no build step, no server of its own. Optional accounts sync each person's data across their own devices through a hosted backend (Supabase); without an account it works entirely on the device. Not affiliated with the authors.

## What it does

- **Today.** Shows where you are (sequence, round, exercise), the tempo timer with a big phase label and per-phase countdown, sound and spoken cues, rep dots, and the six exercise cards for the current sequence. Done advances; the timer finishing logs the exercise and moves on by itself. A relax step closes the day.
- **Program.** Phase (week 1 / week 2 / week 3 onward), program start date, base weight for 1:1 with every other weight computed from Tables 8.2 and 8.3 and rounded to the half pound, 6 or 3 reps on lifts, a level (1–5) per exercise, the "sore or stiff this week" flow from the week-2 rule, and a history of changes.
- **Progress.** Three sub-tabs:
  - *Streak*: 28-day grid, current and best streak, per-day details, clear today.
  - *Standards*: the six Happy Body Standards (flexibility, strength, speed, leanness, ideal body weight, posture) with a met/not-yet badge each. Speed fills in from your last complete session and Ideal body weight from daily weigh-ins; the others take check-ins. Strength and Leanness targets come from the book's rule (58% or 45% of body weight across both hands; 10% or 13% body fat) unless you type one. Every test description and target is editable. The test texts follow the book's chapter 2, except that the book does not say which grade of the five flexibility tests counts as the standard. Daily weigh-in with a 90-day trend chart, target line and weekly change.
  - *Photos*: dated progress photos tagged front / side / back, a first-vs-latest side-by-side compare with date pickers, and a gallery. Photos are downscaled to 1280 px, stored on the device, and included in backups.
- **Settings.** Cues, get-ready countdown, auto-start, relax length, keep-awake, theme, account (sign in, last synced, sync now, sign out), backup export/import, erase.
- **Exercise detail.** Setup, numbered steps, five levels, tempo, purpose. Steps and levels show the book's photos once they have been imported (see below), or original line drawings until then. Tap a photo to see it full screen; **Book page** shows the whole page, with tap to zoom.

## Hosting and installing on an iPhone

The app needs to be served over HTTPS for the service worker (offline) and home-screen install to work. Any static host works:

- **GitHub Pages**: push this folder to a repository, enable Pages on the branch, open the URL.
- **Netlify / Cloudflare Pages / Vercel**: drag the folder in, or point at the repository. No build command, publish directory is the folder itself.

Then on the iPhone, open the URL in Safari, tap **Share → Add to Home Screen**. Launch it from the icon: it runs full screen, works offline, keeps the screen awake while a timer runs, and plays cues.

For local testing on a computer:

```
cd happy-body
python3 -m http.server 8080
# open http://localhost:8080
```

## Releasing a change

Every file is precached by the service worker. After changing anything, bump `VERSION` in `sw.js` (for example `hb-v1.0.1`). Installed copies then show an "Update" banner on next launch.

## Book photos

The book's photos are copyrighted, and this repository and its Pages site are public, so they are not part of the app. They are loaded per person instead: a backup-format file holding one cropped photo per step and level (photo keys `seq:n:step:i` and `seq:n:level:i`) plus the whole page (`seq:n:page:0`). Import it once with **Settings → Backup → Import → Merge** while signed in; sync copies the photos to your private storage and your other devices pick them up with **Sync now**. Keep the file out of the repository (`reference/` is ignored).

## Accounts and sync

Each person (Zannah, Dan) signs in with their own email from **Settings → Account** and their settings, workout log, program history, today's session, progress (standards, check-ins, weigh-ins, photo metadata) and photos follow them between their iPhone and computer. Signing in is optional: signed out, or offline, the app works exactly as before.

### Why Supabase

The app has to stay a static site on GitHub Pages, so the backend must be callable straight from the browser with a public key, with email sign-in, a document-style store and file storage for photos.

- **Supabase** (chosen): email + password and emailed sign-in links, Postgres with row-level security so each signed-in person can only read and write their own rows, and a private Storage bucket for photos with the same per-person rule. The free plan (500 MB database, 1 GB files, 50,000 monthly users) is far more than two people need: a year of daily workouts is a few MB of rows, and photos are downscaled before storing. Everything is plain HTTPS, so the app talks to it with `fetch` and ships no SDK.
- **Firebase** was the alternative. Firestore and Auth would do, but new Cloud Storage buckets now require the pay-as-you-go Blaze plan, so photo sync would mean putting a card on file.

One free-plan catch: Supabase pauses a free project after about a week with no traffic. Daily use keeps it awake; if it does pause, the app keeps working offline and shows "Sync failed" until you press **Restore** in the Supabase dashboard.

### One-time backend setup

1. Create a free project at [supabase.com](https://supabase.com) (any region near you; save the database password somewhere, the app never needs it).
2. **SQL Editor → New query**, paste [`supabase/setup.sql`](supabase/setup.sql), **Run**. It creates the `hb_records` table, the private `hb-photos` bucket, and the row-level security policies. It is safe to run again.
3. **Project Settings → API Keys**: copy the project URL and the **publishable** key (`sb_publishable_…`, or the legacy `anon` key). Put them in [`js/config.js`](js/config.js). Both are meant to be public; the policies from step 2 are what keep each person to their own data. Never use the `secret` / `service_role` key: the app refuses to run with one.
4. **Authentication → URL Configuration**: set **Site URL** to `https://zannahpierce-pico.github.io/happy-body/` so links in emails open the app.
5. Create the two accounts: either open the app and use **Create account** in Settings, or in **Authentication → Users → Add user** with **Auto Confirm User**. Then, to stop anyone else creating an account in your project, turn off **Authentication → Sign In / Providers → Allow new users to sign up**.
6. Bump `VERSION` in `sw.js`, commit and push. Installed copies pick it up through the Update banner.

The free plan's built-in email sender is rate limited (a few emails an hour), which is fine for two people. If confirmation emails are a nuisance, create the users in the dashboard with Auto Confirm (step 5).

**Email me a sign-in link** (in the sign-in sheet) is the way back in after a forgotten password: open the link on the device you want signed in. On an iPhone the link opens in Safari, which keeps its storage apart from the home-screen app, so the home-screen app needs the password. Supabase's built-in sender uses its default email text; editing it (for example to send a typed code instead) needs your own SMTP service under **Authentication → Emails**.

### How sync works

- IndexedDB stays the source of truth. Every change is stamped locally ([`js/merge.js`](js/merge.js)) as one small record: each settings value, each log entry, weigh-in, check-in, photo, history entry, the six standards and today's session.
- [`js/sync.js`](js/sync.js) syncs a couple of seconds after a change, when the app comes back online or to the foreground, every five minutes while open, and on **Sync now**. Each cycle pulls rows changed since the last sync, merges them, then pushes what changed here. Photos go to the `hb-photos` bucket under the person's own folder.
- Conflicts: last write wins per record, by the time of the edit on the device that made it. The server applies the same rule (a trigger in `setup.sql`), so a device that comes online late cannot overwrite a newer edit. Deletes are kept as tombstones so they reach every device. Different fields edited on two devices both survive.
- First sign-in on a device merges what is already there into the account: log entries and progress are unioned, and a fresh device's default settings never override the account's real ones.
- Signing out keeps the data on the device (or erases it, if you choose). Signing in to a different account on a device that holds someone else's data asks whether to erase it first. **Erase all data** erases this device only and signs out; the account keeps its copy.
- Settings shows the account, the last synced time, and how many changes are waiting.
- Device clocks decide ties, so keep automatic time on (the default on phones and computers).

## Where the data lives

- Primary store: IndexedDB (`happybody`): settings, the workout log, history, today's session, progress (standards, check-ins, weigh-ins, photo metadata), photos.
- Mirror: localStorage keeps a copy of settings, log and history. On every launch both copies are compared and the stale one is repaired, so the log survives either store being cleared.
- Every write is awaited to transaction completion and the Settings tab shows the last save time or an error.
- The app asks the browser for persistent storage so iOS does not evict it. Still: export a backup from Settings now and then, and before reinstalling. The file includes photos.
- Signed in, the same data also lives in your Supabase account (see Accounts and sync).

## Program rules encoded

- Week 1: Sequence 1 × 6 rounds. Week 2: Sequence 1 × 4 then Sequence 2 × 4. Week 3 onward: all three sequences × 3 rounds.
- Weights: Seq 1 = 100 / 150 / 200 / 150 %, Seq 2 = 50 / 200 / 100 / 150 %, Seq 3 = 150 / 50 / 100 / 150 % of the base, for exercises 1 / 4 / 5 / 6.
- Lifts (exercises 1, 4, 5, 6): 6 reps to gain muscle, 3 reps to lose muscle or stay the same. Exercises 2 and 3 are always 6 reps. 2:4 splits reps between arms, 2:2 alternates sides; the timer announces the side.
- Soreness, judged after a week: each sore exercise drops a level; at level 1 the base drops 1 lb instead, repeatable until it stops.
- Raising weight: once nothing is sore, the dumbbells feel comfortable and a session takes about 30 minutes, men add 2 lb and women 1 lb to the base, and keep doing so until all six Standards are met. Then maintain.
- Streak day = every slot of the day's plan logged (skips count so the round still completes).

## Tests

```
node --test tests/program.test.mjs   # program logic and timer math
node --test tests/merge.test.mjs     # sync records and last-write-wins merge
node tests/e2e.cjs                   # browser pass (Playwright): screenshots into tests/shots, persistence checks
node tests/e2e-progress.cjs          # Progress tab: weigh-ins, check-ins, photos, export/import
node tests/e2e-sync.cjs              # accounts and sync: two people, two devices, offline, photos (fake Supabase in tests/fake-supabase.cjs)
```

## Layout

```
index.html            shell
manifest.webmanifest  PWA manifest
sw.js                 service worker (precache, offline, update banner)
css/app.css           styles, light and warm-brown dark theme
js/app.js             boot, routing, top bar, service worker registration
js/store.js           IndexedDB + localStorage mirror, export/import, change tracking for sync
js/merge.js           sync records and last-write-wins merge (pure functions)
js/sync.js            sign-in and background sync with Supabase over fetch
js/config.js          Supabase project URL and publishable key (empty = no accounts)
js/program.js         weights, plans, positions, streaks (pure functions)
js/session.js         workout controller: start/pause/done/skip/undo/relax
js/timer.js           wall-clock tempo timer
js/audio.js           cues, speech, iOS keep-awake audio
js/wakelock.js        Screen Wake Lock
js/figure.js          generated line-drawing figures
js/photos.js          replace a drawing with your photo
js/data/exercises.js  the 18 exercises
js/views/*.js         Today, Program, Progress (Streak, Standards, Photos), Settings, exercise sheet
fonts/, icons/        Hanken Grotesk and Big Shoulders Display fonts, app icons
supabase/setup.sql    one-time backend setup: table, photo bucket, row-level security
```

## Open items from the brief

- Which grade of the five flexibility tests counts as meeting the standard, and whether Strength is set from current or ideal body weight (the app uses current).
- Table 2.1's row values were read from a skewed photo and fitted to the 3 lb and 5 lb per inch rule; worth a second look (`book-notes.md` has the findings).

Checked against the book: the week structure (sequences in blocks, 6 then 4 then 3 rounds), the reps rule, the weight percentages in Tables 8.2 and 8.3, the soreness rule, the weight-increase rule, the 30-minute Speed standard, and rest (chapter 5: rest is the exhale at the end of every rep, with no interval between rounds or sequences; every exercise here ends with a 2-second exhale, and the get-ready countdown is the app's own).

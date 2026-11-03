# Happy Body

A daily runner for the exercise program in *The Happy Body* (Aniela and Jerzy Gregorek). Installable progressive web app: plain HTML, CSS and JavaScript modules, no build step, no accounts, no backend. Not affiliated with the authors.

## What it does

- **Today.** Shows where you are (sequence, round, exercise), the tempo timer with a big phase label and per-phase countdown, sound and spoken cues, rep dots, and the six exercise cards for the current sequence. Done advances; the timer finishing logs the exercise and moves on by itself. A relax step closes the day.
- **Program.** Phase (week 1 / week 2 / week 3 onward), program start date, base weight for 1:1 with every other weight computed from Tables 8.2 and 8.3 and rounded to the half pound, 6 or 3 reps on lifts, a level (1–5) per exercise, the "sore or stiff this week" flow from the week-2 rule, and a history of changes.
- **Progress.** Three sub-tabs:
  - *Streak*: 28-day grid, current and best streak, per-day details, clear today.
  - *Standards*: the six Happy Body Standards (flexibility, strength, speed, leanness, ideal body weight, posture) with a met/not-yet badge each. Strength fills in from your base weight, Speed from your last complete session, Ideal body weight from daily weigh-ins; the others take check-ins. Every test description and target is editable. The default test texts are placeholders to check against the book, except Speed (about 30 minutes). Daily weigh-in with a 90-day trend chart, target line and weekly change.
  - *Photos*: dated progress photos tagged front / side / back, a first-vs-latest side-by-side compare with date pickers, and a gallery. Photos are downscaled to 1280 px, stored on the device, and included in backups.
- **Settings.** Cues, get-ready countdown, auto-start, relax length, keep-awake, theme, backup export/import, erase.
- **Exercise detail.** Setup, numbered steps with original line drawings, five levels with drawings, tempo, purpose. Any drawing can be replaced with your own photo, stored on the device and included in backups.

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

## Where the data lives

- Primary store: IndexedDB (`happybody`): settings, the workout log, history, today's session, progress (standards, check-ins, weigh-ins, photo metadata), photos.
- Mirror: localStorage keeps a copy of settings, log and history. On every launch both copies are compared and the stale one is repaired, so the log survives either store being cleared.
- Every write is awaited to transaction completion and the Settings tab shows the last save time or an error.
- The app asks the browser for persistent storage so iOS does not evict it. Still: export a backup from Settings now and then, and before reinstalling. The file includes photos.

## Program rules encoded

- Week 1: Sequence 1 × 6 rounds. Week 2: Sequence 1 × 4 then Sequence 2 × 4. Week 3 onward: all three sequences × 3 rounds.
- Weights: Seq 1 = 100 / 150 / 200 / 150 %, Seq 2 = 50 / 200 / 100 / 150 %, Seq 3 = 150 / 50 / 100 / 150 % of the base, for exercises 1 / 4 / 5 / 6.
- Exercises 2 and 3 are always 6 reps. 2:4 splits reps between arms, 2:2 alternates sides; the timer announces the side.
- Soreness: each sore exercise drops a level; at level 1 the base drops 1 lb instead.
- Streak day = every slot of the day's plan logged (skips count so the round still completes).

## Tests

```
node --test tests/program.test.mjs   # program logic and timer math
node tests/e2e.cjs                   # browser pass (Playwright): screenshots into tests/shots, persistence checks
node tests/e2e-progress.cjs          # Progress tab: weigh-ins, check-ins, photos, export/import
```

## Layout

```
index.html            shell
manifest.webmanifest  PWA manifest
sw.js                 service worker (precache, offline, update banner)
css/app.css           styles, light and warm-brown dark theme
js/app.js             boot, routing, top bar, service worker registration
js/store.js           IndexedDB + localStorage mirror, export/import
js/program.js         weights, plans, positions, streaks (pure functions)
js/session.js         workout controller: start/pause/done/skip/undo/relax
js/timer.js           wall-clock tempo timer
js/audio.js           cues, speech, iOS keep-awake audio
js/wakelock.js        Screen Wake Lock
js/figure.js          generated line-drawing figures
js/photos.js          replace a drawing with your photo
js/data/exercises.js  the 18 exercises
js/views/*.js         Today, Program, Progress (Streak, Standards, Photos), Settings, exercise sheet
fonts/, icons/        Archivo fonts, app icons
```

## Open items from the brief

- Whether week 2 is Seq 1 × 4 then Seq 2 × 4 (as built) or alternating rounds.
- Rest between rounds, if the book specifies any: there is none built in beyond the get-ready countdown.
- Later chapters' rules for raising weight beyond the week-7 increments.
- The reps rule as the book states it. The Program tab says "6 to gain or keep muscle, 3 to lose or maintain", which reads as two overlapping cases; find the exact wording and what 3 reps is for.

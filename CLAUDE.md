# WC26 Picks — Development Process

> [!IMPORTANT]
> **After every PR is opened, you MUST immediately post the Firebase preview URL in chat. No exceptions. Do not move on until you have fetched and posted the preview URL.**

## Workflow

Every feature follows two feedback loops before merging.

---

### Loop 1 — Feature Testing

1. **New feature request** → create a dedicated branch: `feature/<short-description>`
2. Implement the feature, then **commit, push, and open a PR** against `main` — **ALWAYS open the PR immediately after pushing. Never wait to be asked.**
3. Opening the PR automatically triggers a Firebase Hosting preview deploy — post the preview URL in chat
4. Wait for the user to test the preview
5. For each **code change request**:
   - Make the changes on the same branch
   - Commit and push — the preview URL updates automatically
   - Confirm the update in chat
   - Wait for the user to test again
6. Repeat until the user confirms the feature behaviour is acceptable

---

### Loop 2 — Code Review

1. Once the feature is accepted, run `/code-review` on the PR
2. Post findings in chat; the user decides which issues to address
3. For each **correction**:
   - Make the changes, commit, and push
   - Run `/code-review` again
   - Repeat until there are no remaining issues we both agree need fixing
4. Once the review is clean, **merge the PR into `main`**

---

### Branch Naming

`feature/<short-description>` — e.g. `feature/forgot-password`

---

### Commit Style

Use **conventional commits** — the CI auto-bumps the app version based on these prefixes:

| Prefix | When to use | Version bump |
|---|---|---|
| `feat:` | New user-facing feature | minor |
| `fix:` | Bug fix | patch |
| `chore:` | Config, CI, deps, CLAUDE.md | patch |
| `feat!:` | Breaking change | major |

- Subject line 50 chars or fewer (not counting the prefix)
- Body explains *why*, not *what*, when non-obvious
- One commit per logical change

Example: `feat: add forgot password flow` / `fix: restore group order on cancelled drag`

---

### When to Use a PR vs. Push Directly

- **PR** — anything user-facing: features, UI changes, bug fixes the user can see
- **Push directly to `main`** — docs, config, CI tweaks, `CLAUDE.md` updates

---

### General Rules

- Never push user-facing changes directly to `main`
- Never merge without completing both feedback loops
- Keep PRs focused on a single feature
- The preview URL should be confirmed working before starting Loop 2

---

### PR Status Format

When asked for PR status, always display a markdown table with this exact structure:

- Columns: `CI | PR | Date | Description`
- **CI column**: all check run statuses as icons (✅ success, 🔄 in progress) followed by a linked 🔗 emoji to the Firebase preview URL — all in one cell, no header label needed but keep the column
- **PR column**: two lines — `#N PR Title` on line 1, `` `branch-name` `` on line 2 (use `<br>`)
- **Date column**: two lines — opened date/time on line 1, last updated date/time on line 2 (use `<br>`); 12-hour AM/PM format, e.g. `2026-06-11 10:56 PM`
- **Description column**: concise one-liner, no forced line breaks

Example row:
| ✅✅[🔗](https://preview-url) | #3 Fix forgot password for Google accounts<br>`feature/forgot-password` | 2026-06-11 10:56 PM<br>2026-06-11 11:40 PM | Calls `sendPasswordResetEmail` directly; updates success message for Google accounts |

---

## Live Tracking Feature Plan

Five features that turn the picks app into a live World Cup tracker. Build them **in order** — each branch is listed below and each feature depends on the one before it being merged to `main` first.

### Dependency chain

```
1. feature/live-match-engine   ← build first; all others depend on it
2. feature/auto-scoring-engine ← depends on Firestore docs written by #1
3. feature/group-tracker       ← depends on Firestore docs written by #1
4. feature/prop-tracker        ← depends on Firestore docs written by #1
5. feature/event-ticker        ← depends on Firestore docs written by #1
```

Before starting any branch other than #1, confirm that `feature/live-match-engine` has been merged to `main` and rebase your branch onto the updated `main`.

---

### ESPN API endpoints in use

League slug: `fifa.world`
Base: `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/`

| Endpoint | Used by |
|---|---|
| `GET /scoreboard` | Feature 1 — polled every 60s during match windows |
| `GET /scoreboard?dates=YYYYMMDD` | Feature 1 — next-day prefetch |
| `GET /teams` | Feature 1 setup — maps team names to ESPN IDs |
| `GET /teams/{id}/roster` | Feature 4 — player stats attribution |
| `GET /summary?event={eventId}` | Features 1, 2, 3, 4 — full match detail |

**Important:** No client-side ESPN calls. All fetching happens in Cloud Functions. Clients read exclusively from Firestore via `onSnapshot`.

Key field: `events[].status.type.state` → `"pre"` / `"in"` / `"post"` — use this to decide when to poll and when to fetch summary.

---

### Firestore collections written by these features

Live scoreboard and prop aggregates live under `liveData` (single docs, cheap to read). `matches/{eventId}` and `groups/{letter}` are separate top-level collections — Firestore document paths must have an even number of segments, so `liveData/matches/{eventId}` (3 segments) is not addressable as a document; nesting per-match/per-group docs under `liveData` would need an extra fixed path segment, so they get their own top-level collections instead, each with read rules mirroring `liveData`.

```
liveData/scoreboard               written every ~60s by Feature 1 scheduler
  today: string                   YYYYMMDD of last write
  events: EventSummary[]          one per match (see shape below)

matches/{eventId}                 written once per match by Feature 1 trigger
  eventId: string
  fetchedAt: Timestamp
  header: object                  from ESPN summary.header
  competitors: Competitor[]       both teams with final scores
  scoringPlays: ScoringPlay[]     goals with scorer, minute, running score
  rosters: { teamId, players: RosterEntry[] }[]     lineup for both teams (starter + subs)
  teamStats: { teamId, stats: TeamStat[] }[]        possession, shots, passes, etc.
  groupStandings: StandingEntry[] group table at time of match
  status: { state, description }  "pre" | "in" | "post"

groups/{letter}                   written after each match completion by Feature 1
  letter: string                  "A" through "L"
  updatedAt: Timestamp
  entries: StandingEntry[]        sorted by points desc
    team: { id, name, abbreviation, logo }
    gamesPlayed, wins, losses, ties, goalsFor, goalsAgainst, goalDiff, points: number

liveData/props                    written after each match completion by Feature 4
  updatedAt: Timestamp
  goldenBoot: PlayerStat[]        { playerId, name, team, goals } sorted desc
  goldenGlove: PlayerStat[]       { playerId, name, team, saves, cleanSheets }
  youngPlayer: PlayerStat[]       { playerId, name, team, dob, goals, assists }
  mostCards: TeamStat[]           { teamId, name, yellowCards, redCards }
  mostGroupGoals: TeamStat[]      { teamId, name, goalsScored }
  cleanSheetGroup: GroupStat[]    { group, cleanSheets }
```

`EventSummary` shape inside `liveData/scoreboard.events[]`:

```
id, date, name, shortName,
status: { state, displayClock, period, description, detail },
competitors: [{ teamId, name, abbreviation, logo, score, homeAway }],
venue: { fullName, city, country },
group: string   e.g. "Group A"
```

---

### Feature 1 — Live Match Engine (`feature/live-match-engine`)

**What to build:**
- Cloud Scheduled Function `espnScoreboardPoller` — runs every 60s during match hours (14:00–23:00 UTC on match days). Fetches ESPN `/scoreboard`, normalises the response, writes to `liveData/scoreboard`.
- Cloud Firestore Trigger `onScoreboardWrite` — on each scoreboard write, for any match that flipped to `state: "in"` or `"post"` since the previous write, fetch ESPN `/summary?event={id}` and write to `matches/{eventId}`. Also update `groups/{letter}` from the standings block in the summary.
- Vue component `<LiveScoreboard>` — subscribes to `liveData/scoreboard` via `onSnapshot`. Renders a card grid of today's matches: team crests, score, live clock or kickoff time, status badge. Stateless/dumb — all data flows in as props from the parent that owns the listener.
- Wire `<LiveScoreboard>` into `DashboardView` above the leaderboard.

**Cloud Functions location:** `firebase/functions/` — init with `firebase init functions` using JavaScript if the directory doesn't exist yet.

**Scheduling note:** Use Firebase `pubsub.schedule` with `timeZone: "UTC"`. Only poll when there are matches — check `liveData/scoreboard.today` to skip unnecessary ESPN calls on off-days.

---

### Feature 2 — Auto-Scoring Engine (`feature/auto-scoring-engine`)

**What to build:**
- Cloud Firestore Trigger `onMatchComplete` — triggers on `matches/{eventId}` writes where `status.state === "post"`. Reads the match result, resolves which group and finishing positions it implies, then reads all `submissions/{uid}` documents and awards group-prediction points into `scores/{uid}.breakdown.groups`.
- Scoring logic lives in a shared `lib/scoring.js` module so it can be unit tested independently.
- No new Vue components needed — the existing leaderboard in `DashboardView` already listens to `scores/*` via `onSnapshot` and will animate score changes automatically.

**Before implementing:** confirm the exact points table with the user (points for exact position match, partial credit for correct top-2 etc.) — do not guess.

---

### Feature 3 — Group Tracker (`feature/group-tracker`)

**What to build:**
- Vue component `<GroupAccuracy>` — pure display, no data fetching. Props: `{ group: string, predicted: string[], actual: StandingEntry[] }`. Renders a 4-row table comparing predicted vs actual position for each team. Each row shows team name/crest, predicted rank, actual rank, and a delta indicator (↑2 / ↓1 / =) colour-coded green/amber/red.
- In `DashboardView`, subscribe to `groups/*` (one listener per group or a collectionGroup query). Pass each group's data alongside the user's `submission.groups[letter]` into `<GroupAccuracy>`.
- Replace or augment the existing static group summary in the My Picks section of `DashboardView`.

---

### Feature 4 — Prop Tracker (`feature/prop-tracker`)

**What to build:**
- Cloud Firestore Trigger `onMatchCompleteProps` — after each match completes, aggregates player and team stats across all `matches/*` documents and writes the result to `liveData/props` (single document, one listener for all users).
- Vue component `<PropTracker>` — subscribes to `liveData/props` once. For each of the user's 10 prop answers, looks up the player/team in the relevant category and renders: pick name, current stat (e.g. "3 goals"), current rank (e.g. "2nd of 47"), leading/trailing badge.
- Replace the static props summary in the My Picks section of `DashboardView` with `<PropTracker>`.

**Prop key → liveData/props field mapping:**

```
goldenBoot       → liveData/props.goldenBoot       (player pick)
goldenGlove      → liveData/props.goldenGlove       (player pick)
youngPlayer      → liveData/props.youngPlayer       (player pick)
mostCards        → liveData/props.mostCards         (team pick)
mostGroupGoals   → liveData/props.mostGroupGoals    (team pick)
cleanSheetGroup  → liveData/props.cleanSheetGroup   (group pick)
```

Check `app/src/data.js` PROPS array for the exact keys used in submissions.

---

### Feature 5 — In-App Event Ticker (`feature/event-ticker`)

**What to build:**
- Vue component `<EventTicker>` — reads `liveData/scoreboard` (reuse the same snapshot the parent already subscribes to) and pulls scoring plays from any `state: "in"` match's `matches/{id}` doc. Renders a horizontally scrolling strip of recent goal events: `⚽ Pulisic 78' — USA 1–0 Iran`. Events that match the current user's prop picks are highlighted gold.
- Toast notification system — when the `liveData/scoreboard` listener detects a score change between two snapshots (previous score vs new score), fire a 5-second overlay toast at the top of the screen. No Service Worker, no FCM, no permission prompt required.
- Mount `<EventTicker>` at the top of `DashboardView` below the header. Mount the toast system at the app root in `App.vue` so it persists across route changes.

**No Cloud Functions needed** — all logic is client-side diffing of Firestore `onSnapshot` payloads.

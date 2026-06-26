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

## Vue `<script setup>` Declaration Order

`<script setup>` runs top-to-bottom as plain module code — `const`/`let` bindings are **not** hoisted the way `function` declarations are. Anything that runs eagerly during setup (an `immediate: true` watcher, a top-level function call, a computed evaluated synchronously) can hit a variable declared further down the file before it's initialized, throwing `ReferenceError: can't access lexical declaration 'X' before initialization` (minified in prod as a single letter, e.g. `'L'`) — exactly what happened in `AdminView.vue` when `loadFromConfig` (invoked by an immediate `watch`) called `rebuildCategoryLists()`, which referenced `categoryLists` and `activeProps`, both declared later in the file.

**Rule:** any `const`/`computed`/`reactive` that is read inside a function called during eager/immediate setup execution (immediate watchers, top-level calls, anything invoked before the component mounts) must be declared **above** that function and above the call site that triggers it. When adding a function to an existing eager call chain (e.g. a function called from `loadFromConfig`, or from any `watch(..., { immediate: true })` callback), trace every variable it reads and confirm each is already initialized at that point in file order — don't assume "it's used by reference, order doesn't matter," since `const` TDZ makes order matter for the *first* synchronous run.

When this error is reported (even just "ReferenceError ... before initialization" with a minified single-letter name), the fix is always: find the eager call chain, find what variable it touches that's declared later in the file, and move that declaration above the chain's entry point — not a workaround like `let` instead of `const`, or wrapping in `setTimeout`.

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
| `GET /scoreboard` | Feature 1 — fetched by the self-gating poller (see below), not a fixed window |
| `GET /teams` | Feature 1 setup — maps team names to ESPN IDs |
| `GET /teams/{id}/roster` | Feature 4 — player stats attribution |
| `GET /summary?event={eventId}` | Features 1, 2, 3, 4 — full match detail |

**Important:** No client-side ESPN calls. All fetching happens in Cloud Functions. Clients read exclusively from Firestore via `onSnapshot`.

Key field: `events[].status.type.state` → `"pre"` / `"in"` / `"post"` — use this to decide when to poll and when to fetch summary.

---

### Firestore collections written by these features

All live data lives under a single `liveData` collection to keep read costs minimal.

```
liveData/scoreboard               written by Feature 1's self-gating poller (see below)
  today: string                   YYYYMMDD of last write
  events: EventSummary[]          one per match (see shape below)
  scheduleDate: string             YYYYMMDD the cached kickoffs[] belongs to
  kickoffs: { eventId, date, state }[]  per-match kickoff cache, used to decide when to wake
  state: "idle" | "polling"        "polling" = at least one match is "in" as of the last fetch

liveData/matches/{eventId}        written once per match by Feature 1 trigger
  eventId: string
  fetchedAt: Timestamp
  header: object                  from ESPN summary.header
  competitors: Competitor[]       both teams with final scores
  scoringPlays: ScoringPlay[]     goals with scorer, minute, running score
  rosters: RosterEntry[][]        lineup for both teams (starter + subs)
  teamStats: TeamStat[][]         possession, shots, passes, etc.
  groupStandings: StandingEntry[] group table at time of match
  status: { state, description }  "pre" | "in" | "post"

liveData/groups/{letter}          written after each match completion by Feature 1
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
- Cloud Scheduled Function `espnPoller` — runs every minute, all day, every day. Each tick is a single cheap Firestore read that decides whether an ESPN call is actually warranted this minute (see gating logic below); most ticks short-circuit with no ESPN call. When it does fetch, it normalises the response and writes to `liveData/scoreboard`.
- Cloud Firestore Trigger `onScoreboardWrite` — on each scoreboard write, for any match that flipped to `state: "in"` or `"post"` since the previous write, fetch ESPN `/summary?event={id}` and write to `liveData/matches/{eventId}`. Also update `liveData/groups/{letter}` from the standings block in the summary.
- Vue component `<LiveScoreboard>` — subscribes to `liveData/scoreboard` via `onSnapshot`. Renders a card grid of today's matches: team crests, score, live clock or kickoff time, status badge. Stateless/dumb — all data flows in as props from the parent that owns the listener.
- Wire `<LiveScoreboard>` into `LiveView` (the actual "Live" tab — `DashboardView` is dead code, not in the router).

**Cloud Functions location:** `firebase/functions/` — init with `firebase init functions` using JavaScript if the directory doesn't exist yet.

**Polling strategy — goal: exactly one active polling chain runs while matches are ongoing, woken by kickoff time, asleep otherwise.** No fixed match-hours window, no client-driven fetching. `liveData/scoreboard` carries `scheduleDate`, `kickoffs[]` (cached per-match kickoff times + last-known state), and `state: "idle" | "polling"`. Each minute's tick fetches ESPN only if:
  1. `state === "polling"` — a chain is already live; its regular tick already covers every match for the day at once, so a second match kicking off mid-chain does **not** trigger an extra fetch — the active chain picks it up on its next tick.
  2. the cached `scheduleDate` isn't today — fetch once to learn today's kickoff times (also catches a cold-start mid-day where a match is already "in").
  3. a cached kickoff time has passed and that match isn't `"post"` yet — this is the "first fetch at kickoff" trigger; if the real kickoff is delayed, it just checks again next minute until the state actually flips.
  After any fetch, recompute `state`: `"polling"` if any event is `"in"`, else `"idle"` — so the chain stops itself the instant the last match of the day finishes, rather than running until a fixed end-of-window time.

---

### Feature 2 — Auto-Scoring Engine (`feature/auto-scoring-engine`)

**What to build:**
- Cloud Firestore Trigger `onMatchComplete` — triggers on `liveData/matches/{eventId}` writes where `status.state === "post"`. Reads the match result, resolves which group and finishing positions it implies, then reads all `submissions/{uid}` documents and awards group-prediction points into `scores/{uid}.breakdown.groups`.
- Scoring logic lives in a shared `lib/scoring.js` module so it can be unit tested independently.
- No new Vue components needed — the existing leaderboard in `DashboardView` already listens to `scores/*` via `onSnapshot` and will animate score changes automatically.

**Before implementing:** confirm the exact points table with the user (points for exact position match, partial credit for correct top-2 etc.) — do not guess.

---

### Feature 3 — Group Tracker (`feature/group-tracker`)

**What to build:**
- Vue component `<GroupAccuracy>` — pure display, no data fetching. Props: `{ group: string, predicted: string[], actual: StandingEntry[] }`. Renders a 4-row table comparing predicted vs actual position for each team. Each row shows team name/crest, predicted rank, actual rank, and a delta indicator (↑2 / ↓1 / =) colour-coded green/amber/red.
- In `DashboardView`, subscribe to `liveData/groups/*` (one listener per group or a collectionGroup query). Pass each group's data alongside the user's `submission.groups[letter]` into `<GroupAccuracy>`.
- Replace or augment the existing static group summary in the My Picks section of `DashboardView`.

---

### Feature 4 — Prop Tracker (`feature/prop-tracker`)

**What to build:**
- Cloud Firestore Trigger `onMatchCompleteProps` — after each match completes, aggregates player and team stats across all `liveData/matches/*` documents and writes the result to `liveData/props` (single document, one listener for all users).
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
- Vue component `<EventTicker>` — reads `liveData/scoreboard` (reuse the same snapshot the parent already subscribes to) and pulls scoring plays from any `state: "in"` match's `liveData/matches/{id}` doc. Renders a horizontally scrolling strip of recent goal events: `⚽ Pulisic 78' — USA 1–0 Iran`. Events that match the current user's prop picks are highlighted gold.
- Toast notification system — when the `liveData/scoreboard` listener detects a score change between two snapshots (previous score vs new score), fire a 5-second overlay toast at the top of the screen. No Service Worker, no FCM, no permission prompt required.
- Mount `<EventTicker>` at the top of `DashboardView` below the header. Mount the toast system at the app root in `App.vue` so it persists across route changes.

**No Cloud Functions needed** — all logic is client-side diffing of Firestore `onSnapshot` payloads.

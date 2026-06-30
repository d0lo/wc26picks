# WC26 Picks — Development Process

> [!IMPORTANT]
> **After every PR is opened, you MUST immediately post the Firebase preview URL in chat. No exceptions. Do not move on until you have fetched and posted the preview URL.**

## Workflow

Every feature follows two feedback loops before merging.

---

### Branch Strategy

`dev` is the long-lived working branch — all features and `main` itself, the
live/deployed branch, only moves forward when `dev` is merged into it.

```
main ← (merge dev → main when given the go-ahead — deploys the live site)
dev  ← (merge each feature PR here after Loop 2)
dev  ← feature/<short-description>  (one branch per feature, PR'd back into dev)
```

There is a standing, never-closed PR from `dev` → `main`. Opening it (once)
triggers a preview deploy and PR comment for `dev` itself — leave that comment
as the running reference for what's currently staged. Don't re-announce it on
every feature merge into `dev`; it auto-updates in place as `dev` moves.

---

### Loop 1 — Feature Testing

1. **New feature request** → create a dedicated branch off `dev`: `feature/<short-description>`
2. Implement the feature, then **commit, push, and open a PR** against `dev` — **ALWAYS open the PR immediately after pushing. Never wait to be asked.**
3. Opening the PR automatically triggers its own Firebase Hosting preview deploy — post the preview URL in chat
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
4. Once the review is clean, **merge the PR into `dev`**
5. If the standing `dev` → `main` PR hasn't had its preview deploy/comment yet, that's the only time to check for and post it — otherwise it's already posted and just updates automatically
6. **Merging `dev` into `main`** (deploying live) only happens when the user explicitly gives the go-ahead — never as an automatic next step after a feature merges into `dev`

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
- **Push directly to `dev`** — docs, config, CI tweaks, `CLAUDE.md` updates that aren't tied to a specific feature PR

---

### General Rules

- Never push user-facing changes directly to `dev` or `main`
- Never merge without completing both feedback loops
- Keep PRs focused on a single feature
- The preview URL should be confirmed working before starting Loop 2
- Never merge `dev` into `main` without the user explicitly saying so

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

## Scoring Configuration

All point values (group-position predictions, the perfect-group bonus, wildcard picks, and every prop in `app/src/data.js` PROPS) are configurable at runtime via Firestore, not hardcoded — this is so values can be retuned without a code deploy, and so a future admin screen has a single doc to write to.

```
config/public
  picksLockAt: Timestamp                                       // group-stage picks lock
  knockoutLockAt: Timestamp                                    // knockout bracket lock (independent)
  scoring: {
    groupExact: { 1: number, 2: number, 3: number, 4: number }  // pts per exact predicted position
    perfectGroupBonus: number                                   // bonus when all 4 positions are exact
    wildcard: number                                            // pts per correct 3rd-place-advances pick
    knockout: { r32, r16, qf, sf, final: number }               // pts per correct knockout-round winner
    props: { [propKey]: number }                                // pts per prop, keyed by PROPS[].key
  }
```

Rules: `config/{docId}` is `allow read: if true; allow write: if false` — public read, write only via the Admin SDK (no client or Cloud Function writes it yet; seeded manually until an admin screen exists).

- Client reads it once via `configQueryOptions()` in `app/src/queries.js` (TanStack Query, cached) and merges `scoring.props[key]` onto each `PROPS` entry for display (see `PicksView.vue`, `PicksSummary.vue`). `PROPS` itself carries no `points` field — that's the whole point of moving it to config.
- Seed/update the doc with `scripts/seed-scoring-config.mjs` (same `GOOGLE_APPLICATION_CREDENTIALS` pattern as `scripts/seed.mjs`).
- Any future Cloud Function that computes scores (Feature 2 below) must read point values from `config/public.scoring`, not hardcode them — that's the reason this config exists.

---

## Live Tracking Feature Plan

Six features that turn the picks app into a live World Cup tracker. Build them **in order** — each branch is listed below and each feature depends on the one before it being merged to `main` first.

### Dependency chain

```
1. feature/live-match-engine        ← build first; all others depend on it
2. feature/auto-scoring-engine      ← depends on Firestore docs written by #1
3. feature/group-tracker            ← depends on Firestore docs written by #1
4. feature/prop-tracker             ← depends on Firestore docs written by #1
5. feature/event-ticker             ← depends on Firestore docs written by #1
6. feature/live-results-projection  ← depends on Firestore docs written by #1; client-only
```

Before starting any branch other than #1, confirm that `feature/live-match-engine` has been merged to `main` and rebase your branch onto the updated `main`.

---

### ESPN API endpoints in use

League slug: `fifa.world`
Base: `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/`

| Endpoint | Used by |
|---|---|
| `GET /scoreboard` | Feature 1 — fetched by the self-gating poller (see below), not a fixed window |
| `GET /teams` | Feature 1 setup — used once to hand-generate the ESPN-ID → team-UUID map committed in `firebase/functions/lib/teams.js` (`ESPN_TEAM`); not called at runtime |
| `GET /teams/{id}/roster` | Feature 4 — player stats attribution |
| `GET /summary?event={eventId}` | Features 1, 2, 3, 4 — full match detail |

**Important:** No client-side ESPN calls. All fetching happens in Cloud Functions. Clients read exclusively from Firestore via `onSnapshot`.

Key field: `events[].status.type.state` → `"pre"` / `"in"` / `"post"` — use this to decide when to poll and when to fetch summary.

---

### Firestore collections written by these features

Live scoreboard and prop aggregates live under `liveData` (single docs, cheap to read). `matches/{eventId}` and `groups/{letter}` are separate top-level collections — Firestore document paths must have an even number of segments, so `liveData/matches/{eventId}` (3 segments) is not addressable as a document; nesting per-match/per-group docs under `liveData` would need an extra fixed path segment, so they get their own top-level collections instead, each with read rules mirroring `liveData`.

```
liveData/scoreboard               written by Feature 1's self-gating poller (see below)
  today: string                   YYYYMMDD of last write
  events: EventSummary[]          one per match (see shape below)
  scheduleDate: string            YYYYMMDD the cached kickoffs[] belongs to
  kickoffs: { eventId, date, state }[]  per-match kickoff cache, used to decide when to wake
  state: "idle" | "polling"       "polling" = at least one match is "in" as of the last fetch

matches/{eventId}                 written once per match by Feature 1 trigger
  eventId: string
  fetchedAt: Timestamp
  header: object                  from ESPN summary.header
  competitors: Competitor[]       both teams with final scores
  scoringPlays: ScoringPlay[]     goals with scorer, assist, minute, running score, and
                                  normalized goal/field coordinates ({x,y}, 0–1)
  cards: { teamId, player, type: "yellow"|"red", minute, period }[]   booking events
  substitutions: { teamId, players: string[], minute, period, text }[] sub events
  scoreFacts: { scoreAt70: [n,n], regulationFinal: [n,n],          regulation-only score
                was1_0at70: bool, finishedRegAt1_1: bool }          splits (aligned to competitors[])
  rosters: { teamId, players: RosterEntry[] }[]     lineup for both teams (starter + subs);
                                  each player carries stats: { [espnStatName]: number }
                                  (goalAssists, saves, goalsConceded, totalGoals, yellowCards, …)
  teamStats: { teamId, stats: TeamStat[] }[]        possession, shots, passes, etc.
  groupStandings: StandingEntry[] group table at time of match
  status: { state, description }  "pre" | "in" | "post"

groups/{letter}                   written after each match completion by Feature 1
  letter: string                  "A" through "L"
  updatedAt: Timestamp
  entries: StandingEntry[]        sorted by points desc
    team: { id, name, abbreviation, logo }
    gamesPlayed, wins, losses, ties, goalsFor, goalsAgainst, goalDiff, points: number
  complete: boolean                written by Feature 2's onMatchComplete once all 6 of this
                                    group's matches are "post" per our own match-status
                                    records — internal/operational signal only, not yet
                                    surfaced in the UI

liveData/wildcards                written by Feature 2's onGroupsWrite
  advancingLetters: string[]      canonical top-8 third-place ranking (sorted), recomputed
                                    fresh from `groups` on every group-stage match completion;
                                    the sole source other triggers read this ranking from

liveData/props                    written after each match completion by Feature 4
  updatedAt: Timestamp
  goldenBoot: PlayerStat[]        { playerId, name, team, goals } sorted desc
  goldenGlove: PlayerStat[]       { playerId, name, team, saves, cleanSheets }
  youngPlayer: PlayerStat[]       { playerId, name, team, dob, goals, assists }
  mostCards: TeamStat[]           { teamId, name, yellowCards, redCards }
  mostGroupGoals: TeamStat[]      { teamId, name, goalsScored }  // goals across the WHOLE tournament — key name predates the group→tournament rename; do NOT filter to group-stage matches
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

### Feature 1 — Live Match Engine (`feature/live-match-engine`) — ✅ built

**What's built:**
- Cloud Scheduled Function `espnPoller` (`firebase/functions/index.js`) — runs every minute, all day, every day (`schedule: '* * * * *'`). Each tick is a single cheap Firestore read of `liveData/scoreboard` that decides via `shouldFetch()` whether an ESPN call is actually warranted this minute; most ticks short-circuit with no ESPN call. Fetches happen when: a chain is already `"polling"` (covers every match for the day on one tick, so a second kickoff mid-chain doesn't trigger an extra fetch); the cached `scheduleDate` isn't today; or a cached kickoff time has passed and that match isn't `"post"` yet. After a fetch, `state` is recomputed to `"polling"` if any event is `"in"`, else `"idle"` — so the chain puts itself back to sleep the instant the last match of the day finishes. No fixed match-hours window.
- Cloud Firestore Trigger `onScoreboardWrite` — on each scoreboard write, for any match that flipped to `state: "in"` or `"post"` since the previous write, fetches ESPN `/summary?event={id}` (`processMatchUpdate()`) and writes to `matches/{eventId}`. Also updates `groups/{letter}` from the standings block in the summary.
- Vue component `<LiveScoreboard>` — subscribes to `liveData/scoreboard` via `onSnapshot` (owned by the parent, not the component itself). Renders a card grid of today's matches: team crests, score, live clock or kickoff time, status badge.
- Wired into `LiveView` (the routed `/live` tab) — `LiveView` owns the `onSnapshot` listener and passes `events`/`hasMatches` down as props.

**Cloud Functions location:** `firebase/functions/` (JavaScript, ESM). `ESPN_TEAM` in `lib/teams.js` is a hand-generated ESPN-numeric-ID → team-UUID map, duplicated from `app/src/data.js` `TEAM_ID` rather than imported, since Firebase only deploys the `functions/` directory and a relative import reaching into `app/src` would resolve locally but break at deploy time.

---

### Feature 2 — Auto-Scoring Engine (`feature/auto-scoring-engine`)

**What's built:** single-owner-per-field triggers — no field is ever computed by more than one trigger, which is what removes the dual-writer race that an earlier version of this engine had between match completion and wildcard ranking.

- Cloud Firestore Trigger `onMatchComplete` (`matches/{eventId}`) — triggers on writes where `status.state === "post"`. Sole owner of `breakdown.groups[letter]`: recomputes that one group's score fresh from the **current** `groups/{letter}` standings (live/incremental — never gated on the group being fully finished) and overwrites `scores/{uid}.breakdown.groups[letter]` for every `picks/{uid}` document — a full idempotent overwrite, not additive, since the final two matches in a group always kick off together and finish moments apart, firing this trigger twice in quick succession for the same group. Also marks `groups/{letter}.complete = true` (only on the false→true transition) once all 6 of that group's matches are `"post"` per our own match-status records — a structural signal derived from data we authoritatively own, not ESPN's secondary `gamesPlayed` standings stat.
- Cloud Firestore Trigger `onGroupsWrite` (`groups/{letter}`) — fires after every group-stage match completion (since `onMatchComplete`/`processMatchUpdate` always writes `groups/{letter}` alongside `matches/{eventId}`). Sole owner of `breakdown.wildcards`: recomputes the top-8 third-place ranking fresh from all 12 groups on every fire (so a result swing in one group can still bump a different group's third-place team in or out of the advancing set), compares it to the previously-stored canonical `liveData/wildcards.advancingLetters`, and only loops over every pick to rewrite `breakdown.wildcards` when that comparison shows the set actually changed — an unchanged ranking provably can't change any pick's score, so the rescore is skipped, not just the ranking.
- Cloud Firestore Trigger `onScoringConfigWrite` (`config/public`) — fires when `scoring` values are retuned live. Does a full per-pick rescore of both `groups` and `wildcards` (a value change invalidates every previously-computed score, not just one group's), reading the advancing set from `liveData/wildcards` rather than recomputing it — one computation owner for the ranking across the whole engine.
- Reads point values from `config/public.scoring` (see Scoring Configuration above) — `groupExact` for exact-position points, `perfectGroupBonus` for the all-4-correct bonus, `wildcard` for 3rd-place-advances picks. Never hardcode these.
- Scoring logic lives in a shared, Firestore-free `lib/scoring.js` module so it can be unit tested independently; tournament-format structural helpers (`isGroupComplete`, `isGroupStageComplete`) live in `lib/tournament.js`; the shared `scores/{uid}` read-merge-write-transaction logic all three triggers use lives in `lib/firestoreScoring.js` (`applyBreakdownPatch`).
- `scripts/backfill-match-group-letters.mjs` — idempotent one-time repair for any `matches/{eventId}` doc written before `groupLetter` was tracked; run once if production has pre-existing match data predating it.
- No new Vue components needed — the existing leaderboard in `LeaderboardView.vue` already listens to `scores/*` via `onSnapshot` and will animate score changes automatically.

---

### Feature 3 — Group Tracker (`feature/group-tracker`)

**What to build:**
- Vue component `<GroupAccuracy>` — pure display, no data fetching. Props: `{ group: string, predicted: string[], actual: StandingEntry[] }`. Renders a 4-row table comparing predicted vs actual position for each team. Each row shows team name/crest, predicted rank, actual rank, and a delta indicator (↑2 / ↓1 / =) colour-coded green/amber/red.
- In `LeaderboardView.vue`, subscribe to `groups/*` (one listener per group or a collectionGroup query). Pass each group's data alongside the user's `submission.groups[letter]` into `<GroupAccuracy>`.
- Replace or augment `<PicksSummary>`'s static group standings in the My Picks section of `LeaderboardView.vue`.

---

### Feature 4 — Prop Tracker (`feature/prop-tracker`)

**What to build:**
- Cloud Firestore Trigger `onMatchCompleteProps` — after each match completes, aggregates player and team stats across all `matches/*` documents and writes the result to `liveData/props` (single document, one listener for all users).
- Vue component `<PropTracker>` — subscribes to `liveData/props` once. For each of the user's 10 prop answers, looks up the player/team in the relevant category and renders: pick name, current stat (e.g. "3 goals"), current rank (e.g. "2nd of 47"), leading/trailing badge.
- Replace `<PicksSummary>`'s static props summary in the My Picks section of `LeaderboardView.vue` with `<PropTracker>`.

**Prop key → liveData/props field mapping:**

```
goldenBoot       → liveData/props.goldenBoot       (player pick)
goldenGlove      → liveData/props.goldenGlove       (player pick)
youngPlayer      → liveData/props.youngPlayer       (player pick)
mostCards        → liveData/props.mostCards         (team pick)
mostGroupGoals   → liveData/props.mostGroupGoals    (team pick — "Most Goals in Tournament"; counts all matches, not just group stage)
cleanSheetGroup  → liveData/props.cleanSheetGroup   (group pick)
```

Check `app/src/data.js` PROPS array for the exact keys used in submissions.

---

### Feature 5 — In-App Event Ticker (`feature/event-ticker`)

**What to build:**
- Vue component `<EventTicker>` — reads `liveData/scoreboard` (reuse the same snapshot the parent already subscribes to) and pulls scoring plays from any `state: "in"` match's `matches/{id}` doc. Renders a horizontally scrolling strip of recent goal events: `⚽ Pulisic 78' — USA 1–0 Iran`. Events that match the current user's prop picks are highlighted gold.
- Toast notification system — when the `liveData/scoreboard` listener detects a score change between two snapshots (previous score vs new score), fire a 5-second overlay toast at the top of the screen. No Service Worker, no FCM, no permission prompt required.
- Mount `<EventTicker>` at the top of `LiveView.vue`, above `<LiveScoreboard>`. Mount the toast system at the app root in `App.vue` so it persists across route changes.

**No Cloud Functions needed** — all logic is client-side diffing of Firestore `onSnapshot` payloads.

---

### Feature 6 — Live Results Projection / "If Results Stand" (`feature/live-results-projection`) — 📋 scoped, not built

**Problem:** `groups/{letter}` (and everything derived from it — `liveData/wildcards.advancingLetters`, `scores/{uid}.breakdown`) is only written by `processMatchUpdate` at the two match state-flip events (`pre→in`, `in→post`). During the 90 minutes a match is actually live, none of those documents change — only `liveData/scoreboard.events[].competitors[].score` does, via the per-minute `espnPoller`. So there's currently no way to show "here's how the group/wildcards/my score would look if the live match(es) ended right now" — the data simply isn't computed anywhere, client or server.

**Key insight that shrinks this feature:** the client already receives everything needed to compute that projection itself, with zero new backend work:
- The authoritative *pre-match* baseline for every team in a group — `groups/{letter}.entries`, last written at kickoff (`pre→in`), i.e. before the live match's result counts.
- The live match's *current* score — already streaming via the existing `liveData/scoreboard` `onSnapshot` listener.

So "if results stand" is a pure client-side projection: baseline standings (minus the in-progress matches) + the current score of each `state: "in"` match treated as a hypothetical final result, recomputed with the same points/GD/GF comparator the backend uses. No new Cloud Function, no new Firestore writes, no extra ESPN calls — purely new frontend math layered on data already in the client.

**What to build:**
- `app/src/lib/projection.js` — pure functions, no Firestore/network access (mirrors how `lib/propLeaders.js` and the backend's `lib/scoring.js`/`lib/tournament.js` are kept Firestore-free for testability):
  - `projectGroupStandings(letter, baselineEntries, liveMatchesForGroup)` — for each `state: "in"` match belonging to the group, derive a hypothetical W/D/L from `competitors[].score`, fold it into `baselineEntries`' points/GF/GA/GD, then re-sort with the **same tie-break order** the backend's standings use (points → GD → GF — confirm exact order against what ESPN's `groupStandings` block actually applies, since drifting from it would make the projection silently wrong even though it looks plausible).
  - `projectAdvancingLetters(allGroupsProjectedOrBaseline)` — same shape as `advancingThirdPlaceLetters` in `lib/scoring.js`, but fed each group's *projected* 3rd-place entry where a live match exists in that group, baseline otherwise. Must handle the case where two groups both have simultaneous live matches affecting different 3rd-place teams at once (common on a final group-stage matchday with 3 kickoffs at once).
  - Must NOT touch any authoritative `groups/{letter}`, `liveData/wildcards`, or `scores/{uid}` document — this is render-time-only derived state, recomputed on every relevant `onSnapshot` tick, never persisted.
- Reuse, don't fork: feed the projected standings/advancing-set into the *existing* `pickStatus()` / `wildcardStatus()` / `groupPointsEarned()` logic in `PicksSummary.vue` (and the static board in `GroupStandingsBoard.vue`) by giving them a projected data source instead of (or alongside) the authoritative one — avoids a second parallel correctness-styling implementation.
- UI: a clearly-labeled "Projected — if current results hold" toggle/badge wherever projected data is shown, visually distinct from official standings (e.g. dashed border, amber badge instead of emerald/red) — critical so a user can't mistake a hypothetical in-progress projection for a final, scored result. Only render the toggle at all when at least one group has a live (`state: "in"`) match; otherwise projected === authoritative and there's nothing to show.
- Tie-break parity risk: ESPN's returned `groupStandings` may apply tie-break rules beyond points/GD/GF (head-to-head, fair-play points, lots) that aren't worth reimplementing exactly. Scope this feature to the common case (clear points/GD/GF separation) and explicitly fall back to "can't project a tie-break-dependent ordering" (reuse the existing `pending`/non-computable styling convention) rather than guessing at a tie-break the backend itself doesn't replicate.

**Explicitly out of scope for this feature:** any change to the authoritative scoring engine (Feature 2) or its trigger cadence — this is additive, display-only, and must not alter `scores/{uid}.breakdown`, `groups/{letter}`, or `liveData/wildcards` in any way.

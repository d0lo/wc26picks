<script setup>
import { reactive, ref, computed, inject, watch, onMounted, onUnmounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { TEAM_BY_ID, FIFA_RANKING } from '../data.js'
import { ROUNDS, ROUND_LABELS, ROUND_SIZE, ROUND_POINTS, PREV_ROUND, ADJACENCY, R32_SLOTS, MATCH_SCHEDULE, EVENT_SLOT_MAP, SLOT_MATCH_NUM, deriveRoundMatchups, isBracketPickComplete, matchWinner } from '../bracket.js'
import { pickQueryOptions, matchesQueryOptions, scoreboardQueryOptions, configQueryOptions, startScoreboardListener, stopScoreboardListener, queryKeys } from '../queries.js'
import { mergedState, mergedClock, mergedScore } from '../lib/liveMatch.js'
import { useBracketFocus } from '../composables/useBracketFocus.js'

// City → state/region abbreviation for the static MATCH_SCHEDULE venues
// (which carry only a city string). US host cities → US state abbrev;
// Mexican/Canadian cities → country code. Cities not listed render bare.
const CITY_REGION = {
  Inglewood: 'CA',
  'Santa Clara': 'CA',
  Foxborough: 'MA',
  'East Rutherford': 'NJ',
  Arlington: 'TX',
  Houston: 'TX',
  Atlanta: 'GA',
  Seattle: 'WA',
  Philadelphia: 'PA',
  'Miami Gardens': 'FL',
  'Kansas City': 'MO',
  Monterrey: 'MX',
  'Mexico City': 'MX',
  Toronto: 'ON',
  Vancouver: 'BC',
}

const user = inject('user')
// Bracket edits lock at the knockout deadline (or R32 kickoff); see App.vue.
const knockoutLocked = inject('knockoutLocked')
const knockoutLockTime = inject('knockoutLockTime')
const queryClient = useQueryClient()

// Live scoreboard (today's matches) — overlaid on the bracket so in-progress
// knockout games show their live score and clock, which the matches/{eventId}
// docs (written only at state flips) don't carry mid-match.
const scoreboardQuery = useQuery(scoreboardQueryOptions())
onMounted(() => startScoreboardListener(queryClient))
onUnmounted(() => stopScoreboardListener())

// Per-round knockout point values are config-driven (config/public.scoring.
// knockout), falling back to the ROUND_POINTS defaults until/unless retuned.
const configQuery = useQuery(configQueryOptions())
const knockoutPoints = computed(() => ({ ...ROUND_POINTS, ...(configQuery.data.value?.scoring?.knockout ?? {}) }))

// ESPN-style pager (mobile only): swipe moves exactly one round; the snapped
// round fans in (dense) while rounds to its right fan out over its height.
// Desktop pins focus to Round of 32 → the full conventional fanned bracket.
const { scrollRef, trackRef, focusedIdx, containerHeight, trackStyle } = useBracketFocus(ROUNDS, ROUND_SIZE, { wholePageSwipe: true })

const knockout = reactive(Object.fromEntries(ROUNDS.map(r => [r, Array(ROUND_SIZE[r]).fill(null)])))
const submitting = ref(false)
const submitError = ref('')

const pickQuery = useQuery(computed(() => pickQueryOptions(user.value?.uid)))

// Local (not DB) draft of an in-progress bracket, so a half-filled bracket
// survives navigating/tabbing away before hitting Save. Keyed per user; cleared
// once the bracket is saved or fully reset.
const DRAFT_PREFIX = 'wc26:knockoutDraft:'
function draftKey() { return user.value?.uid ? DRAFT_PREFIX + user.value.uid : null }
function hasAnyPick(obj) { return ROUNDS.some((r) => Array.isArray(obj?.[r]) && obj[r].some(Boolean)) }
function applyKnockout(src) {
  for (const round of ROUNDS) {
    if (Array.isArray(src[round]) && src[round].length === ROUND_SIZE[round]) knockout[round] = [...src[round]]
  }
}
function loadDraft() {
  const key = draftKey()
  if (!key) return null
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}
function saveDraft() {
  const key = draftKey()
  if (!key) return
  const snapshot = Object.fromEntries(ROUNDS.map((r) => [r, [...knockout[r]]]))
  try {
    if (hasAnyPick(snapshot)) localStorage.setItem(key, JSON.stringify(snapshot))
    else localStorage.removeItem(key)
  } catch { /* storage unavailable/full — fall back to in-memory only */ }
}
function clearDraft() {
  const key = draftKey()
  if (key) { try { localStorage.removeItem(key) } catch { /* ignore */ } }
}

watch(pickQuery.isFetched, (fetched) => {
  if (!fetched) return
  if (pickQuery.data.value?.knockout) applyKnockout(pickQuery.data.value.knockout)
  // Overlay any locally-saved in-progress draft (unsaved edits) on top of the
  // saved picks — but not once the bracket is locked, where the official saved
  // state should show.
  // Overlay a locally-saved in-progress draft only when the saved bracket is
  // still incomplete and editable. If the saved bracket is already complete
  // (e.g. finished+saved on another device), a stale draft must NOT override
  // it — drop it instead, so cross-device saves can't be clobbered.
  const dbComplete = isBracketPickComplete(pickQuery.data.value?.knockout)
  const draft = loadDraft()
  if (dbComplete) {
    clearDraft()
  } else if (draft && hasAnyPick(draft) && !knockoutLocked.value) {
    applyKnockout(draft)
  }
}, { immediate: true })

// Each round's matchups are derived live from the previous round's picks
// (not from real results — this is the user's own projected bracket), so
// picking a Round of 32 winner immediately determines who that team would
// face in the Round of 16, and so on up to the Final.
function matchupsFor(round) {
  return round === 'r32' ? R32_SLOTS : deriveRoundMatchups(round, knockout[PREV_ROUND[round]])
}

// Changing an earlier-round pick can invalidate picks made further down the
// bracket (the team picked there no longer appears in that matchup) — walk
// forward clearing only the picks that are now invalid, stopping as soon as
// a round's picks didn't need to change (nothing further downstream could
// be affected either).
function cascadeFrom(round) {
  const startIdx = ROUNDS.indexOf(round)
  for (let i = startIdx + 1; i < ROUNDS.length; i++) {
    const r = ROUNDS[i]
    const matchups = matchupsFor(r)
    let changed = false
    matchups.forEach((pair, slotIdx) => {
      if (knockout[r][slotIdx] && !pair.includes(knockout[r][slotIdx])) {
        knockout[r][slotIdx] = null
        changed = true
      }
    })
    if (!changed) break
  }
}

function pickWinner(round, slotIdx, teamId) {
  if (knockoutLocked.value) return
  knockout[round][slotIdx] = teamId
  cascadeFrom(round)
  saveDraft() // persist the in-progress bracket locally so it survives navigation
}

// Styling for a team row: highlight the picked winner, dim the other team in
// a decided matchup (the chosen "loser") to match the opacity treatment used
// elsewhere (locked group rows, disabled wildcards). Dimming lifts on hover
// while the bracket is still editable so the pick can be changed.
function teamBtnClass(round, slotIdx, teamId) {
  if (!teamId) return 'border-transparent cursor-default'
  const picked = knockout[round][slotIdx]
  if (picked === teamId) {
    return round === 'final'
      ? 'bg-amber-400/10 border-amber-400/60'
      : 'bg-emerald-400/10 border-emerald-400/60'
  }
  if (picked) {
    return knockoutLocked.value
      ? 'border-transparent opacity-40'
      : 'border-transparent opacity-40 hover:opacity-100 hover:border-court-600 cursor-pointer active:scale-[0.98]'
  }
  return knockoutLocked.value
    ? 'border-transparent opacity-60'
    : 'border-transparent hover:border-court-600 cursor-pointer active:scale-[0.98]'
}

const knockoutComplete = computed(() => isBracketPickComplete(knockout))
const pickedCount = computed(() => ROUNDS.reduce((n, r) => n + knockout[r].filter(Boolean).length, 0))
const totalCount = ROUNDS.reduce((n, r) => n + ROUND_SIZE[r], 0)

// The bracket as last saved to the DB (null if none saved yet). isDirty
// compares the in-memory draft against this so the Save button can reflect
// whether there are unsaved changes vs. everything already persisted.
const savedKnockout = computed(() => pickQuery.data.value?.knockout ?? null)
const hasSavedBracket = computed(() => isBracketPickComplete(savedKnockout.value))
const isDirty = computed(() => {
  const saved = savedKnockout.value
  if (!saved) return pickedCount.value > 0
  return ROUNDS.some((r) => {
    const cur = knockout[r]
    const prev = Array.isArray(saved[r]) ? saved[r] : []
    for (let i = 0; i < ROUND_SIZE[r]; i++) {
      if ((cur[i] ?? null) !== (prev[i] ?? null)) return true
    }
    return false
  })
})

const matchQuery = useQuery(matchesQueryOptions())
const matchBySlot = computed(() => {
  const map = new Map()
  for (const m of matchQuery.data.value ?? []) {
    if (m.round && m.slot) map.set(`${m.round}_${m.slot}`, m)
  }
  return map
})

function matchForSlot(round, slotIdx) {
  return matchBySlot.value.get(`${round}_${slotIdx + 1}`) ?? null
}

function matchNum(round, slotIdx) {
  return SLOT_MATCH_NUM[round]?.[slotIdx] ?? null
}

// "Winner of M74" label for a not-yet-decided team slot.
function tbdLabel(round, slotIdx, teamIdx) {
  const prevRound = PREV_ROUND[round]
  if (!prevRound) return 'TBD'
  const adj = ADJACENCY[round]?.[slotIdx]
  if (!adj) return 'TBD'
  const num = SLOT_MATCH_NUM[prevRound]?.[adj[teamIdx] - 1]
  return num ? `Winner of M${num}` : 'TBD'
}

function rankFor(teamId) {
  const name = TEAM_BY_ID[teamId]?.name
  return name ? (FIFA_RANKING[name] ?? null) : null
}

function fmtLockTime(ts) {
  if (!ts) return null
  const d = ts?.toDate?.() ?? new Date(ts)
  const time = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  const isToday = new Date().toDateString() === d.toDateString()
  if (isToday) return `at ${time}`
  const date = d.toLocaleString('en-US', { month: 'short', day: 'numeric' })
  return `on ${date} at ${time}`
}

// Today's live scoreboard event for a slot, mapped via the static event-id
// table. Present (and live) only for matches happening today.
const liveBySlot = computed(() => {
  const map = new Map()
  for (const ev of scoreboardQuery.data.value?.events ?? []) {
    const meta = EVENT_SLOT_MAP[ev.id]
    if (meta) map.set(`${meta.round}_${meta.slot}`, ev)
  }
  return map
})
function liveEvent(round, slotIdx) {
  return liveBySlot.value.get(`${round}_${slotIdx + 1}`) ?? null
}

// State/clock/score merged from the live scoreboard (mid-match) and the
// matches/{eventId} doc (authoritative final) — see lib/liveMatch.js.
function slotState(round, slotIdx) { return mergedState(matchForSlot(round, slotIdx), liveEvent(round, slotIdx)) }
function slotClock(round, slotIdx) { return mergedClock(matchForSlot(round, slotIdx), liveEvent(round, slotIdx)) }
function slotScore(round, slotIdx, teamId) { return mergedScore(matchForSlot(round, slotIdx), liveEvent(round, slotIdx), teamId) }

// Location string for a slot — prefers the live ESPN doc's venue address
// (city + state/region when present) and falls back to the fixed FIFA
// schedule's host city, augmented with our city→region map.
function matchLocation(round, slotIdx) {
  const addr = matchForSlot(round, slotIdx)?.header?.competitions?.[0]?.venue?.address
  if (addr) {
    if (addr.city && addr.state) return `${addr.city}, ${addr.state}`
    if (addr.city) return addr.city
    if (addr.country) return addr.country
  }
  const city = MATCH_SCHEDULE[matchNum(round, slotIdx)]?.venue
  if (!city) return null
  const region = CITY_REGION[city]
  return region ? `${city}, ${region}` : city
}

// Kickoff metadata line for a slot: "Thu Jun 28 · 8:00 PM · Inglewood, CA".
// Prefers the live ESPN doc's date (real, possibly rescheduled) and falls
// back to the fixed FIFA schedule so every card shows a date/time even
// before any match has live data. Location is folded onto the same line.
function matchDate(round, slotIdx) {
  const iso = matchForSlot(round, slotIdx)?.header?.competitions?.[0]?.date
    ?? MATCH_SCHEDULE[matchNum(round, slotIdx)]?.date
    ?? null
  if (!iso) return null
  const d = new Date(iso)
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' })
  const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
  const dateStr = `${weekday} ${monthDay}`
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
  const loc = matchLocation(round, slotIdx)
  return loc ? `${dateStr} · ${timeStr} · ${loc}` : `${dateStr} · ${timeStr}`
}

async function submitKnockout() {
  if (!knockoutComplete.value || submitting.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const knockoutField = Object.fromEntries(ROUNDS.map(r => [r, [...knockout[r]]]))
    await setDoc(doc(db, 'picks', user.value.uid), { knockout: knockoutField }, { merge: true })
    queryClient.setQueryData(queryKeys.pick(user.value.uid), (old) => ({ ...old, knockout: knockoutField }))
    clearDraft() // saved to DB now — drop the local draft so it can't override later
  } catch {
    submitError.value = 'Save failed — check your connection and try again.'
  } finally {
    submitting.value = false
  }
}

// Warn before leaving with unsaved bracket changes (unless locked, where edits
// are no longer possible). In-router navigation uses a confirm dialog; tab
// close/refresh uses the native beforeunload prompt.
onBeforeRouteLeave(() => {
  if (isDirty.value && !knockoutLocked.value) {
    return window.confirm('You have unsaved bracket changes. Leave without saving?')
  }
  return true
})

function handleBeforeUnload(e) {
  if (isDirty.value && !knockoutLocked.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
onUnmounted(() => window.removeEventListener('beforeunload', handleBeforeUnload))
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 pt-8 pb-10">
    <div v-if="!pickQuery.isFetched.value" class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <template v-else>
      <div class="flex items-baseline justify-between mb-1">
        <h1 class="text-sm font-black tracking-[0.2em] text-white uppercase">Knockout Bracket</h1>
        <span class="text-[10px] font-mono transition-colors" :class="knockoutComplete ? 'text-emerald-400' : 'text-zinc-400'">
          {{ pickedCount }}/{{ totalCount }}
        </span>
      </div>
      <p class="text-[11px] text-zinc-400 mb-5">
        <template v-if="knockoutLocked">The bracket is locked in.</template>
        <template v-else>Pick a winner for every matchup, round by round.</template>
      </p>

      <!-- Conventional bracket: rounds fan in toward the final, each match
           vertically centred between its two feeders and joined by connector
           lines. flex-1 rows + items-stretch keep every column the same height
           so the ┤ connectors line up at exactly 25%/75% of each gap. -->
      <div
        ref="scrollRef"
        class="-mx-4 px-4 overflow-hidden touch-pan-y sm:overflow-x-auto sm:overflow-y-visible sm:touch-auto transition-[height] duration-300 ease-out"
        :style="{ height: containerHeight }"
      >
        <div ref="trackRef" class="relative flex items-stretch min-w-max h-full sm:h-auto" :style="trackStyle">
          <template v-for="(round, rIdx) in ROUNDS" :key="round">
            <!-- Round column -->
            <div class="shrink-0 w-[82vw] max-w-[360px] sm:w-[176px] flex flex-col" :data-round-col="rIdx">
              <div class="h-6 flex items-baseline justify-between px-0.5">
                <span class="text-[9px] font-black tracking-[0.15em] text-emerald-400 uppercase">{{ ROUND_LABELS[round] }}</span>
                <span class="text-[9px] text-zinc-500 font-mono">{{ knockoutPoints[round] }}pt</span>
              </div>

              <div
                v-for="(pair, slotIdx) in matchupsFor(round)" :key="slotIdx"
                :data-row-probe="rIdx === 0 && slotIdx === 0 ? '' : undefined"
                class="flex items-center justify-center py-1 shrink-0 transition-[flex-grow] duration-300 ease-out"
                :style="{ flexGrow: rIdx > focusedIdx ? 1 : 0 }"
              >
                <div class="w-full rounded-xl border bg-court-800 border-court-700 p-1 flex flex-col gap-1">
                  <button
                    v-for="(teamId, teamIdx) in pair" :key="teamId ?? `tbd-${slotIdx}-${teamIdx}`"
                    type="button"
                    @click="teamId && pickWinner(round, slotIdx, teamId)"
                    :disabled="knockoutLocked || !teamId"
                    class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-left transition-all duration-150"
                    :class="teamBtnClass(round, slotIdx, teamId)"
                  >
                    <span class="text-sm leading-none shrink-0">{{ teamId ? (TEAM_BY_ID[teamId]?.flag ?? '🏳️') : '🏳️' }}</span>
                    <span class="flex-1 min-w-0 flex items-center gap-1.5">
                      <span
                        class="text-xs font-medium truncate"
                        :class="!teamId ? 'text-zinc-500 italic' : knockout[round][slotIdx] === teamId ? 'text-white font-bold' : 'text-zinc-300'"
                      >{{ teamId ? (TEAM_BY_ID[teamId]?.name ?? teamId) : tbdLabel(round, slotIdx, teamIdx) }}</span>
                      <span v-if="teamId && rankFor(teamId)" class="text-[9px] text-zinc-500 font-mono shrink-0">#{{ rankFor(teamId) }}</span>
                    </span>
                    <span
                      v-if="teamId && slotState(round, slotIdx) && slotState(round, slotIdx) !== 'pre'"
                      class="text-[10px] font-mono tabular-nums shrink-0"
                      :class="teamId === matchWinner(matchForSlot(round, slotIdx)) ? 'text-white font-bold' : 'text-zinc-400'"
                    >{{ slotScore(round, slotIdx, teamId) ?? '' }}</span>
                    <div
                      v-if="teamId && knockout[round][slotIdx] === teamId"
                      class="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0"
                      :class="round === 'final' ? 'bg-amber-400' : 'bg-emerald-400'"
                    >
                      <svg width="7" height="5" viewBox="0 0 7 5" fill="none" aria-hidden="true">
                        <path d="M1 2.5L2.8 4.3L6 1" stroke="#06101F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </div>
                  </button>

                  <!-- Match metadata footer: number, kickoff + venue, live status -->
                  <div class="px-1.5 pt-1 mt-0.5 border-t border-court-700/60 flex flex-col gap-0.5">
                    <div class="flex items-center gap-1.5">
                      <span class="text-[9px] font-mono font-bold text-zinc-400 shrink-0">M{{ matchNum(round, slotIdx) }}</span>
                      <span v-if="matchDate(round, slotIdx)" class="text-[9px] text-zinc-500 truncate min-w-0">{{ matchDate(round, slotIdx) }}</span>
                      <span
                        v-if="slotClock(round, slotIdx)"
                        class="text-[9px] font-bold uppercase tracking-wide ml-auto shrink-0"
                        :class="slotState(round, slotIdx) === 'in' ? 'text-emerald-400' : 'text-zinc-500'"
                      >{{ slotClock(round, slotIdx) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Connector column: ┤ joining each next-round match to its two feeders -->
            <div
              v-if="rIdx < ROUNDS.length - 1"
              class="shrink-0 w-4 flex flex-col"
            >
              <div class="h-6"></div>
              <div v-for="n in ROUND_SIZE[ROUNDS[rIdx + 1]]" :key="n" class="flex-1 relative min-h-0">
                <span class="absolute left-0 top-1/4 w-1/2 h-px bg-court-600"></span>
                <span class="absolute left-0 top-3/4 w-1/2 h-px bg-court-600"></span>
                <span class="absolute left-1/2 top-1/4 h-1/2 w-px bg-court-600"></span>
                <span class="absolute left-1/2 top-1/2 w-1/2 h-px bg-court-600"></span>
              </div>
            </div>
          </template>
        </div>
      </div>

      <div class="mt-6">
        <div v-if="knockoutLocked" class="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-court-800 border border-court-700">
          <svg class="w-4 h-4 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span class="text-sm font-black tracking-[0.08em] uppercase text-zinc-400">Bracket Locked</span>
        </div>
        <template v-else>
          <p v-if="submitError" class="text-red-400 text-xs text-center mb-2">{{ submitError }}</p>
          <button
            type="button"
            :disabled="!knockoutComplete || submitting || (!isDirty && hasSavedBracket)"
            @click="submitKnockout"
            class="w-full py-4 rounded-2xl font-black text-sm tracking-[0.08em] uppercase transition-all duration-150"
            :class="(knockoutComplete && (isDirty || !hasSavedBracket))
              ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_0_32px_-4px_rgba(14,165,233,0.45)] active:scale-[0.99]'
              : 'bg-court-700 text-zinc-400 cursor-not-allowed'"
          >
            <span v-if="submitting" class="flex items-center justify-center gap-2">
              <svg class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" stroke-dasharray="31.4" class="opacity-30"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
              Saving…
            </span>
            <span v-else-if="!isDirty && hasSavedBracket">All Changes Saved</span>
            <span v-else-if="hasSavedBracket">Save Changes</span>
            <span v-else>Submit Bracket</span>
          </button>
          <p v-if="!knockoutComplete && !submitting" class="text-center text-[11px] text-zinc-400 mt-1.5">bracket incomplete</p>
          <p v-if="knockoutLockTime && knockoutComplete && !submitting" class="text-center text-[11px] text-zinc-400 mt-1.5">
            Bracket locks {{ fmtLockTime(knockoutLockTime) }}
          </p>
        </template>
      </div>
    </template>
  </div>
</template>

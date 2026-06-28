<script setup>
import { reactive, ref, computed, inject, watch } from 'vue'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { TEAM_BY_ID, FIFA_RANKING } from '../data.js'
import { ROUNDS, ROUND_LABELS, ROUND_SIZE, ROUND_POINTS, PREV_ROUND, ADJACENCY, R32_SLOTS, MATCH_SCHEDULE, deriveRoundMatchups, isBracketPickComplete } from '../bracket.js'
import { pickQueryOptions, matchesQueryOptions, queryKeys } from '../queries.js'

const user = inject('user')
const r32Started = inject('r32Started')
const queryClient = useQueryClient()

const knockout = reactive(Object.fromEntries(ROUNDS.map(r => [r, Array(ROUND_SIZE[r]).fill(null)])))
const submitting = ref(false)
const submitError = ref('')
const saved = ref(false)

const pickQuery = useQuery(computed(() => pickQueryOptions(user.value?.uid)))

watch(pickQuery.isFetched, (fetched) => {
  if (!fetched) return
  const data = pickQuery.data.value
  if (data?.knockout) {
    for (const round of ROUNDS) {
      if (Array.isArray(data.knockout[round]) && data.knockout[round].length === ROUND_SIZE[round]) {
        knockout[round] = [...data.knockout[round]]
      }
    }
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
  if (r32Started.value) return
  knockout[round][slotIdx] = teamId
  cascadeFrom(round)
  saved.value = false
}

// Styling for a team row: highlight the picked winner, dim the other team in
// a decided matchup (the chosen "loser") to match the opacity treatment used
// elsewhere (locked group rows, disabled wildcards). Dimming lifts on hover
// while the bracket is still editable so the pick can be changed.
function teamBtnClass(round, slotIdx, teamId) {
  if (!teamId) return 'border-transparent cursor-default'
  const picked = knockout[round][slotIdx]
  if (picked === teamId) return 'bg-emerald-400/10 border-emerald-400/60'
  if (picked) {
    return r32Started.value
      ? 'border-transparent opacity-40'
      : 'border-transparent opacity-40 hover:opacity-100 hover:border-court-600 cursor-pointer active:scale-[0.98]'
  }
  return r32Started.value
    ? 'border-transparent opacity-60'
    : 'border-transparent hover:border-court-600 cursor-pointer active:scale-[0.98]'
}

const knockoutComplete = computed(() => isBracketPickComplete(knockout))
const pickedCount = computed(() => ROUNDS.reduce((n, r) => n + knockout[r].filter(Boolean).length, 0))
const totalCount = ROUNDS.reduce((n, r) => n + ROUND_SIZE[r], 0)

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

// Match numbers in visual bracket order (slot N → FIFA match #), 1-indexed slots.
const SLOT_MATCH_NUM = {
  r32:   [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
  r16:   [89, 90, 93, 94, 91, 92, 95, 96],
  qf:    [97, 98, 99, 100],
  sf:    [101, 102],
  third: [103],
  final: [104],
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

function scoreFor(match, teamId) {
  return match?.competitors?.find((c) => c.teamId === teamId)?.score ?? null
}

function winnerOf(match) {
  if (!match || match.status?.state !== 'post') return null
  const flagged = match.competitors?.find((c) => c.winner)
  if (flagged) return flagged.teamId
  const [a, b] = match.competitors ?? []
  if (!a || !b || a.score == null || b.score == null || a.score === b.score) return null
  return Number(a.score) > Number(b.score) ? a.teamId : b.teamId
}

function matchStatusLabel(match) {
  if (!match) return null
  const s = match.status
  if (s?.state === 'in') return s.displayClock || 'Live'
  if (s?.state === 'post') return 'Final'
  return null
}

// Kickoff date/time for a slot — prefers the live ESPN doc (real, possibly
// rescheduled) and falls back to the fixed FIFA schedule so every card shows
// a date/time even before any match has live data.
function matchDate(round, slotIdx) {
  const iso = matchForSlot(round, slotIdx)?.header?.competitions?.[0]?.date
    ?? MATCH_SCHEDULE[matchNum(round, slotIdx)]?.date
    ?? null
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
    + ' · '
    + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

function matchVenue(round, slotIdx) {
  const comp = matchForSlot(round, slotIdx)?.header?.competitions?.[0]
  return comp?.venue?.address?.city || comp?.venue?.fullName
    || MATCH_SCHEDULE[matchNum(round, slotIdx)]?.venue || null
}

async function submitKnockout() {
  if (!knockoutComplete.value || submitting.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const knockoutField = Object.fromEntries(ROUNDS.map(r => [r, [...knockout[r]]]))
    await setDoc(doc(db, 'picks', user.value.uid), { knockout: knockoutField }, { merge: true })
    queryClient.setQueryData(queryKeys.pick(user.value.uid), (old) => ({ ...old, knockout: knockoutField }))
    saved.value = true
  } catch {
    submitError.value = 'Save failed — check your connection and try again.'
  } finally {
    submitting.value = false
  }
}
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
        <template v-if="r32Started">The Round of 32 has started — your bracket is locked in.</template>
        <template v-else>Pick a winner for every matchup, round by round.</template>
      </p>

      <!-- Conventional bracket: rounds fan in toward the final, each match
           vertically centred between its two feeders and joined by connector
           lines. flex-1 rows + items-stretch keep every column the same height
           so the ┤ connectors line up at exactly 25%/75% of each gap. -->
      <div class="overflow-x-auto -mx-4 px-4">
        <div class="flex items-stretch min-w-max pb-2">
          <template v-for="(round, rIdx) in ROUNDS" :key="round">
            <!-- Round column -->
            <div class="shrink-0 w-[176px] flex flex-col">
              <div class="h-6 flex items-baseline justify-between px-0.5">
                <span class="text-[9px] font-black tracking-[0.15em] text-emerald-400 uppercase">{{ ROUND_LABELS[round] }}</span>
                <span class="text-[9px] text-zinc-500 font-mono">{{ ROUND_POINTS[round] }}pt</span>
              </div>

              <div
                v-for="(pair, slotIdx) in matchupsFor(round)" :key="slotIdx"
                class="flex-1 flex items-center justify-center py-1 min-h-0"
              >
                <div class="w-full rounded-xl border bg-court-800 border-court-700 p-1 flex flex-col gap-1">
                  <button
                    v-for="(teamId, teamIdx) in pair" :key="teamId ?? `tbd-${slotIdx}-${teamIdx}`"
                    type="button"
                    @click="teamId && pickWinner(round, slotIdx, teamId)"
                    :disabled="r32Started || !teamId"
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
                      v-if="teamId && matchForSlot(round, slotIdx)"
                      class="text-[10px] font-mono tabular-nums shrink-0"
                      :class="teamId === winnerOf(matchForSlot(round, slotIdx)) ? 'text-white font-bold' : 'text-zinc-400'"
                    >{{ scoreFor(matchForSlot(round, slotIdx), teamId) ?? '' }}</span>
                    <div
                      v-if="teamId && knockout[round][slotIdx] === teamId"
                      class="w-3.5 h-3.5 bg-emerald-400 rounded-full flex items-center justify-center shrink-0"
                    >
                      <svg width="7" height="5" viewBox="0 0 7 5" fill="none" aria-hidden="true">
                        <path d="M1 2.5L2.8 4.3L6 1" stroke="#06101F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </div>
                  </button>

                  <!-- Match metadata footer: number, kickoff, venue, live status -->
                  <div class="px-1.5 pt-1 mt-0.5 border-t border-court-700/60 flex flex-col gap-0.5">
                    <div class="flex items-center gap-1.5">
                      <span class="text-[9px] font-mono font-bold text-zinc-400 shrink-0">M{{ matchNum(round, slotIdx) }}</span>
                      <span v-if="matchDate(round, slotIdx)" class="text-[9px] text-zinc-500 truncate min-w-0">{{ matchDate(round, slotIdx) }}</span>
                      <span
                        v-if="matchStatusLabel(matchForSlot(round, slotIdx))"
                        class="text-[9px] font-bold uppercase tracking-wide ml-auto shrink-0"
                        :class="matchForSlot(round, slotIdx)?.status?.state === 'in' ? 'text-emerald-400' : 'text-zinc-500'"
                      >{{ matchStatusLabel(matchForSlot(round, slotIdx)) }}</span>
                    </div>
                    <span v-if="matchVenue(round, slotIdx)" class="text-[9px] text-zinc-600 truncate">{{ matchVenue(round, slotIdx) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Connector column: one ┤ per next-round match, joining its two feeders -->
            <div v-if="rIdx < ROUNDS.length - 1" class="shrink-0 w-4 flex flex-col">
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
        <div v-if="r32Started" class="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-court-800 border border-court-700">
          <svg class="w-4 h-4 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span class="text-sm font-black tracking-[0.08em] uppercase text-zinc-400">Bracket Locked</span>
        </div>
        <template v-else>
          <p v-if="submitError" class="text-red-400 text-xs text-center mb-2">{{ submitError }}</p>
          <button
            type="button"
            :disabled="!knockoutComplete || submitting"
            @click="submitKnockout"
            class="w-full py-4 rounded-2xl font-black text-sm tracking-[0.08em] uppercase transition-all duration-150"
            :class="knockoutComplete
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
            <span v-else-if="saved && knockoutComplete">Saved ✓</span>
            <span v-else>Save Bracket</span>
          </button>
          <p v-if="!knockoutComplete && !submitting" class="text-center text-[11px] text-zinc-400 mt-1.5">bracket incomplete</p>
        </template>
      </div>
    </template>
  </div>
</template>

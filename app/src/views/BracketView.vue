<script setup>
import { reactive, ref, computed, inject, watch } from 'vue'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { TEAM_BY_ID, FIFA_RANKING } from '../data.js'
import { ROUNDS, ROUND_LABELS, ROUND_SIZE, ROUND_POINTS, PREV_ROUND, ADJACENCY, R32_SLOTS, deriveRoundMatchups, isBracketPickComplete } from '../bracket.js'
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

function matchDate(match) {
  const iso = match?.header?.competitions?.[0]?.date
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
    + ', '
    + d.toLocaleTimeString('en-US', { hour: 'numeric', timeZone: 'America/New_York' })
}

function matchVenue(match) {
  const comp = match?.header?.competitions?.[0]
  if (!comp) return null
  return comp.venue?.address?.city || comp.venue?.fullName || null
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

      <div class="overflow-x-auto -mx-4 px-4 snap-x snap-mandatory">
        <div class="flex gap-3 pb-2">
          <div v-for="round in ROUNDS" :key="round" class="shrink-0 w-[180px] flex flex-col gap-2 snap-start">
            <div class="flex items-baseline justify-between px-0.5">
              <span class="text-[9px] font-black tracking-[0.15em] text-emerald-400 uppercase">{{ ROUND_LABELS[round] }}</span>
              <span class="text-[9px] text-zinc-500 font-mono">{{ ROUND_POINTS[round] }}pt</span>
            </div>

            <div
              v-for="(pair, slotIdx) in matchupsFor(round)" :key="slotIdx"
              class="rounded-xl border bg-court-800 border-court-700 p-1 flex flex-col gap-1"
            >
              <button
                v-for="(teamId, teamIdx) in pair" :key="teamId ?? `tbd-${slotIdx}-${teamIdx}`"
                type="button"
                @click="teamId && pickWinner(round, slotIdx, teamId)"
                :disabled="r32Started || !teamId"
                class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-left transition-all duration-150"
                :class="!teamId
                  ? 'border-transparent cursor-default'
                  : knockout[round][slotIdx] === teamId
                    ? 'bg-emerald-400/10 border-emerald-400/60'
                    : r32Started
                      ? 'border-transparent opacity-60'
                      : 'border-transparent hover:border-court-600 cursor-pointer active:scale-[0.98]'"
              >
                <span class="text-sm leading-none shrink-0">{{ teamId ? (TEAM_BY_ID[teamId]?.flag ?? '🏳️') : '🏳️' }}</span>
                <span
                  class="text-xs font-medium truncate flex-1 min-w-0"
                  :class="!teamId ? 'text-zinc-500 italic' : knockout[round][slotIdx] === teamId ? 'text-white font-bold' : 'text-zinc-300'"
                >{{ teamId ? (TEAM_BY_ID[teamId]?.name ?? teamId) : tbdLabel(round, slotIdx, teamIdx) }}</span>
                <span v-if="teamId && rankFor(teamId)" class="text-[9px] text-zinc-500 font-mono shrink-0">#{{ rankFor(teamId) }}</span>
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

              <!-- Match metadata footer: always shown -->
              <div class="px-2 pt-0.5 pb-0.5 mt-0.5 border-t border-court-700/60 flex flex-col gap-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-[9px] font-mono font-bold text-zinc-400 shrink-0">M{{ matchNum(round, slotIdx) }}</span>
                  <span v-if="matchDate(matchForSlot(round, slotIdx))" class="text-[9px] text-zinc-500 truncate min-w-0">{{ matchDate(matchForSlot(round, slotIdx)) }}</span>
                  <span
                    v-if="matchStatusLabel(matchForSlot(round, slotIdx))"
                    class="text-[9px] font-bold uppercase tracking-wide ml-auto shrink-0"
                    :class="matchForSlot(round, slotIdx)?.status?.state === 'in' ? 'text-emerald-400' : 'text-zinc-500'"
                  >{{ matchStatusLabel(matchForSlot(round, slotIdx)) }}</span>
                </div>
                <span v-if="matchVenue(matchForSlot(round, slotIdx))" class="text-[9px] text-zinc-600 truncate">{{ matchVenue(matchForSlot(round, slotIdx)) }}</span>
              </div>
            </div>
          </div>
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

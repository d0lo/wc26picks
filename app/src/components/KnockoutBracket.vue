<script setup>
import { computed } from 'vue'
import { ROUNDS, ROUND_LABELS, ROUND_SIZE, ROUND_POINTS, PREV_ROUND, R32_SLOTS, deriveRoundMatchups } from '../bracket.js'
import { TEAM_BY_ID } from '../data.js'

// Read-only knockout bracket display — shared by the live stadium page
// (matches only, no picks/breakdown) and the leaderboard's graded view (a
// user's picks + their breakdown.knockout points), per CLAUDE.md's
// live_tracker/live_bracket requirement to reuse one component for both.
const props = defineProps({
  matches: { type: Array, default: () => [] },       // matches/{eventId} docs (round/slot tagged)
  picks: { type: Object, default: null },             // picks/{uid}.knockout — { r32:[16], r16:[8], qf:[4], sf:[2], final:[1] }
  breakdown: { type: Object, default: null },         // scores/{uid}.breakdown.knockout — { [round]: { [slotIndex]: points } }
  compact: { type: Boolean, default: false },
})

const DISPLAY_ROUNDS = [...ROUNDS, 'third']

function teamLabel(teamId) {
  return teamId ? TEAM_BY_ID[teamId] ?? { name: teamId, flag: '🏳️' } : null
}

const matchByKey = computed(() => new Map(props.matches.map((m) => [`${m.round}_${m.slot}`, m])))

function decideMatch(match) {
  if (!match || match.status?.state !== 'post') return { winner: null, loser: null }
  const competitors = match.competitors ?? []
  const flagged = competitors.find((c) => c.winner)
  if (flagged) {
    const other = competitors.find((c) => c.teamId !== flagged.teamId)
    return { winner: flagged.teamId, loser: other?.teamId ?? null }
  }
  const [a, b] = competitors
  if (!a || !b || a.score == null || b.score == null || a.score === b.score) return { winner: null, loser: null }
  const winner = Number(a.score) > Number(b.score) ? a.teamId : b.teamId
  return { winner, loser: winner === a.teamId ? b.teamId : a.teamId }
}

function makeSlot(round, slot, teams) {
  const match = matchByKey.value.get(`${round}_${slot}`)
  const { winner, loser } = decideMatch(match)
  return { round, slot, teams, match, winner, loser }
}

// Each round's matchups are derived from the previous round's actual
// winners (bracket.js's deriveRoundMatchups) rather than waiting on that
// round's own ESPN event to go live — a later round's real team names are
// knowable as soon as its two feeder matches finish, exactly mirroring how
// PicksView's picker derives the user's own projected bracket.
const bracket = computed(() => {
  const result = { r32: R32_SLOTS.map((teams, i) => makeSlot('r32', i + 1, teams)) }
  for (const round of ['r16', 'qf', 'sf']) {
    const prevRound = PREV_ROUND[round]
    const prevWinners = result[prevRound].map((s) => s.winner)
    result[round] = deriveRoundMatchups(round, prevWinners).map((teams, i) => makeSlot(round, i + 1, teams))
  }
  const sfWinners = result.sf.map((s) => s.winner)
  const sfLosers = result.sf.map((s) => s.loser)
  result.final = [makeSlot('final', 1, sfWinners)]
  result.third = [makeSlot('third', 1, sfLosers)]
  return result
})

function pickFor(round, slot) {
  return props.picks?.[round]?.[slot - 1] ?? null
}

function pickStatus(slotInfo) {
  if (!props.picks) return null
  const pick = pickFor(slotInfo.round, slotInfo.slot)
  if (!pick) return null
  if (!slotInfo.winner) return 'pending'
  return pick === slotInfo.winner ? 'correct' : 'incorrect'
}

function pointsFor(slotInfo) {
  return props.breakdown?.[slotInfo.round]?.[slotInfo.slot - 1] ?? null
}

function rowClass(slotInfo, teamId) {
  const isWinner = slotInfo.winner && teamId === slotInfo.winner
  const isLoser = slotInfo.winner && teamId !== slotInfo.winner
  const isPick = props.picks && pickFor(slotInfo.round, slotInfo.slot) === teamId
  if (isPick) {
    if (isWinner) return 'text-emerald-400 font-bold'
    if (isLoser) return 'text-red-400/70'
    return 'text-white font-bold'
  }
  if (isLoser) return 'text-zinc-500 opacity-50'
  if (isWinner) return 'text-zinc-300'
  return 'text-zinc-300'
}

function statusLabel(match) {
  if (!match) return null
  const s = match.status
  if (s?.state === 'in') return s.displayClock || 'Live'
  if (s?.state === 'post') return 'Final'
  return null
}
</script>

<template>
  <div class="overflow-x-auto" :class="compact ? '' : '-mx-4 px-4'">
    <div class="flex gap-3" :class="compact ? 'pb-1' : 'pb-2'">
      <div
        v-for="round in DISPLAY_ROUNDS" :key="round"
        class="shrink-0 flex flex-col gap-2"
        :class="compact ? 'w-[148px]' : 'w-[180px]'"
      >
        <div class="text-[9px] font-black tracking-[0.15em] text-zinc-400 uppercase px-0.5">
          {{ ROUND_LABELS[round] }}
        </div>

        <div
          v-for="slotInfo in bracket[round]" :key="slotInfo.slot"
          class="bg-court-800 border border-court-700 rounded-xl px-2.5 py-2 flex flex-col gap-1"
        >
          <div
            v-for="(teamId, i) in slotInfo.teams" :key="i"
            class="flex items-center gap-1.5 text-[11px]"
          >
            <span class="text-sm leading-none shrink-0">{{ teamLabel(teamId)?.flag ?? '🏳️' }}</span>
            <span class="truncate min-w-0 flex-1" :class="rowClass(slotInfo, teamId)">
              {{ teamLabel(teamId)?.name ?? 'TBD' }}
            </span>
            <span
              v-if="slotInfo.match"
              class="text-[10px] font-mono tabular-nums shrink-0"
              :class="teamId === slotInfo.winner ? 'text-white font-bold' : 'text-zinc-400'"
            >{{ slotInfo.match.competitors?.find((c) => c.teamId === teamId)?.score ?? '' }}</span>
            <span v-if="pickStatus(slotInfo) === 'correct' && pickFor(slotInfo.round, slotInfo.slot) === teamId" class="text-emerald-400 text-[10px] shrink-0">✓</span>
            <span v-else-if="pickStatus(slotInfo) === 'incorrect' && pickFor(slotInfo.round, slotInfo.slot) === teamId" class="text-red-400/70 text-[10px] shrink-0">✗</span>
          </div>

          <div v-if="statusLabel(slotInfo.match) || pointsFor(slotInfo) !== null" class="flex items-center justify-between pt-0.5 mt-0.5 border-t border-court-700/60">
            <span
              class="text-[9px] font-bold uppercase tracking-wide"
              :class="slotInfo.match?.status?.state === 'in' ? 'text-emerald-400' : 'text-zinc-500'"
            >{{ statusLabel(slotInfo.match) ?? '' }}</span>
            <span v-if="pointsFor(slotInfo) !== null" class="text-[9px] font-mono tabular-nums text-zinc-400">
              {{ pointsFor(slotInfo) }}/{{ ROUND_POINTS[slotInfo.round] ?? '–' }} pts
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

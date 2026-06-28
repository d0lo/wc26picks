<script setup>
import { computed } from 'vue'
import { ROUNDS, ROUND_LABELS, ROUND_SIZE, ROUND_POINTS, PREV_ROUND, R32_SLOTS, deriveRoundMatchups } from '../bracket.js'
import { TEAM_BY_ID } from '../data.js'
import { useBracketFocus } from '../composables/useBracketFocus.js'

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

// ESPN-style pager (mobile only): swipe moves exactly one round; the snapped
// round fans in (dense) while rounds to its right (incl. the detached 3rd-place
// column) fan out over its height. Desktop = full conventional fanned bracket.
const DISPLAY_ROUNDS = [...ROUNDS, 'third']
const { scrollRef, trackRef, focusedIdx, containerHeight, trackStyle } = useBracketFocus(DISPLAY_ROUNDS, ROUND_SIZE)

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
  <!-- Conventional bracket: the r32→final rounds fan in toward the Final with
       ┤ connector lines (flex-1 rows + items-stretch keep columns equal-height
       so connectors hit 25%/75% of each gap); the 3rd-place match hangs off to
       the side as a detached column, since it isn't part of the win tree. -->
  <div
    ref="scrollRef"
    class="overflow-hidden touch-pan-y sm:overflow-x-auto sm:overflow-y-visible sm:touch-auto transition-[height] duration-300 ease-out"
    :class="compact ? '' : '-mx-4 px-4'"
    :style="{ height: containerHeight }"
  >
    <div ref="trackRef" class="relative flex items-stretch min-w-max h-full sm:h-auto" :style="trackStyle">
      <template v-for="(round, rIdx) in ROUNDS" :key="round">
        <!-- Round column -->
        <div class="shrink-0 flex flex-col w-[82vw] max-w-[360px]" :class="compact ? 'sm:w-[150px]' : 'sm:w-[176px]'" :data-round-col="rIdx">
          <div class="h-6 flex items-center text-[9px] font-black tracking-[0.15em] text-zinc-400 uppercase px-0.5">
            {{ ROUND_LABELS[round] }}
          </div>
          <div
            v-for="(slotInfo, slotIdx) in bracket[round]" :key="slotInfo.slot"
            :data-row-probe="rIdx === 0 && slotIdx === 0 ? '' : undefined"
            class="flex items-center justify-center py-1 shrink-0 transition-[flex-grow] duration-300 ease-out"
            :style="{ flexGrow: rIdx > focusedIdx ? 1 : 0 }"
          >
            <div class="w-full bg-court-800 border border-court-700 rounded-xl px-2.5 py-2 flex flex-col gap-1">
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

        <!-- Connector column: ┤ joining each next-round match to its two feeders -->
        <div
          v-if="rIdx < ROUNDS.length - 1"
          class="shrink-0 flex flex-col"
          :class="compact ? 'w-3' : 'w-4'"
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

      <!-- 3rd-place match: detached column (not part of the win tree) -->
      <div class="shrink-0 flex flex-col sm:pl-2 w-[82vw] max-w-[360px]" :class="compact ? 'sm:w-[150px]' : 'sm:w-[176px]'" :data-round-col="ROUNDS.length">
        <div class="h-6 flex items-center text-[9px] font-black tracking-[0.15em] text-zinc-400 uppercase px-0.5">
          {{ ROUND_LABELS.third }}
        </div>
        <div
          v-for="slotInfo in bracket.third" :key="slotInfo.slot"
          class="flex items-center justify-center py-1 shrink-0 transition-[flex-grow] duration-300 ease-out"
          :style="{ flexGrow: ROUNDS.length > focusedIdx ? 1 : 0 }"
        >
          <div class="w-full bg-court-800 border border-court-700 rounded-xl px-2.5 py-2 flex flex-col gap-1">
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
  </div>
</template>

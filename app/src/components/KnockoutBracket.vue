<script setup>
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { ROUNDS, ROUND_LABELS, ROUND_SIZE, ROUND_POINTS, PREV_ROUND, R32_SLOTS, EVENT_SLOT_MAP, deriveRoundMatchups, matchWinner, matchLoser } from '../bracket.js'
import { TEAM_BY_ID } from '../data.js'
import { mergedState, mergedClock, mergedScore } from '../lib/liveMatch.js'
import { configQueryOptions } from '../queries.js'
import { useBracketFocus } from '../composables/useBracketFocus.js'

// Read-only knockout bracket display — shared by the live stadium page
// (matches only, no picks/breakdown) and the leaderboard's graded view (a
// user's picks + their breakdown.knockout points), per CLAUDE.md's
// live_tracker/live_bracket requirement to reuse one component for both.
const props = defineProps({
  matches: { type: Array, default: () => [] },       // matches/{eventId} docs (round/slot tagged)
  events: { type: Array, default: () => [] },         // today's liveData/scoreboard events (live overlay)
  picks: { type: Object, default: null },             // picks/{uid}.knockout — { r32:[16], r16:[8], qf:[4], sf:[2], final:[1] }
  breakdown: { type: Object, default: null },         // scores/{uid}.breakdown.knockout — { [round]: { [slotIndex]: points } }
  compact: { type: Boolean, default: false },
})

// Today's live scoreboard events, mapped to bracket slots — overlaid so an
// in-progress match shows its live score and clock (the matches/{eventId} doc
// only carries the score at state flips, not mid-match).
const liveByKey = computed(() => {
  const map = new Map()
  for (const ev of props.events ?? []) {
    const meta = EVENT_SLOT_MAP[ev.id]
    if (meta) map.set(`${meta.round}_${meta.slot}`, ev)
  }
  return map
})

// ESPN-style pager (mobile only): swipe moves exactly one round; the snapped
// round fans in (dense) while rounds to its right (incl. the detached 3rd-place
// column) fan out over its height. Desktop = full conventional fanned bracket.
const DISPLAY_ROUNDS = [...ROUNDS, 'third']
const { scrollRef, trackRef, focusedIdx, containerHeight, trackStyle } = useBracketFocus(DISPLAY_ROUNDS, ROUND_SIZE)

// The bracket (knockout) rounds — used to tell a knockout match apart from a
// group-stage fixture in the shared `matches` collection.
const KNOCKOUT_ROUNDS = new Set([...ROUNDS, 'third'])

function teamLabel(teamId) {
  return teamId ? TEAM_BY_ID[teamId] ?? { name: teamId, flag: '🏳️' } : null
}

const matchByKey = computed(() => new Map(props.matches.map((m) => [`${m.round}_${m.slot}`, m])))

function makeSlot(round, slot, teams) {
  const match = matchByKey.value.get(`${round}_${slot}`)
  return { round, slot, teams, match, winner: matchWinner(match), loser: matchLoser(match), live: liveByKey.value.get(`${round}_${slot}`) ?? null }
}

// State/score/clock merged from the live scoreboard (mid-match) and the
// matches/{eventId} doc (authoritative final) — see lib/liveMatch.js.
function slotState(slotInfo) { return mergedState(slotInfo.match, slotInfo.live) }
function slotClock(slotInfo) { return mergedClock(slotInfo.match, slotInfo.live) }
function slotScore(slotInfo, teamId) { return mergedScore(slotInfo.match, slotInfo.live, teamId) }

// Per-round knockout point values are config-driven (config/public.scoring.
// knockout), falling back to ROUND_POINTS defaults.
const configQuery = useQuery(configQueryOptions())
const knockoutPoints = computed(() => ({ ...ROUND_POINTS, ...(configQuery.data.value?.scoring?.knockout ?? {}) }))

function pickFor(round, slot) {
  return props.picks?.[round]?.[slot - 1] ?? null
}

// The team a slot projects forward to the next round. When a user's picks are
// supplied this is THEIR pick for the slot — the bracket is their *predicted*
// bracket, with live reality layered on top via strikethrough (see rowClass),
// NOT by swapping the real winner in for their pick. That's what keeps an
// eliminated pick (say Argentina) visible — and struck out — in every later
// round they predicted it to reach, instead of vanishing the moment a real
// result comes in. The stadium view passes no picks, so it falls back to the
// real winner and fills in as matches are decided (TBD until then).
function advancingTeam(slotInfo) {
  if (props.picks) return pickFor(slotInfo.round, slotInfo.slot) ?? slotInfo.winner
  return slotInfo.winner
}

// The team that doesn't advance from a slot (feeds the 3rd-place match from the
// semis). Mirrors advancingTeam: with picks it's the non-advancing team of the
// projected matchup; without, the real loser.
function eliminatedTeam(slotInfo) {
  if (!props.picks) return slotInfo.loser
  const adv = advancingTeam(slotInfo)
  if (!adv) return null // nothing advances yet → nothing's eliminated yet
  return slotInfo.teams?.find((t) => t && t !== adv) ?? null
}

// Each round's matchups are derived from the previous round's advancing teams
// (the user's picks where supplied, real winners otherwise) rather than waiting
// on that round's own ESPN event to go live — exactly mirroring how PicksView's
// picker derives the user's own projected bracket.
const bracket = computed(() => {
  const result = { r32: R32_SLOTS.map((teams, i) => makeSlot('r32', i + 1, teams)) }
  for (const round of ['r16', 'qf', 'sf']) {
    const prevRound = PREV_ROUND[round]
    const prevWinners = result[prevRound].map((s) => advancingTeam(s))
    result[round] = deriveRoundMatchups(round, prevWinners).map((teams, i) => makeSlot(round, i + 1, teams))
  }
  const sfWinners = result.sf.map((s) => advancingTeam(s))
  const sfLosers = result.sf.map((s) => eliminatedTeam(s))
  result.final = [makeSlot('final', 1, sfWinners)]
  result.third = [makeSlot('third', 1, sfLosers)]
  return result
})

// Teams officially out of the tournament — they lost a real KNOCKOUT match.
// This is the live-results source of truth for striking a team out wherever it
// appears in the bracket, independent of anyone's picks. Group-stage matches
// are excluded: losing a group game doesn't eliminate a team (it can still
// advance as a runner-up or best third), so only losses in a bracket round
// count — `matches` holds group fixtures too, keyed without a knockout round.
const eliminatedTeamIds = computed(() => {
  const set = new Set()
  for (const m of props.matches ?? []) {
    if (!KNOCKOUT_ROUNDS.has(m.round)) continue
    const loser = matchLoser(m)
    if (loser) set.add(loser)
  }
  return set
})

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
  const isFinal = slotInfo.round === 'final'
  // Graded picks view: styling only ever marks up the team YOU picked to win a
  // slot. The strike + red tracks live real results — your pick is crossed out
  // once it's officially out (lost a real knockout match), in every later round
  // you advanced it to, but not in a slot it actually won (it's eliminated from
  // a *later* round, not this one). Teams you didn't pick stay plain.
  if (props.picks) {
    const isPick = pickFor(slotInfo.round, slotInfo.slot) === teamId
    if (isPick) {
      if (isWinner) return isFinal ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'
      if (teamId && eliminatedTeamIds.value.has(teamId)) return 'text-red-400 font-bold line-through'
      return 'text-white font-bold'
    }
    return 'text-zinc-300'
  }
  // Stadium view (no picks): real-results styling — dim the loser of a decided
  // match, everything else plain. Unchanged from before the picks projection.
  if (slotInfo.winner && teamId !== slotInfo.winner) return 'text-zinc-500 opacity-50'
  return 'text-zinc-300'
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
        <div class="shrink-0 flex flex-col" :class="compact ? 'w-[42vw] max-w-[180px] sm:w-[150px]' : 'w-[82vw] max-w-[360px] sm:w-[176px]'" :data-round-col="rIdx">
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
                  v-if="slotState(slotInfo) && slotState(slotInfo) !== 'pre'"
                  class="text-[10px] font-mono tabular-nums shrink-0"
                  :class="teamId === slotInfo.winner ? 'text-white font-bold' : 'text-zinc-400'"
                >{{ slotScore(slotInfo, teamId) ?? '' }}</span>
                <span v-if="pickStatus(slotInfo) === 'correct' && pickFor(slotInfo.round, slotInfo.slot) === teamId" class="text-[10px] shrink-0" :class="slotInfo.round === 'final' ? 'text-amber-400' : 'text-emerald-400'">✓</span>
              </div>

              <div v-if="slotClock(slotInfo) || pointsFor(slotInfo) !== null" class="flex items-center justify-between pt-0.5 mt-0.5 border-t border-court-700/60">
                <span
                  class="text-[9px] font-bold uppercase tracking-wide"
                  :class="slotState(slotInfo) === 'in' ? 'text-emerald-400' : 'text-zinc-500'"
                >{{ slotClock(slotInfo) ?? '' }}</span>
                <span v-if="pointsFor(slotInfo) !== null" class="text-[9px] font-mono tabular-nums text-zinc-400">
                  {{ pointsFor(slotInfo) }}/{{ knockoutPoints[slotInfo.round] ?? '–' }} pts
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
      <div class="shrink-0 flex flex-col sm:pl-2" :class="compact ? 'w-[42vw] max-w-[180px] sm:w-[150px]' : 'w-[82vw] max-w-[360px] sm:w-[176px]'" :data-round-col="ROUNDS.length">
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
                v-if="slotState(slotInfo) && slotState(slotInfo) !== 'pre'"
                class="text-[10px] font-mono tabular-nums shrink-0"
                :class="teamId === slotInfo.winner ? 'text-white font-bold' : 'text-zinc-400'"
              >{{ slotScore(slotInfo, teamId) ?? '' }}</span>
              <span v-if="pickStatus(slotInfo) === 'correct' && pickFor(slotInfo.round, slotInfo.slot) === teamId" class="text-emerald-400 text-[10px] shrink-0">✓</span>
            </div>

            <div v-if="slotClock(slotInfo) || pointsFor(slotInfo) !== null" class="flex items-center justify-between pt-0.5 mt-0.5 border-t border-court-700/60">
              <span
                class="text-[9px] font-bold uppercase tracking-wide"
                :class="slotState(slotInfo) === 'in' ? 'text-emerald-400' : 'text-zinc-500'"
              >{{ slotClock(slotInfo) ?? '' }}</span>
              <span v-if="pointsFor(slotInfo) !== null" class="text-[9px] font-mono tabular-nums text-zinc-400">
                {{ pointsFor(slotInfo) }}/{{ knockoutPoints[slotInfo.round] ?? '–' }} pts
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

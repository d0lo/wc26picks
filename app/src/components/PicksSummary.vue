<script setup>
import { reactive, ref, computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { GROUPS, TEAM_FLAG, TEAM_BY_ID, FIFA_RANKING } from '../data.js'
import { ROSTERS } from '../rosters.js'
import { useScoring } from '../composables/useScoring.js'
import { groupsQueryOptions, wildcardsQueryOptions, scoreQueryOptions, matchesQueryOptions, scoreboardQueryOptions, propResultsQueryOptions } from '../queries.js'
import { isGroupStageComplete } from '../lib/tournament.js'
import PropPointsBadge from './PropPointsBadge.vue'
import KnockoutBracket from './KnockoutBracket.vue'

// Captured (not destructured as `props`) because the prop-pick-answers prop
// below is itself named `props` — see usage in the template, which can
// still reference `groups`/`wildcards`/`props` bare since defineProps()
// exposes them to the template regardless of how the return value is used.
const componentProps = defineProps({
  groups: Object,    // { A: [uuid1, uuid2, uuid3, uuid4], ... }
  wildcards: Array,  // [groupLetters]
  knockout: Object,  // { r32:[16], r16:[8], qf:[4], sf:[2], final:[1] }
  props: Object,     // { goldenBoot: uuid, ... }
  uid: String,       // whose pick this is — used to fetch their scores/{uid}
  // Section gates — default true so the viewer's OWN picks (LeaderboardView
  // "My Picks") stay fully visible. PicksModal passes the lock-state computeds
  // to hide another player's picks until the relevant lock has passed.
  showGroupsProps: { type: Boolean, default: true }, // gates Group Standings, wildcards, props
  showBracket: { type: Boolean, default: true },     // gates Knockout Bracket
})

const PLAYER_BY_ID = {}
for (const [teamName, players] of Object.entries(ROSTERS)) {
  for (const p of players) PLAYER_BY_ID[p.id] = { ...p, team: teamName }
}

const { scoring, propsByCategory } = useScoring()

// Actual group standings + the real "best 3rd place" advancing set, used to
// conditionally style each predicted pick as correct/incorrect. Both stay
// `null`/absent until the relevant backend trigger has run at least once
// (see firebase/functions/index.js onScoreboardWrite / onGroupsWrite) — that
// "nothing computed yet" state is rendered as a neutral pending look rather
// than guessed at.
const groupsQuery = useQuery(groupsQueryOptions())
const wildcardsQuery = useQuery(wildcardsQueryOptions())
const scoreQuery = useQuery(computed(() => scoreQueryOptions(componentProps.uid)))
const matchesQuery = useQuery(matchesQueryOptions())
// Reads the shared scoreboard cache (listener owned by LeaderboardView) for the
// bracket's live-score overlay.
const scoreboardQuery = useQuery(scoreboardQueryOptions())

const matches = computed(() => matchesQuery.data.value ?? [])
const liveEvents = computed(() => scoreboardQuery.data.value?.events ?? [])
const knockoutBreakdown = computed(() => scoreQuery.data.value?.breakdown?.knockout ?? null)

const advancingLetters = computed(() => new Set(wildcardsQuery.data.value?.advancingLetters ?? []))

function actualOrder(letter) {
  const entries = groupsQuery.data.value?.[letter]?.entries
  return entries?.length ? entries.map((e) => e.team.id) : null
}

// 'pending' — no standings yet for this group, can't compute correctness.
// 'correct'/'incorrect' — predicted team is/isn't in this exact position.
function pickStatus(letter, i, teamId) {
  const order = actualOrder(letter)
  if (!order) return 'pending'
  return order[i] === teamId ? 'correct' : 'incorrect'
}

function rowOpacityClass(letter, i) {
  return (i === 3 || (i === 2 && !componentProps.wildcards?.includes(letter))) ? 'opacity-30' : ''
}

// One combined class per row instead of stacking color utilities on top of
// the existing bold/dim treatment, which would otherwise tie on specificity.
function rowTextClass(letter, i, teamId) {
  const status = pickStatus(letter, i, teamId)
  if (status === 'correct') return 'text-emerald-400 font-bold'
  if (status === 'incorrect') return 'text-red-400/70'
  return i < 2 || (i === 2 && componentProps.wildcards?.includes(letter)) ? 'text-white font-bold' : 'text-zinc-300'
}

// Max points a fully-correct group prediction could earn — static per the
// current scoring config, independent of whether the group has been played.
const groupMaxPoints = computed(() => {
  const exact = scoring.value?.groupExact
  if (!exact) return null
  const sum = Object.values(exact).reduce((total, v) => total + Number(v ?? 0), 0)
  return sum + Number(scoring.value?.perfectGroupBonus ?? 0)
})

function groupPointsEarned(letter) {
  return scoreQuery.data.value?.breakdown?.groups?.[letter] ?? null
}

// A wildcard pick is only correct when the team the user predicted to finish
// 3rd in that group is the team that actually finished 3rd AND that 3rd-place
// team is in the advancing set. A predicted team that advanced as 1st/2nd
// (i.e. "made it out of the group") while a different team took the advancing
// 3rd spot is incorrect — the team must be correctly placed into 3rd. Mirrors
// isWildcardCorrect in firebase/functions/lib/scoring.js.
function wildcardStatus(letter) {
  if (wildcardsQuery.data.value == null) return 'pending'
  if (!advancingLetters.value.has(letter)) return 'incorrect'
  const order = actualOrder(letter)
  if (!order) return 'pending'
  const predictedThird = componentProps.groups?.[letter]?.[2]
  return predictedThird && order[2] === predictedThird ? 'correct' : 'incorrect'
}

function wildcardBorderClass(letter) {
  const status = wildcardStatus(letter)
  if (status === 'correct') return 'border-emerald-500/40'
  if (status === 'incorrect') return 'border-red-500/20'
  return 'border-court-700'
}

const wildcardPointsPossible = computed(() => {
  const perPick = scoring.value?.wildcard
  if (perPick == null) return null
  return (componentProps.wildcards?.length ?? 0) * Number(perPick)
})

const wildcardPointsEarned = computed(() => scoreQuery.data.value?.breakdown?.wildcards ?? null)

// Resolved prop winners from the backend prop engine — the same document
// that drives breakdown.props, so ✓/✗ here always agrees with the points
// actually credited. null until the engine has run once.
const propResultsQuery = useQuery(propResultsQueryOptions())
const propResults = computed(() => propResultsQuery.data.value?.results ?? null)

// 'none' — the user never answered this prop (added after they submitted).
// 'pending' — no winners resolved yet (or auto-resolution couldn't match the
// leaders to roster ids), so correctness is unknowable; neutral styling.
// 'correct'/'incorrect' — pick is/isn't among the resolved winners; a null
// pick ("No Team") is correct exactly when the prop resolved to no winner.
// Mirrors scorePropPicks in firebase/functions/lib/scoring.js.
function propStatus(prop) {
  const picks = componentProps.props
  if (!picks || !(prop.id in picks) || picks[prop.id] === undefined) return 'none'
  const entry = propResults.value?.[prop.id]
  if (!entry || (!entry.noWinner && !entry.winners?.length)) return 'pending'
  const picked = picks[prop.id]
  const correct = entry.noWinner ? picked === null : picked != null && entry.winners.includes(picked)
  return correct ? 'correct' : 'incorrect'
}

function propBorderClass(prop) {
  const status = propStatus(prop)
  if (status === 'correct') return 'border-emerald-500/40'
  if (status === 'incorrect') return 'border-red-500/20'
  return 'border-court-700'
}

// Earned/possible for one category's props, mirroring the wildcards header.
// Possible counts every prop the user answered; earned sums the ones whose
// status is 'correct' — the same rule the backend applies, over the same
// propResults doc, so this always matches the credited breakdown.props.
// null (rendered '–') until the prop engine has produced any results.
function catPropPoints(cat) {
  if (propResults.value == null) return null
  let earned = 0
  let possible = 0
  for (const prop of cat.props) {
    if (propStatus(prop) === 'none') continue
    possible += Number(prop.points ?? 0)
    if (propStatus(prop) === 'correct') earned += Number(prop.points ?? 0)
  }
  return { earned, possible }
}

// Whether this pick actually contains group predictions. A knockout-only
// submission (BracketView writes picks/{uid} with just `knockout`) has no
// `groups`, so the Group Standings card is hidden entirely rather than
// rendered as an empty shell — mirroring how the props section drops out
// when `props` is absent.
const hasGroups = computed(() => {
  const g = componentProps.groups
  return !!g && Object.values(g).some((arr) => Array.isArray(arr) && arr.length > 0)
})

// Once the group stage is over and the user has a bracket, the knockout
// bracket is the live, relevant thing — promote it above the now-settled
// group-stage picks (standings + best 3rd-place). Until then it stays in its
// usual position below them.
const bracketFirst = computed(
  () => componentProps.showBracket && !!componentProps.knockout && isGroupStageComplete(matches.value),
)

const groupCardRefs = reactive({})
const wildcardsSectionRef = ref(null)

defineExpose({ groupCardRefs, wildcardsSectionRef })
</script>

<template>
  <!-- flex + gap (rather than space-y) so the bracket can be promoted above the
       group-stage picks via order-first without breaking inter-section spacing. -->
  <div class="flex flex-col gap-3">

    <!-- Group & prop picks hidden until picks lock (only when gated) -->
    <div
      v-if="!showGroupsProps"
      class="bg-court-800 border border-court-700 rounded-2xl p-4 text-center text-zinc-400 text-sm"
    >
      🔒 Group & prop picks are hidden until picks lock.
    </div>

    <!-- Group Standings — single card, 2-col grid. Hidden when the pick has no
         group predictions (e.g. a knockout-only submission). -->
    <div v-if="showGroupsProps && hasGroups" class="bg-court-800 border border-court-700 rounded-2xl p-4">
      <div class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase mb-4">Group Standings</div>
      <div class="grid grid-cols-2 gap-x-5 gap-y-4">
        <div v-for="g in GROUPS" :key="g" :ref="el => { if (el) groupCardRefs[g] = el }">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[10px] font-black tracking-[0.15em] text-emerald-400">GROUP {{ g }}</span>
            <span class="text-[9px] font-mono tabular-nums" :class="groupPointsEarned(g) === null ? 'text-zinc-500' : 'text-zinc-400'">
              {{ groupPointsEarned(g) === null ? '–' : `${groupPointsEarned(g)}/${groupMaxPoints} pts` }}
            </span>
          </div>
          <div class="space-y-0.5">
            <div
              v-for="(teamId, i) in groups?.[g]" :key="i"
              class="flex items-center gap-1.5 text-[11px] transition-opacity"
              :class="rowOpacityClass(g, i)"
            >
              <span
                class="text-[9px] font-black w-4 text-right tabular-nums shrink-0"
                :class="['text-amber-400','text-zinc-400','text-amber-700','text-zinc-400'][i]"
              >{{ i + 1 }}</span>
              <span class="text-base leading-none shrink-0">{{ TEAM_BY_ID[teamId]?.flag ?? '🏳️' }}</span>
              <span class="flex items-center gap-1 min-w-0 flex-1">
                <span class="truncate" :class="rowTextClass(g, i, teamId)">{{ TEAM_BY_ID[teamId]?.name ?? teamId }}</span>
                <span class="text-[8px] text-zinc-500 font-mono shrink-0">#{{ FIFA_RANKING[TEAM_BY_ID[teamId]?.name] ?? '–' }}</span>
                <span v-if="pickStatus(g, i, teamId) === 'correct'" class="text-emerald-400 text-[10px] shrink-0">✓</span>
                <span v-else-if="pickStatus(g, i, teamId) === 'incorrect'" class="text-red-400/70 text-[10px] shrink-0">✗</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Best 3rd-Place Teams -->
    <section v-if="showGroupsProps && wildcards?.length" ref="wildcardsSectionRef">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase">Best 3rd-Place Teams</h2>
        <span class="text-[10px] font-mono tabular-nums" :class="wildcardPointsEarned === null ? 'text-zinc-500' : 'text-zinc-400'">
          {{ wildcardPointsEarned === null ? '–' : `${wildcardPointsEarned}/${wildcardPointsPossible} pts` }}
        </span>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div
          v-for="g in [...wildcards].sort()" :key="g"
          class="flex items-center gap-2 bg-court-800 border rounded-xl px-3 py-2.5"
          :class="wildcardBorderClass(g)"
        >
          <span class="text-lg leading-none">{{ TEAM_BY_ID[groups?.[g]?.[2]]?.flag ?? '🏳️' }}</span>
          <div class="min-w-0 flex-1">
            <div class="text-[9px] font-black tracking-wider text-emerald-400">Group {{ g }}</div>
            <div class="text-xs font-semibold text-white truncate">{{ TEAM_BY_ID[groups?.[g]?.[2]]?.name ?? '—' }}</div>
          </div>
          <span v-if="wildcardStatus(g) === 'correct'" class="text-emerald-400 text-xs shrink-0">✓</span>
          <span v-else-if="wildcardStatus(g) === 'incorrect'" class="text-red-400/70 text-xs shrink-0">✗</span>
        </div>
      </div>
    </section>

    <!-- Bracket hidden until the bracket locks (only when gated and there's
         bracket data that would otherwise render) -->
    <div
      v-if="!showBracket && knockout"
      class="bg-court-800 border border-court-700 rounded-2xl p-4 text-center text-zinc-400 text-sm"
    >
      🔒 Bracket is hidden until the bracket locks.
    </div>

    <!-- Knockout Bracket — promoted above the group-stage picks once the group
         stage is over (bracketFirst); otherwise sits here in normal flow. -->
    <section v-if="showBracket && knockout" :class="bracketFirst ? 'order-first' : ''">
      <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase mb-4">Knockout Bracket</h2>
      <KnockoutBracket :matches="matches" :events="liveEvents" :picks="knockout" :breakdown="knockoutBreakdown" compact />
    </section>

    <!-- Props — individual cards, grouped by category -->
    <template v-if="showGroupsProps && props">
      <section v-for="cat in propsByCategory" :key="cat.key">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase">{{ cat.label }}</h2>
          <span class="text-[10px] font-mono tabular-nums" :class="catPropPoints(cat) === null ? 'text-zinc-500' : 'text-zinc-400'">
            {{ catPropPoints(cat) === null ? '–' : `${catPropPoints(cat).earned}/${catPropPoints(cat).possible} pts` }}
          </span>
        </div>
        <div class="space-y-2">
          <div
            v-for="prop in cat.props" :key="prop.id"
            class="bg-court-800 border rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
            :class="propBorderClass(prop)"
          >
            <div class="min-w-0">
              <div class="text-[11px] text-zinc-400 mb-0.5">{{ prop.label }}</div>
              <div class="text-sm font-bold text-white truncate flex items-center gap-1">
                <template v-if="prop.type === 'player' && props[prop.id]">
                  <span>{{ TEAM_FLAG[PLAYER_BY_ID[props[prop.id]]?.team] ?? '' }}</span>
                  <span>{{ PLAYER_BY_ID[props[prop.id]]?.name ?? '—' }}</span>
                </template>
                <template v-else-if="prop.type === 'team' && props[prop.id] !== null && props[prop.id]">
                  <span>{{ TEAM_BY_ID[props[prop.id]]?.flag ?? '🏳️' }}</span>
                  <span>{{ TEAM_BY_ID[props[prop.id]]?.name }}</span>
                </template>
                <template v-else>
                  <span>{{ props[prop.id] === null ? '🚫 No Team' : '—' }}</span>
                </template>
                <span v-if="propStatus(prop) === 'correct'" class="text-emerald-400 text-[10px] shrink-0">✓</span>
                <span v-else-if="propStatus(prop) === 'incorrect'" class="text-red-400/70 text-[10px] shrink-0">✗</span>
              </div>
            </div>
            <PropPointsBadge :points="prop.points" class="shrink-0" />
          </div>
        </div>
      </section>
    </template>

  </div>
</template>

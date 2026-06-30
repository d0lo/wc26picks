<script setup>
import { computed } from 'vue'
import { TEAM_BY_ID, FIFA_RANKING, GROUP_TEAMS, TEAM_FLAG } from '../data.js'
import { useScoring } from '../composables/useScoring.js'
import { resolvePropLeaders } from '../lib/propLeaders.js'

const props = defineProps({
  matches: { type: Array, default: () => [] },
})

const { propsByCategory } = useScoring()

// One resolved leaderboard per prop, in the same category grouping/order
// PicksSummary uses for the prop catalog.
const categoriesWithLeaders = computed(() =>
  propsByCategory.value.map((cat) => ({
    ...cat,
    props: cat.props.map((prop) => ({
      ...prop,
      ...resolvePropLeaders(prop.key, props.matches),
    })),
  }))
)

function leaderName(prop, leader) {
  return leader.scorer ?? TEAM_BY_ID[leader.teamId]?.name ?? '—'
}

function teamFlag(teamId) {
  return TEAM_BY_ID[teamId]?.flag ?? '🏳️'
}

function teamName(teamId) {
  return TEAM_BY_ID[teamId]?.name ?? '—'
}

// FIFA rank of a team, shown to the right of the name like everywhere else
// (BracketView, PicksView). Null when the team isn't seeded.
function teamRank(teamId) {
  const name = TEAM_BY_ID[teamId]?.name
  return name ? (FIFA_RANKING[name] ?? null) : null
}

function leaderRank(leader) {
  return teamRank(leader.teamId)
}

// Golf-style standings: tied entries share a position and ties don't shift the
// numbering for everyone below — position = (count with a strictly higher
// metric) + 1, shown as "T1" when shared. Computed over the full standings,
// then sliced. `prop.metric` is the numeric field being ranked (goals, cards…).
function golfRows(prop) {
  const list = prop.leaders
  const val = (l) => l[prop.metric]
  return list.slice(0, prop.limit).map((leader) => {
    const rank = list.filter((l) => val(l) > val(leader)).length + 1
    const tied = list.filter((l) => val(l) === val(leader)).length > 1
    return { leader, rank, tied }
  })
}

function rankColor(rank) {
  return { 1: 'text-amber-400', 2: 'text-zinc-400', 3: 'text-amber-700' }[rank] ?? 'text-zinc-500'
}

// The other three teams sharing this team's group — the field it had to keep
// clean. Pulled from the group roster, not match records.
function groupMates(leader) {
  const own = TEAM_BY_ID[leader.teamId]?.name
  return (GROUP_TEAMS[leader.group] ?? []).filter((name) => name !== own)
}

function flagByName(name) {
  return TEAM_FLAG[name] ?? '🏳️'
}
</script>

<template>
  <div class="space-y-3">
    <div class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase">Prop Leaders</div>

    <template v-for="cat in categoriesWithLeaders" :key="cat.key">
      <div
        v-for="prop in cat.props" :key="prop.id"
        class="bg-court-800 border border-court-700 rounded-2xl px-4 py-3"
      >
        <div class="flex items-baseline gap-1.5 mb-2">
          <span class="text-[11px] text-zinc-400">{{ prop.label }}</span>
          <span v-if="prop.key === 'goldenGlove'" class="text-[9px] italic text-amber-400/80">*Unofficial</span>
        </div>

        <div v-if="!prop.computable" class="text-xs text-zinc-500 italic">
          – Can't be tracked from available data
        </div>
        <div v-else-if="!prop.leaders.length" class="text-xs text-zinc-500 italic">
          – No data yet
        </div>

        <!-- Ranked standings (Golden Boot, Most Goals) — golf-style ties -->
        <div v-else-if="prop.ranked" class="space-y-1.5">
          <div
            v-for="(row, i) in golfRows(prop)" :key="i"
            class="flex items-center gap-1.5 text-[11px]"
          >
            <span class="text-[9px] font-black w-6 text-right tabular-nums shrink-0" :class="rankColor(row.rank)">{{ row.tied ? 'T' : '' }}{{ row.rank }}</span>
            <span class="text-base leading-none shrink-0">{{ teamFlag(row.leader.teamId) }}</span>
            <span class="truncate min-w-0 text-white font-bold">{{ leaderName(prop, row.leader) }}</span>
            <span v-if="leaderRank(row.leader)" class="text-[9px] text-zinc-500 font-mono shrink-0">#{{ leaderRank(row.leader) }}</span>
            <span class="text-[9px] text-zinc-500 font-mono shrink-0 ml-auto">
              <template v-if="prop.key === 'goldenGlove'">{{ row.leader.saves }} sv · {{ row.leader.cleanSheets }} CS</template>
              <template v-else>{{ row.leader[prop.metric] }} {{ prop.unit }}{{ row.leader[prop.metric] === 1 ? '' : 's' }}</template>
            </span>
          </div>
        </div>

        <!-- Hat Trick — show who it was scored against, not a goal count -->
        <div v-else-if="prop.key === 'hatTrickScorer'" class="space-y-1.5">
          <div
            v-for="(leader, i) in prop.leaders" :key="i"
            class="flex items-center gap-1.5 text-[11px]"
          >
            <span class="text-base leading-none shrink-0">{{ teamFlag(leader.teamId) }}</span>
            <span class="truncate min-w-0 text-white font-bold">{{ leader.scorer }}</span>
            <span class="flex items-center gap-1 shrink-0 ml-auto text-[9px] text-zinc-400">
              <span>vs</span>
              <template v-if="leader.opponents.length === 1">
                <span class="text-sm leading-none">{{ teamFlag(leader.opponents[0]) }}</span>
                <span class="font-bold text-zinc-300">{{ teamName(leader.opponents[0]) }}</span>
                <span v-if="teamRank(leader.opponents[0])" class="text-zinc-500 font-mono">#{{ teamRank(leader.opponents[0]) }}</span>
              </template>
              <template v-else>
                <span v-for="(opp, j) in leader.opponents" :key="j" class="text-sm leading-none">{{ teamFlag(opp) }}<span v-if="j < leader.opponents.length - 1" class="text-zinc-500">,</span></span>
              </template>
            </span>
          </div>
        </div>

        <!-- Clean Group — show the group and the opponents kept scoreless -->
        <div v-else-if="prop.key === 'cleanGroupTeam'" class="space-y-1.5">
          <div
            v-for="(leader, i) in prop.leaders" :key="i"
            class="flex items-center gap-1.5 text-[11px]"
          >
            <span class="text-base leading-none shrink-0">{{ teamFlag(leader.teamId) }}</span>
            <span class="truncate min-w-0 text-white font-bold">{{ teamName(leader.teamId) }}</span>
            <span v-if="leaderRank(leader)" class="text-[9px] text-zinc-500 font-mono shrink-0">#{{ leaderRank(leader) }}</span>
            <span class="flex items-center gap-1.5 shrink-0 ml-auto">
              <span class="text-[9px] font-black tracking-[0.15em] text-emerald-400">GROUP {{ leader.group }}</span>
              <span class="flex items-center gap-0.5">
                <span v-for="(mate, j) in groupMates(leader)" :key="j" class="text-sm leading-none">{{ flagByName(mate) }}</span>
              </span>
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { TEAM_BY_ID } from '../data.js'
import { useScoring } from '../composables/useScoring.js'
import { resolvePropLeaders } from '../lib/propLeaders.js'

const props = defineProps({
  matches: { type: Array, default: () => [] },
})

const { propsByCategory } = useScoring()

const MAX_LEADERS = 3

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

function leaderFlag(leader) {
  return TEAM_BY_ID[leader.teamId]?.flag ?? '🏳️'
}

function leaderStat(prop, leader) {
  if (prop.key === 'cleanGroupTeam') return `${leader.cleanSheets}/${leader.played} clean sheets`
  return `${leader.goals} goal${leader.goals === 1 ? '' : 's'}`
}
</script>

<template>
  <div class="space-y-3">
    <div class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase">Prop Leaders — Live</div>

    <template v-for="cat in categoriesWithLeaders" :key="cat.key">
      <div
        v-for="prop in cat.props" :key="prop.id"
        class="bg-court-800 border border-court-700 rounded-2xl px-4 py-3"
      >
        <div class="text-[11px] text-zinc-400 mb-2">{{ prop.label }}</div>

        <div v-if="!prop.computable" class="text-xs text-zinc-500 italic">
          – Can't be tracked from available data
        </div>
        <div v-else-if="!prop.leaders.length" class="text-xs text-zinc-500 italic">
          – No data yet
        </div>
        <div v-else class="space-y-1.5">
          <div
            v-for="(leader, i) in prop.leaders.slice(0, MAX_LEADERS)" :key="i"
            class="flex items-center gap-1.5 text-[11px]"
          >
            <span class="text-[9px] font-black w-4 text-right tabular-nums shrink-0" :class="['text-amber-400','text-zinc-400','text-amber-700'][i]">{{ i + 1 }}</span>
            <span class="text-base leading-none shrink-0">{{ leaderFlag(leader) }}</span>
            <span class="truncate min-w-0 flex-1 text-white font-bold">{{ leaderName(prop, leader) }}</span>
            <span class="text-[9px] text-zinc-500 font-mono shrink-0">{{ leaderStat(prop, leader) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

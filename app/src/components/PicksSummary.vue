<script setup>
import { reactive, ref } from 'vue'
import { GROUPS, PROPS, TEAM_FLAG, TEAM_BY_ID } from '../data.js'
import { ROSTERS } from '../rosters.js'

defineProps({
  groups: Object,    // { A: [uuid1, uuid2, uuid3, uuid4], ... }
  wildcards: Array,  // [groupLetters]
  props: Object,     // { goldenBoot: uuid, ... }
})

const PLAYER_BY_ID = {}
for (const [teamName, players] of Object.entries(ROSTERS)) {
  for (const p of players) PLAYER_BY_ID[p.id] = { ...p, team: teamName }
}

const groupCardRefs = reactive({})
const wildcardsSectionRef = ref(null)

defineExpose({ groupCardRefs, wildcardsSectionRef })
</script>

<template>
  <div class="space-y-3">

    <!-- Group Standings — single card, 2-col grid -->
    <div class="bg-court-800 border border-court-700 rounded-2xl p-4">
      <div class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase mb-4">Group Standings</div>
      <div class="grid grid-cols-2 gap-x-5 gap-y-4">
        <div v-for="g in GROUPS" :key="g" :ref="el => { if (el) groupCardRefs[g] = el }">
          <div class="text-[10px] font-black tracking-[0.15em] text-emerald-400 mb-1.5">GROUP {{ g }}</div>
          <div class="space-y-0.5">
            <div
              v-for="(teamId, i) in groups?.[g]" :key="i"
              class="flex items-center gap-1.5 text-[11px] transition-opacity"
              :class="(i === 3 || (i === 2 && !wildcards?.includes(g))) ? 'opacity-30' : ''"
            >
              <span
                class="text-[9px] font-black w-4 text-right tabular-nums shrink-0"
                :class="['text-amber-400','text-zinc-400','text-amber-700','text-zinc-400'][i]"
              >{{ i + 1 }}</span>
              <span class="text-base leading-none shrink-0">{{ TEAM_BY_ID[teamId]?.flag ?? '🏳️' }}</span>
              <span
                class="truncate"
                :class="i < 2 || (i === 2 && wildcards?.includes(g)) ? 'text-white font-bold' : 'text-zinc-300'"
              >{{ TEAM_BY_ID[teamId]?.name ?? teamId }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Best 3rd-Place Teams — single card, flex-wrap chips -->
    <div v-if="wildcards?.length" ref="wildcardsSectionRef" class="bg-court-800 border border-court-700 rounded-2xl p-4">
      <div class="flex items-baseline justify-between mb-3">
        <div class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase">Best 3rd-Place Teams</div>
        <span class="text-[10px] text-zinc-400 font-mono">2 pts each</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <div
          v-for="g in [...wildcards].sort()" :key="g"
          class="flex items-center gap-1.5 bg-court-700 border border-court-600 rounded-xl px-2.5 py-1.5"
        >
          <span class="text-sm leading-none">{{ TEAM_BY_ID[groups?.[g]?.[2]]?.flag ?? '🏳️' }}</span>
          <span class="text-[10px] font-black text-emerald-400">{{ g }}</span>
          <span class="text-xs text-zinc-300">{{ TEAM_BY_ID[groups?.[g]?.[2]]?.name }}</span>
        </div>
      </div>
    </div>

    <!-- Group Stage Props — single card, divide-y rows -->
    <div v-if="props" class="bg-court-800 border border-court-700 rounded-2xl p-4">
      <div class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase mb-3">Group Stage Props</div>
      <div class="divide-y divide-court-700">
        <div v-for="prop in PROPS" :key="prop.key" class="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <div class="shrink-0">
            <div class="text-[11px] text-zinc-400">{{ prop.label }}</div>
            <div class="text-[10px] text-amber-400/60 font-mono">{{ prop.points }}pt{{ prop.points !== 1 ? 's' : '' }}</div>
          </div>
          <div class="text-[11px] text-right text-white font-medium flex items-center gap-1 justify-end">
            <template v-if="prop.type === 'player' && props[prop.key]">
              <span>{{ TEAM_FLAG[PLAYER_BY_ID[props[prop.key]]?.team] ?? '' }}</span>
              <span>{{ PLAYER_BY_ID[props[prop.key]]?.name ?? '—' }}</span>
            </template>
            <template v-else-if="prop.type === 'team' && props[prop.key] !== null && props[prop.key]">
              <span>{{ TEAM_BY_ID[props[prop.key]]?.flag ?? '🏳️' }}</span>
              <span>{{ TEAM_BY_ID[props[prop.key]]?.name }}</span>
            </template>
            <template v-else>
              <span>{{ props[prop.key] === null ? '🚫 No Team' : '—' }}</span>
            </template>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

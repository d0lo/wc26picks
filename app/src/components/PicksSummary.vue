<script setup>
import { reactive, ref } from 'vue'
import { GROUPS, TEAM_FLAG, TEAM_BY_ID, FIFA_RANKING } from '../data.js'
import { ROSTERS } from '../rosters.js'
import { useScoring } from '../composables/useScoring.js'
import PropPointsBadge from './PropPointsBadge.vue'

defineProps({
  groups: Object,    // { A: [uuid1, uuid2, uuid3, uuid4], ... }
  wildcards: Array,  // [groupLetters]
  props: Object,     // { goldenBoot: uuid, ... }
})

const PLAYER_BY_ID = {}
for (const [teamName, players] of Object.entries(ROSTERS)) {
  for (const p of players) PLAYER_BY_ID[p.id] = { ...p, team: teamName }
}

const { propsByCategory } = useScoring()

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
              <span class="flex items-center gap-1 min-w-0 flex-1">
                <span
                  class="truncate"
                  :class="i < 2 || (i === 2 && wildcards?.includes(g)) ? 'text-white font-bold' : 'text-zinc-300'"
                >{{ TEAM_BY_ID[teamId]?.name ?? teamId }}</span>
                <span class="text-[8px] text-zinc-500 font-mono shrink-0">#{{ FIFA_RANKING[TEAM_BY_ID[teamId]?.name] ?? '–' }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Best 3rd-Place Teams -->
    <section v-if="wildcards?.length" ref="wildcardsSectionRef">
      <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase mb-4">Best 3rd-Place Teams</h2>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div
          v-for="g in [...wildcards].sort()" :key="g"
          class="flex items-center gap-2 bg-court-800 border border-court-700 rounded-xl px-3 py-2.5"
        >
          <span class="text-lg leading-none">{{ TEAM_BY_ID[groups?.[g]?.[2]]?.flag ?? '🏳️' }}</span>
          <div>
            <div class="text-[9px] font-black tracking-wider text-emerald-400">Group {{ g }}</div>
            <div class="text-xs font-semibold text-white truncate">{{ TEAM_BY_ID[groups?.[g]?.[2]]?.name ?? '—' }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Props — individual cards, grouped by category -->
    <template v-if="props">
      <section v-for="cat in propsByCategory" :key="cat.key">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase mb-4">{{ cat.label }}</h2>
        <div class="space-y-2">
          <div
            v-for="prop in cat.props" :key="prop.id"
            class="bg-court-800 border border-court-700 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
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
              </div>
            </div>
            <PropPointsBadge :points="prop.points" class="shrink-0" />
          </div>
        </div>
      </section>
    </template>

  </div>
</template>

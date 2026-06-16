<script setup>
import { GROUPS, PROPS, TEAM_FLAG, TEAM_BY_ID } from '../data.js'
import { ROSTERS } from '../rosters.js'

defineProps({
  groups: Object,    // { A: [uuid1, uuid2, uuid3, uuid4], ... }
  wildcards: Array,  // [groupLetters]
  props: Object,     // { goldenBoot: uuid, ... }
})

// Build player-by-id lookup
const PLAYER_BY_ID = {}
for (const [teamName, players] of Object.entries(ROSTERS)) {
  for (const p of players) PLAYER_BY_ID[p.id] = { ...p, team: teamName }
}

const POS_COLORS = [
  'bg-amber-400 text-zinc-900',
  'bg-zinc-300 text-zinc-900',
  'bg-amber-700 text-amber-100',
  'bg-zinc-700 text-zinc-300',
]

function propDisplay(propDef, propsData) {
  const val = propsData?.[propDef.key]
  if (val === null || val === undefined || val === '') return { flag: '', text: '—' }
  if (propDef.type === 'player') {
    const p = PLAYER_BY_ID[val]
    return p ? { flag: TEAM_FLAG[p.team] ?? '', text: p.name } : { flag: '', text: '—' }
  }
  if (propDef.type === 'team') {
    if (val === null) return { flag: '🚫', text: 'No Team' }
    const t = TEAM_BY_ID[val]
    return t ? { flag: t.flag, text: t.name } : { flag: '', text: '—' }
  }
  return { flag: '', text: String(val) }
}
</script>

<template>
  <div class="space-y-6">

    <!-- Section 1: Group Standings -->
    <section>
      <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase mb-4">Group Standings</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          v-for="group in GROUPS"
          :key="group"
          class="rounded-2xl border p-4 bg-court-800 border-court-700"
        >
          <div class="text-[10px] font-black tracking-[0.2em] text-emerald-400 mb-3">GROUP {{ group }}</div>
          <div class="space-y-1.5">
            <div
              v-for="(teamId, idx) in groups?.[group]"
              :key="teamId"
              class="flex items-center gap-2"
            >
              <div
                class="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0"
                :class="POS_COLORS[idx]"
              >{{ idx + 1 }}</div>
              <span class="text-base leading-none shrink-0">{{ TEAM_BY_ID[teamId]?.flag ?? '🏳️' }}</span>
              <span class="text-xs font-medium text-white flex-1 truncate">{{ TEAM_BY_ID[teamId]?.name ?? teamId }}</span>
              <span
                v-if="idx === 2 && wildcards?.includes(group)"
                class="text-[9px] font-black tracking-wider text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-1.5 py-0.5 shrink-0"
              >WC</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 2: Best 3rd-Place Teams -->
    <section v-if="wildcards?.length">
      <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase mb-4">Best 3rd-Place Teams</h2>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div
          v-for="group in [...(wildcards ?? [])].sort()"
          :key="group"
          class="flex items-center gap-2 bg-emerald-500/10 border border-emerald-400/20 rounded-xl px-3 py-2.5"
        >
          <span class="text-lg leading-none">{{ TEAM_BY_ID[groups?.[group]?.[2]]?.flag ?? '🏳️' }}</span>
          <div>
            <div class="text-[9px] font-black tracking-wider text-emerald-400">Group {{ group }}</div>
            <div class="text-xs font-semibold text-white truncate">{{ TEAM_BY_ID[groups?.[group]?.[2]]?.name ?? '—' }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 3: Group Stage Props -->
    <section v-if="props">
      <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase mb-4">Group Stage Props</h2>
      <div class="space-y-2">
        <div
          v-for="prop in PROPS"
          :key="prop.key"
          class="bg-court-800 border border-court-700 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
        >
          <div class="min-w-0">
            <div class="text-[11px] text-zinc-400 mb-0.5">{{ prop.label }}</div>
            <div class="text-sm font-bold text-white truncate flex items-center gap-1">
              <span v-if="propDisplay(prop, props).flag">{{ propDisplay(prop, props).flag }}</span>
              <span>{{ propDisplay(prop, props).text }}</span>
            </div>
          </div>
          <div class="shrink-0 text-[10px] font-black text-amber-400/60 bg-amber-400/5 border border-amber-400/10 rounded-full px-2 py-0.5 font-mono leading-5">
            {{ prop.points }}pt{{ prop.points !== 1 ? 's' : '' }}
          </div>
        </div>
      </div>
    </section>

  </div>
</template>

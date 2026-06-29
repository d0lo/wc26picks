<script setup>
import { GROUPS, GROUP_TEAMS, TEAM_ID, TEAM_BY_ID } from '../data.js'

defineProps({
  groups: { type: Object, default: () => ({}) }, // { A: { letter, entries, complete? }, ... } from groups/{letter}
})

// Before a group's first match completes there's no groups/{letter} doc yet
// — fall back to the seeded GROUP_TEAMS order so the board still shows all
// 12 groups, just without ranks/points.
function rowsFor(letter, groupDoc) {
  if (groupDoc?.entries?.length) return groupDoc.entries
  return GROUP_TEAMS[letter].map((name) => ({ team: { id: TEAM_ID[name], name }, gamesPlayed: null, points: null, goalDiff: null }))
}
</script>

<template>
  <div class="bg-court-800 border border-court-700 rounded-2xl p-4">
    <div class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase mb-4">Group Standings — Live</div>
    <div class="grid grid-cols-2 gap-x-5 gap-y-4">
      <div v-for="g in GROUPS" :key="g">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] font-black tracking-[0.15em] text-emerald-400">GROUP {{ g }}</span>
          <span
            v-if="groups[g]?.complete"
            class="text-[8px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded-full text-zinc-400 bg-white/5"
          >Final</span>
          <span v-else-if="!groups[g]" class="text-[8px] text-zinc-500">Not started</span>
        </div>
        <div class="space-y-0.5">
          <div
            v-for="(entry, i) in rowsFor(g, groups[g])" :key="entry.team.id"
            class="flex items-center gap-1.5 text-[11px]"
          >
            <span
              class="text-[9px] font-black w-4 text-right tabular-nums shrink-0"
              :class="entry.points === null ? 'text-zinc-500' : ['text-amber-400','text-zinc-400','text-amber-700','text-zinc-400'][i]"
            >{{ i + 1 }}</span>
            <span class="text-base leading-none shrink-0">{{ TEAM_BY_ID[entry.team.id]?.flag ?? '🏳️' }}</span>
            <span class="truncate min-w-0 flex-1" :class="i < 2 ? 'text-white font-bold' : 'text-zinc-300'">{{ TEAM_BY_ID[entry.team.id]?.name ?? entry.team.name }}</span>
            <span class="text-[9px] text-zinc-500 font-mono tabular-nums shrink-0">{{ entry.points === null ? '–' : `${entry.points} pt${entry.points === 1 ? '' : 's'}` }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

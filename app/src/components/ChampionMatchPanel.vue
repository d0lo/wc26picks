<script setup>
// A single match panel for the champion hero: two stacked team rows (each on a
// full-width row so names never truncate), with the champion's row highlighted.
// Used for both the live match (showScore) and the next match (vs chip). Keeps
// the team-row markup, the venue pin, and the "no score yet → –" rule in one
// place instead of duplicating them per state.
const props = defineProps({
  fixture: { type: Object, required: true },   // lib/fixtures.js fixture: { teams, venue, ... }
  championId: { type: String, default: null },
  showScore: { type: Boolean, default: false }, // live match → show per-row score
  subtitle: { type: String, default: '' },       // e.g. "Round of 32 · Fri, Jul 3, 6:00 PM"
})

const isChamp = (t) => t?.teamId === props.championId
</script>

<template>
  <div>
    <div class="relative rounded-2xl bg-court-900/50 border border-court-700/60 overflow-hidden divide-y divide-court-700/50">
      <div
        v-for="(t, i) in fixture.teams" :key="i"
        class="flex items-center gap-2.5 px-4 py-2.5"
        :class="isChamp(t) ? 'bg-emerald-500/5' : ''"
      >
        <span class="text-2xl leading-none shrink-0">{{ t?.flag ?? '🏳️' }}</span>
        <span class="flex-1 min-w-0 truncate text-sm font-bold" :class="isChamp(t) ? 'text-emerald-300' : 'text-white'">{{ t?.name ?? 'TBD' }}</span>
        <!-- Distinguish "no score data yet" (null → –) from a real 0. -->
        <span v-if="showScore" class="shrink-0 text-xl font-black text-white tabular-nums">{{ t?.score == null ? '–' : t.score }}</span>
      </div>
      <span
        v-if="!showScore"
        class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-court-900 border border-court-700/60 px-2 py-0.5 text-[9px] font-black text-zinc-400 uppercase tracking-wider"
      >vs</span>
    </div>

    <div v-if="subtitle" class="mt-2 text-center text-[11px] text-zinc-400 whitespace-nowrap overflow-hidden text-ellipsis">{{ subtitle }}</div>
    <div v-if="fixture.venue" class="mt-1 flex items-center justify-center gap-1 text-[11px] text-zinc-500">
      <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      <span class="truncate">{{ fixture.venue }}</span>
    </div>
  </div>
</template>

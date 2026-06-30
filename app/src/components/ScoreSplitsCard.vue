<script setup>
import { computed } from 'vue'
import { TEAM_BY_ID } from '../data.js'
import { scoreSplitSummary } from '../lib/matchFacts.js'

const props = defineProps({
  matches: { type: Array, default: () => [] },
})

const summary = computed(() => scoreSplitSummary(props.matches))

function teamFlag(teamId) {
  return TEAM_BY_ID[teamId]?.flag ?? '🏳️'
}

function teamName(match, i) {
  const c = match.competitors?.[i]
  return TEAM_BY_ID[c?.teamId]?.name ?? c?.name ?? '?'
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="space-y-3">
    <div class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase">Score Splits</div>

    <div class="bg-court-800 border border-court-700 rounded-2xl px-4 py-3">
      <div class="text-[11px] text-zinc-400 mb-3">
        Games 1–0 at 70′ that finished 1–1 <span class="text-zinc-500">· regulation only, extra time ignored</span>
      </div>

      <div class="flex items-baseline gap-2 mb-4">
        <div class="text-3xl font-black tabular-nums leading-none">
          <span class="text-emerald-400">{{ summary.finished1_1 }}</span><span class="text-zinc-600">/</span><span class="text-white">{{ summary.total }}</span>
        </div>
        <div class="text-[9px] uppercase tracking-wider text-zinc-500">finished 1–1 of 1–0 at 70′</div>
      </div>

      <div v-if="!summary.total" class="text-xs text-zinc-500 italic">– No games yet</div>

      <!-- Aligned scoreboard grid: team A right-aligned against a centered
           score, team B left, date in its own column. Score is green when the
           game finished 1–1 (a "hit"). -->
      <div
        v-else
        class="grid items-center gap-x-2.5 gap-y-2 text-[11px]"
        style="grid-template-columns: auto auto auto minmax(0, 1fr) auto;"
      >
        <template v-for="(g, i) in summary.games" :key="i">
          <span class="text-xs" :class="g.finished1_1 ? 'text-emerald-400' : 'text-zinc-600'">{{ g.finished1_1 ? '✓' : '✗' }}</span>

          <span class="flex items-center gap-1.5 justify-self-end whitespace-nowrap">
            <span class="text-white font-bold">{{ teamName(g.match, 0) }}</span>
            <span class="text-sm leading-none">{{ teamFlag(g.match.competitors?.[0]?.teamId) }}</span>
          </span>

          <span class="font-mono tabular-nums font-bold text-center" :class="g.finished1_1 ? 'text-emerald-400' : 'text-zinc-300'">{{ g.regulationFinal[0] }}–{{ g.regulationFinal[1] }}</span>

          <span class="flex items-center gap-1.5 min-w-0">
            <span class="text-sm leading-none shrink-0">{{ teamFlag(g.match.competitors?.[1]?.teamId) }}</span>
            <span class="text-white font-bold truncate">{{ teamName(g.match, 1) }}</span>
          </span>

          <span class="text-[10px] text-zinc-500 text-right whitespace-nowrap">{{ fmtDate(g.date) }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

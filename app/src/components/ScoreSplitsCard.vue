<script setup>
import { computed } from 'vue'
import { TEAM_BY_ID, FIFA_RANKING } from '../data.js'
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

function teamRank(match, i) {
  const name = TEAM_BY_ID[match.competitors?.[i]?.teamId]?.name
  return name ? (FIFA_RANKING[name] ?? null) : null
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

      <div class="flex items-baseline gap-2 mb-3">
        <div class="text-3xl font-black tabular-nums leading-none">
          <span class="text-emerald-400">{{ summary.finished1_1 }}</span><span class="text-zinc-600">/</span><span class="text-white">{{ summary.total }}</span>
        </div>
        <div class="text-[9px] uppercase tracking-wider text-zinc-500">finished 1–1 of 1–0 at 70′</div>
      </div>

      <div v-if="!summary.total" class="text-xs text-zinc-500 italic">– No games yet</div>
      <div v-else class="space-y-1.5">
        <div
          v-for="(g, i) in summary.games" :key="i"
          class="flex items-center gap-2 text-[11px]"
        >
          <span class="shrink-0 w-3 text-center" :class="g.finished1_1 ? 'text-emerald-400' : 'text-zinc-600'">{{ g.finished1_1 ? '✓' : '✗' }}</span>

          <span class="flex items-center gap-1 shrink-0">
            <span class="text-sm leading-none shrink-0">{{ teamFlag(g.match.competitors?.[0]?.teamId) }}</span>
            <span class="text-white font-bold whitespace-nowrap">{{ teamName(g.match, 0) }}</span>
            <span v-if="teamRank(g.match, 0)" class="text-[9px] text-zinc-500 font-mono shrink-0">#{{ teamRank(g.match, 0) }}</span>
          </span>

          <span class="text-zinc-400 font-mono tabular-nums shrink-0">{{ g.regulationFinal[0] }}–{{ g.regulationFinal[1] }}</span>

          <span class="flex items-center gap-1 min-w-0">
            <span class="text-sm leading-none shrink-0">{{ teamFlag(g.match.competitors?.[1]?.teamId) }}</span>
            <span class="text-white font-bold truncate">{{ teamName(g.match, 1) }}</span>
            <span v-if="teamRank(g.match, 1)" class="text-[9px] text-zinc-500 font-mono shrink-0">#{{ teamRank(g.match, 1) }}</span>
          </span>

          <span class="text-[9px] text-zinc-500 shrink-0 ml-auto">{{ fmtDate(g.date) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

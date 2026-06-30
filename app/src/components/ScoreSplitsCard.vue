<script setup>
import { computed } from 'vue'
import { scoreSplitSummary } from '../lib/matchFacts.js'

const props = defineProps({
  matches: { type: Array, default: () => [] },
})

const summary = computed(() => scoreSplitSummary(props.matches))

function abbr(match, i) {
  const c = match.competitors?.[i]
  return c?.abbreviation || c?.name || '?'
}
</script>

<template>
  <div class="space-y-3">
    <div class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase">Score Splits</div>

    <div class="bg-court-800 border border-court-700 rounded-2xl px-4 py-3">
      <div class="text-[11px] text-zinc-400 mb-3">
        Games 1–0 at 70′ that finished 1–1 <span class="text-zinc-500">· regulation only, extra time ignored</span>
      </div>

      <div class="flex items-center gap-4 mb-3">
        <div>
          <div class="text-2xl font-black text-white tabular-nums leading-none">{{ summary.total }}</div>
          <div class="text-[9px] uppercase tracking-wider text-zinc-500 mt-1">1–0 at 70′</div>
        </div>
        <div class="text-zinc-600 text-lg">→</div>
        <div>
          <div class="text-2xl font-black text-emerald-400 tabular-nums leading-none">{{ summary.finished1_1 }}</div>
          <div class="text-[9px] uppercase tracking-wider text-zinc-500 mt-1">finished 1–1</div>
        </div>
      </div>

      <div v-if="!summary.total" class="text-xs text-zinc-500 italic">– No games yet</div>
      <div v-else class="space-y-1.5">
        <div
          v-for="(g, i) in summary.games" :key="i"
          class="flex items-center gap-2 text-[11px]"
        >
          <span class="shrink-0 w-3 text-center" :class="g.finished1_1 ? 'text-emerald-400' : 'text-zinc-600'">{{ g.finished1_1 ? '✓' : '✗' }}</span>
          <span class="text-white font-bold">{{ abbr(g.match, 0) }}</span>
          <span class="text-zinc-400 font-mono tabular-nums">{{ g.regulationFinal[0] }}–{{ g.regulationFinal[1] }}</span>
          <span class="text-white font-bold">{{ abbr(g.match, 1) }}</span>
          <span class="text-[9px] text-zinc-500 ml-auto">{{ g.finished1_1 ? 'hit' : 'no' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

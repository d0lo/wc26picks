<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { scoreboardQueryOptions, startScoreboardListener, stopScoreboardListener } from '../queries.js'
import LiveScoreboard from '../components/LiveScoreboard.vue'

const queryClient = useQueryClient()
const scoreboardQuery = useQuery(scoreboardQueryOptions())
const events = computed(() => scoreboardQuery.data.value?.events ?? [])
const hasMatches = computed(() => scoreboardQuery.data.value?.hasMatches ?? null)

onMounted(() => startScoreboardListener(queryClient))
onUnmounted(() => stopScoreboardListener())
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 pt-8 pb-8">
    <div v-if="hasMatches === false" class="text-center pt-8">
      <div class="text-4xl mb-4">⚡</div>
      <h1 class="text-xl font-black text-white mb-2">Live Results</h1>
      <p class="text-sm text-zinc-400">No matches today. Check back during the next match window.</p>
    </div>
    <LiveScoreboard v-else :events="events" />
  </div>
</template>

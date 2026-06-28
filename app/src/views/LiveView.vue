<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { scoreboardQueryOptions, groupsQueryOptions, matchesQueryOptions, startScoreboardListener, stopScoreboardListener } from '../queries.js'
import LiveScoreboard from '../components/LiveScoreboard.vue'
import GroupStandingsBoard from '../components/GroupStandingsBoard.vue'
import PropLeaderboard from '../components/PropLeaderboard.vue'

const queryClient = useQueryClient()
const scoreboardQuery = useQuery(scoreboardQueryOptions())
const groupsQuery = useQuery(groupsQueryOptions())
const matchesQuery = useQuery(matchesQueryOptions())
const events = computed(() => scoreboardQuery.data.value?.events ?? [])
const hasMatches = computed(() => scoreboardQuery.data.value?.hasMatches ?? null)
const groups = computed(() => groupsQuery.data.value ?? {})
const matches = computed(() => matchesQuery.data.value ?? [])

onMounted(() => startScoreboardListener(queryClient))
onUnmounted(() => stopScoreboardListener())
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 pt-8 pb-8 space-y-6">
    <div v-if="hasMatches === false" class="text-center pt-8">
      <div class="text-4xl mb-4">⚡</div>
      <h1 class="text-xl font-black text-white mb-2">Live Results</h1>
      <p class="text-sm text-zinc-400">No matches today. Check back during the next match window.</p>
    </div>
    <LiveScoreboard v-else :events="events" />

    <GroupStandingsBoard :groups="groups" />
    <PropLeaderboard :matches="matches" />
  </div>
</template>

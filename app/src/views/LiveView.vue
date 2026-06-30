<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { scoreboardQueryOptions, scheduleQueryOptions, groupsQueryOptions, matchesQueryOptions, startScoreboardListener, stopScoreboardListener } from '../queries.js'
import MatchSchedule from '../components/MatchSchedule.vue'
import GroupStandingsBoard from '../components/GroupStandingsBoard.vue'
import PropLeaderboard from '../components/PropLeaderboard.vue'
import ScoreSplitsCard from '../components/ScoreSplitsCard.vue'
import KnockoutBracket from '../components/KnockoutBracket.vue'

const queryClient = useQueryClient()
const scoreboardQuery = useQuery(scoreboardQueryOptions())
const scheduleQuery = useQuery(scheduleQueryOptions())
const groupsQuery = useQuery(groupsQueryOptions())
const matchesQuery = useQuery(matchesQueryOptions())
const events = computed(() => scoreboardQuery.data.value?.events ?? [])
const schedule = computed(() => scheduleQuery.data.value?.events ?? [])
const groups = computed(() => groupsQuery.data.value ?? {})
const matches = computed(() => matchesQuery.data.value ?? [])

onMounted(() => startScoreboardListener(queryClient))
onUnmounted(() => stopScoreboardListener())
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 pt-8 pb-8 space-y-6">
    <MatchSchedule :matches="matches" :events="events" :schedule="schedule" />

    <section v-if="matches.some((m) => m.round)">
      <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase mb-3">Knockout Bracket</h2>
      <KnockoutBracket :matches="matches" :events="events" compact />
    </section>

    <GroupStandingsBoard :groups="groups" />
    <PropLeaderboard :matches="matches" />
    <ScoreSplitsCard :matches="matches" />
  </div>
</template>

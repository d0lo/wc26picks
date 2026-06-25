<script setup>
import { computed } from 'vue'
import { TEAM_BY_ID } from '../data.js'

const props = defineProps({
  events: { type: Array, default: () => [] },
})

const STATE_LABEL = {
  pre: 'Upcoming',
  in: 'Live',
  post: 'Final',
}

function kickoffTime(isoDate) {
  return new Date(isoDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function teamDisplay(competitor) {
  const known = TEAM_BY_ID[competitor.teamId]
  return {
    flag: known?.flag ?? '🏳️',
    name: known?.name ?? competitor.name ?? competitor.abbreviation,
  }
}

const sortedEvents = computed(() =>
  [...props.events].sort((a, b) => new Date(a.date) - new Date(b.date))
)
</script>

<template>
  <div class="space-y-3">
    <div class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase">Today's Matches</div>

    <div v-if="!sortedEvents.length" class="bg-court-800 border border-court-700 rounded-2xl p-4 text-center text-xs text-zinc-400">
      No matches scheduled today.
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div
        v-for="event in sortedEvents" :key="event.id"
        class="bg-court-800 border border-court-700 rounded-2xl p-4"
      >
        <div class="flex items-center justify-between mb-3">
          <span class="text-[9px] font-black tracking-wider text-emerald-400 uppercase">{{ event.group ?? '' }}</span>
          <span
            class="text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full"
            :class="event.status.state === 'in'
              ? 'text-amber-400 bg-amber-400/10'
              : event.status.state === 'post'
                ? 'text-zinc-400 bg-white/5'
                : 'text-emerald-400 bg-emerald-400/10'"
          >{{ event.status.state === 'in' ? (event.status.displayClock || STATE_LABEL.in) : STATE_LABEL[event.status.state] }}</span>
        </div>

        <div class="space-y-1.5">
          <div
            v-for="competitor in event.competitors" :key="competitor.teamId"
            class="flex items-center justify-between gap-2"
          >
            <span class="flex items-center gap-1.5 min-w-0">
              <span class="text-base leading-none shrink-0">{{ teamDisplay(competitor).flag }}</span>
              <span class="text-sm font-bold text-white truncate">{{ teamDisplay(competitor).name }}</span>
            </span>
            <span class="text-sm font-black text-white tabular-nums shrink-0">
              {{ event.status.state === 'pre' ? '' : (competitor.score ?? 0) }}
            </span>
          </div>
        </div>

        <div v-if="event.status.state === 'pre'" class="mt-3 text-[10px] text-zinc-500 font-mono">
          {{ kickoffTime(event.date) }}
        </div>
        <div v-else-if="event.venue.fullName" class="mt-3 text-[10px] text-zinc-500 truncate">
          {{ event.venue.fullName }}<template v-if="event.venue.city">, {{ event.venue.city }}</template>
        </div>
      </div>
    </div>
  </div>
</template>

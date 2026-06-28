<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { buildFixtures, fixtureDays } from '../lib/fixtures.js'

// FotMob-style schedule: a horizontal date selector across every match day, and
// the selected day's matches grouped by round/competition. Builds the unified
// fixture list (past + live + future) from matches/* and the static knockout
// schedule — see lib/fixtures.js.
const props = defineProps({
  matches: { type: Array, default: () => [] },
  events: { type: Array, default: () => [] },   // today's liveData/scoreboard events
})

const fixtures = computed(() => buildFixtures(props.matches, props.events))
const days = computed(() => fixtureDays(fixtures.value))

function dayDate(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const todayKey = computed(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }))
function dayDiff(key) {
  return Math.round((dayDate(key) - dayDate(todayKey.value)) / 86400000)
}
function dayLabel(key) {
  const diff = dayDiff(key)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  return dayDate(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Default to today if it has matches, else the next upcoming day, else the last.
const defaultDay = computed(() => {
  const ds = days.value
  if (!ds.length) return null
  if (ds.includes(todayKey.value)) return todayKey.value
  return ds.find((k) => k >= todayKey.value) ?? ds[ds.length - 1]
})

const selectedDay = ref(null)
watch(defaultDay, (d) => { if (d && selectedDay.value == null) selectedDay.value = d }, { immediate: true })
watch(days, (ds) => { if (selectedDay.value && !ds.includes(selectedDay.value)) selectedDay.value = defaultDay.value })

const selectorRef = ref(null)
watch(selectedDay, async () => {
  await nextTick()
  selectorRef.value?.querySelector('[data-selected]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
}, { immediate: true })

const dayFixtures = computed(() => fixtures.value.filter((f) => f.dayKey === selectedDay.value))
const grouped = computed(() => {
  const map = new Map()
  for (const f of dayFixtures.value) {
    if (!map.has(f.label)) map.set(f.label, [])
    map.get(f.label).push(f)
  }
  return [...map.entries()].map(([label, items]) => ({ label, items }))
})

function kickoff(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}
// In a finished match, the team with fewer goals is the loser (dimmed).
function isLoser(fx, idx) {
  if (fx.state !== 'post') return false
  const [a, b] = fx.teams
  if (a?.score == null || b?.score == null || a.score === b.score) return false
  const winIdx = Number(a.score) > Number(b.score) ? 0 : 1
  return idx !== winIdx
}
</script>

<template>
  <div class="space-y-4">
    <!-- Date selector -->
    <div ref="selectorRef" class="-mx-4 px-4 overflow-x-auto">
      <div class="flex gap-1.5 min-w-max">
        <button
          v-for="key in days" :key="key"
          type="button"
          :data-selected="key === selectedDay ? '' : undefined"
          @click="selectedDay = key"
          class="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
          :class="key === selectedDay
            ? 'bg-emerald-500 text-white'
            : 'bg-court-800 text-zinc-400 hover:text-white'"
        >{{ dayLabel(key) }}</button>
      </div>
    </div>

    <div v-if="!dayFixtures.length" class="bg-court-800 border border-court-700 rounded-2xl p-4 text-center text-xs text-zinc-400">
      No matches on this day.
    </div>

    <!-- Matches for the selected day, grouped by round/competition -->
    <div v-for="group in grouped" :key="group.label" class="bg-court-800 border border-court-700 rounded-2xl overflow-hidden">
      <div class="px-4 py-2.5 border-b border-court-700 text-[11px] font-black tracking-wider text-emerald-400 uppercase">
        {{ group.label }}
      </div>
      <div class="divide-y divide-court-700/60">
        <div
          v-for="fx in group.items" :key="fx.id"
          class="flex items-center gap-2 px-3 py-3"
        >
          <!-- Home (right-aligned) -->
          <div class="flex-1 flex items-center justify-end gap-2 min-w-0">
            <span class="text-sm font-medium truncate text-right" :class="isLoser(fx, 0) ? 'text-zinc-500' : 'text-white'">{{ fx.teams[0]?.name ?? 'TBD' }}</span>
            <span class="text-lg leading-none shrink-0" :class="isLoser(fx, 0) ? 'opacity-50' : ''">{{ fx.teams[0]?.flag ?? '🏳️' }}</span>
          </div>

          <!-- Center: kickoff time (upcoming) or score + status -->
          <div class="shrink-0 w-16 text-center">
            <div v-if="fx.state === 'pre'" class="text-xs text-zinc-400 font-mono leading-tight">{{ kickoff(fx.dateISO) }}</div>
            <div v-else class="text-sm font-black text-white tabular-nums leading-tight">
              {{ fx.teams[0]?.score ?? 0 }} – {{ fx.teams[1]?.score ?? 0 }}
            </div>
            <div v-if="fx.clock" class="text-[9px] font-bold uppercase tracking-wide mt-0.5" :class="fx.state === 'in' ? 'text-amber-400' : 'text-zinc-500'">{{ fx.clock }}</div>
          </div>

          <!-- Away (left-aligned) -->
          <div class="flex-1 flex items-center gap-2 min-w-0">
            <span class="text-lg leading-none shrink-0" :class="isLoser(fx, 1) ? 'opacity-50' : ''">{{ fx.teams[1]?.flag ?? '🏳️' }}</span>
            <span class="text-sm font-medium truncate" :class="isLoser(fx, 1) ? 'text-zinc-500' : 'text-white'">{{ fx.teams[1]?.name ?? 'TBD' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

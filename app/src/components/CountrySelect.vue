<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { GROUP_TEAMS, GROUPS, TEAM_FLAG } from '../data.js'

const props = defineProps({ modelValue: String, placeholder: { type: String, default: 'Select a team…' } })
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const search = ref('')
const sortBy = ref('group') // 'group' | 'name'
const container = ref(null)
const searchInput = ref(null)

const ALL_TEAMS_SORTED = [...new Set(Object.values(GROUP_TEAMS).flat())].sort()

const byGroup = computed(() => {
  const q = search.value.toLowerCase()
  return GROUPS.map(g => ({
    group: g,
    teams: GROUP_TEAMS[g].filter(t => !q || t.toLowerCase().includes(q)),
  })).filter(g => g.teams.length > 0)
})

const byName = computed(() => {
  const q = search.value.toLowerCase()
  return q ? ALL_TEAMS_SORTED.filter(t => t.toLowerCase().includes(q)) : ALL_TEAMS_SORTED
})

const hasResults = computed(() =>
  sortBy.value === 'group' ? byGroup.value.length > 0 : byName.value.length > 0
)

function select(team) {
  emit('update:modelValue', team)
  open.value = false
  search.value = ''
}

function toggle() {
  open.value = !open.value
  if (open.value) setTimeout(() => searchInput.value?.focus(), 50)
}

function onOutside(e) {
  if (container.value && !container.value.contains(e.target)) {
    open.value = false
    search.value = ''
  }
}
onMounted(() => document.addEventListener('mousedown', onOutside))
onUnmounted(() => document.removeEventListener('mousedown', onOutside))
</script>

<template>
  <div ref="container" class="relative">
    <!-- Trigger -->
    <button
      type="button"
      @click="toggle"
      class="w-full flex items-center justify-between gap-2 bg-court-900 border rounded-xl px-3 py-2.5 text-sm transition-colors text-left"
      :class="open ? 'border-sky-400' : 'border-court-600 hover:border-slate-600'"
    >
      <span v-if="modelValue" class="flex items-center gap-2">
        <span class="text-base leading-none">{{ TEAM_FLAG[modelValue] ?? '🏳' }}</span>
        <span class="text-white">{{ modelValue }}</span>
      </span>
      <span v-else class="text-slate-600">{{ placeholder }}</span>
      <svg
        class="w-3.5 h-3.5 text-slate-600 shrink-0 transition-transform duration-150"
        :class="open ? 'rotate-180' : ''"
        viewBox="0 0 12 8" fill="none"
      >
        <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <!-- Dropdown -->
    <div
      v-if="open"
      class="absolute z-50 left-0 right-0 mt-1.5 bg-court-800 border border-court-600 rounded-xl overflow-hidden shadow-2xl shadow-black/60"
    >
      <!-- Search + sort toggle -->
      <div class="flex items-center gap-2 p-2 border-b border-court-700">
        <input
          ref="searchInput"
          v-model="search"
          type="text"
          placeholder="Search…"
          class="flex-1 bg-court-900 border border-court-600 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-sky-400 transition-colors"
        />
        <!-- Sort tabs -->
        <div class="flex bg-court-900 border border-court-700 rounded-lg overflow-hidden shrink-0">
          <button
            type="button"
            @click="sortBy = 'group'"
            class="px-2.5 py-1.5 text-[10px] font-bold transition-colors"
            :class="sortBy === 'group' ? 'bg-court-600 text-white' : 'text-slate-600 hover:text-slate-400'"
          >Group</button>
          <button
            type="button"
            @click="sortBy = 'name'"
            class="px-2.5 py-1.5 text-[10px] font-bold transition-colors"
            :class="sortBy === 'name' ? 'bg-court-600 text-white' : 'text-slate-600 hover:text-slate-400'"
          >A–Z</button>
        </div>
      </div>

      <!-- List -->
      <div class="max-h-56 overflow-y-auto overscroll-contain">

        <!-- Group view -->
        <template v-if="sortBy === 'group'">
          <template v-for="{ group, teams } in byGroup" :key="group">
            <div class="px-3 py-1.5 text-[10px] font-black tracking-widest text-slate-600 uppercase bg-court-900/80 sticky top-0">
              Group {{ group }}
            </div>
            <button
              v-for="team in teams" :key="team"
              type="button"
              @click="select(team)"
              class="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors border-t border-court-700/30"
              :class="modelValue === team ? 'bg-sky-500/10 text-sky-300' : 'text-slate-300 hover:bg-court-700 hover:text-white'"
            >
              <span class="text-base leading-none shrink-0">{{ TEAM_FLAG[team] ?? '🏳' }}</span>
              <span>{{ team }}</span>
              <svg v-if="modelValue === team" class="ml-auto w-3.5 h-3.5 text-sky-400 shrink-0" viewBox="0 0 12 10" fill="none">
                <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </template>
        </template>

        <!-- Name view -->
        <template v-else>
          <button
            v-for="team in byName" :key="team"
            type="button"
            @click="select(team)"
            class="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors border-b border-court-700/30 last:border-0"
            :class="modelValue === team ? 'bg-sky-500/10 text-sky-300' : 'text-slate-300 hover:bg-court-700 hover:text-white'"
          >
            <span class="text-base leading-none shrink-0">{{ TEAM_FLAG[team] ?? '🏳' }}</span>
            <span>{{ team }}</span>
            <svg v-if="modelValue === team" class="ml-auto w-3.5 h-3.5 text-sky-400 shrink-0" viewBox="0 0 12 10" fill="none">
              <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </template>

        <div v-if="!hasResults" class="px-3 py-4 text-xs text-slate-600 text-center">No matches</div>
      </div>
    </div>
  </div>
</template>

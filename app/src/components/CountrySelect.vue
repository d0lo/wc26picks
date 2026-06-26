<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { GROUP_TEAMS, GROUPS, TEAM_FLAG, TEAM_ID, TEAM_BY_ID } from '../data.js'

const props = defineProps({ modelValue: String, placeholder: { type: String, default: 'Select a team…' }, disabled: Boolean, allowNone: Boolean })
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const dropUp = ref(false)
const dropStyle = ref({})
const search = ref('')
const sortBy = ref('group') // 'group' | 'name'
const container = ref(null)
const dropdownEl = ref(null)
const searchInput = ref(null)

const ALL_TEAMS_SORTED = [...new Set(Object.values(GROUP_TEAMS).flat())].sort()

const normalize = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

// modelValue is a teamId (UUID) or null
const selectedTeam = computed(() => props.modelValue ? TEAM_BY_ID[props.modelValue] : null)

const byGroup = computed(() => {
  const q = normalize(search.value)
  return GROUPS.map(g => ({
    group: g,
    teams: GROUP_TEAMS[g].filter(t => !q || normalize(t).includes(q)),
  })).filter(g => g.teams.length > 0)
})

const byName = computed(() => {
  const q = normalize(search.value)
  return q ? ALL_TEAMS_SORTED.filter(t => normalize(t).includes(q)) : ALL_TEAMS_SORTED
})

const hasResults = computed(() =>
  sortBy.value === 'group' ? byGroup.value.length > 0 : byName.value.length > 0
)

function select(teamName) {
  emit('update:modelValue', teamName === null ? null : TEAM_ID[teamName])
  open.value = false
  search.value = ''
}

function toggle() {
  open.value = !open.value
  if (open.value) {
    const rect = container.value?.getBoundingClientRect()
    if (rect) {
      dropUp.value = window.innerHeight - rect.bottom < 300
      if (dropUp.value) {
        dropStyle.value = { position: 'fixed', bottom: `${window.innerHeight - rect.top}px`, right: `${window.innerWidth - rect.right}px` }
      } else {
        dropStyle.value = { position: 'fixed', top: `${rect.bottom + 6}px`, right: `${window.innerWidth - rect.right}px` }
      }
    }
    nextTick(() => searchInput.value?.focus())
  }
}

function onOutside(e) {
  if (container.value && !container.value.contains(e.target) && !dropdownEl.value?.contains(e.target)) {
    open.value = false
    search.value = ''
  }
}
onMounted(() => document.addEventListener('click', onOutside))
onUnmounted(() => document.removeEventListener('click', onOutside))

defineExpose({ dropdownEl })
</script>

<template>
  <div ref="container" :class="['relative w-full', open ? 'z-10' : '']">
    <!-- Trigger -->
    <button
      type="button"
      @click="!disabled && toggle()"
      :disabled="disabled"
      class="w-full flex items-center justify-between gap-2 border rounded-xl px-3 py-2.5 text-xs transition-colors text-left"
      :class="disabled ? 'bg-court-900 border-court-700 opacity-50 cursor-not-allowed' : open ? 'bg-court-900 border-emerald-400' : modelValue ? 'bg-emerald-500/10 border-emerald-400/25 hover:border-emerald-400/50' : 'bg-court-900 border-court-600 hover:border-zinc-600'"
    >
      <span v-if="modelValue === null && allowNone" class="flex items-center gap-1.5 min-w-0">
        <span class="text-sm leading-none shrink-0">🚫</span>
        <span class="text-white truncate">No Team</span>
      </span>
      <span v-else-if="selectedTeam" class="flex items-center gap-1.5 min-w-0">
        <span class="text-sm leading-none shrink-0">{{ selectedTeam.flag }}</span>
        <span class="text-white truncate">{{ selectedTeam.name }}</span>
      </span>
      <span v-else class="text-zinc-400">{{ placeholder }}</span>
      <!-- pencil when selected, chevron when empty -->
      <svg v-if="modelValue != null && !open && !disabled" class="w-3.5 h-3.5 text-zinc-400 shrink-0" viewBox="0 0 16 16" fill="none">
        <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <svg v-else-if="!disabled" class="w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-150" :class="open ? 'rotate-180' : ''" viewBox="0 0 12 8" fill="none">
        <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <!-- Dropdown -->
    <Teleport to="body">
    <div
      v-if="open"
      ref="dropdownEl"
      :style="dropStyle"
      class="z-[9999] min-w-[240px] w-max max-w-[min(320px,calc(100vw-2rem))] bg-court-800 border border-court-600 rounded-xl overflow-hidden shadow-2xl shadow-black/60"
    >
      <!-- Search + sort toggle -->
      <div class="flex items-center gap-2 p-2 border-b border-court-700 w-full">
        <input
          ref="searchInput"
          v-model="search"
          type="text"
          placeholder="Search…"
          class="flex-1 min-w-0 bg-court-900 border border-court-600 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-400 transition-colors"
        />
        <!-- Sort tabs -->
        <div class="flex bg-court-900 border border-court-700 rounded-lg overflow-hidden shrink-0">
          <button
            type="button"
            @click="sortBy = 'group'"
            class="px-2.5 py-1.5 text-[10px] font-bold transition-colors"
            :class="sortBy === 'group' ? 'bg-court-600 text-white' : 'text-zinc-400 hover:text-zinc-400'"
          >Group</button>
          <button
            type="button"
            @click="sortBy = 'name'"
            class="px-2.5 py-1.5 text-[10px] font-bold transition-colors"
            :class="sortBy === 'name' ? 'bg-court-600 text-white' : 'text-zinc-400 hover:text-zinc-400'"
          >A–Z</button>
        </div>
      </div>

      <!-- List -->
      <div class="max-h-56 overflow-y-auto overscroll-contain">

        <!-- Group view -->
        <template v-if="sortBy === 'group'">
          <button
            v-if="allowNone"
            type="button"
            @click="select(null)"
            class="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors border-b border-court-700/30"
            :class="modelValue === null ? 'bg-emerald-500/10 text-emerald-300' : 'text-zinc-400 hover:bg-court-700 hover:text-white'"
          >
            <span class="text-base leading-none shrink-0">🚫</span>
            <span>No Team</span>
            <svg v-if="modelValue === null" class="ml-auto w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 12 10" fill="none">
              <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <template v-for="{ group, teams } in byGroup" :key="group">
            <div class="px-3 py-1.5 text-[10px] font-black tracking-widest text-zinc-400 uppercase bg-court-900/80 sticky top-0">
              Group {{ group }}
            </div>
            <button
              v-for="team in teams" :key="team"
              type="button"
              @click="select(team)"
              class="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors border-t border-court-700/30"
              :class="selectedTeam?.name === team ? 'bg-emerald-500/10 text-emerald-300' : 'text-zinc-300 hover:bg-court-700 hover:text-white'"
            >
              <span class="text-base leading-none shrink-0">{{ TEAM_FLAG[team] ?? '🏳' }}</span>
              <span>{{ team }}</span>
              <svg v-if="selectedTeam?.name === team" class="ml-auto w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 12 10" fill="none">
                <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </template>
        </template>

        <!-- Name view -->
        <template v-else>
          <button
            v-if="allowNone"
            type="button"
            @click="select(null)"
            class="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors border-b border-court-700/30"
            :class="modelValue === null ? 'bg-emerald-500/10 text-emerald-300' : 'text-zinc-400 hover:bg-court-700 hover:text-white'"
          >
            <span class="text-base leading-none shrink-0">🚫</span>
            <span>No Team</span>
            <svg v-if="modelValue === null" class="ml-auto w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 12 10" fill="none">
              <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button
            v-for="team in byName" :key="team"
            type="button"
            @click="select(team)"
            class="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors border-b border-court-700/30 last:border-0"
            :class="selectedTeam?.name === team ? 'bg-emerald-500/10 text-emerald-300' : 'text-zinc-300 hover:bg-court-700 hover:text-white'"
          >
            <span class="text-base leading-none shrink-0">{{ TEAM_FLAG[team] ?? '🏳' }}</span>
            <span>{{ team }}</span>
            <svg v-if="selectedTeam?.name === team" class="ml-auto w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 12 10" fill="none">
              <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </template>

        <div v-if="!hasResults" class="px-3 py-4 text-xs text-zinc-400 text-center">No matches</div>
      </div>
    </div>
    </Teleport>
  </div>
</template>

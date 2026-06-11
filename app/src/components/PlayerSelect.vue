<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { TEAM_FLAG } from '../data.js'
import { ROSTERS } from '../rosters.js'
import CountrySelect from './CountrySelect.vue'

const props = defineProps({ modelValue: String })
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const country = ref('')
const search = ref('')
const container = ref(null)
const searchInput = ref(null)

// Reverse-map flag emoji → country name for pre-filling on edit
const FLAG_TO_TEAM = Object.fromEntries(Object.entries(TEAM_FLAG).map(([k, v]) => [v, k]))

function extractName(val) {
  return val ? val.replace(/\s*\([^)]*\)$/, '') : ''
}
function extractCountry(val) {
  const m = val?.match(/\(([^)]+)\)$/)
  return m ? (FLAG_TO_TEAM[m[1]] ?? '') : ''
}

function openPicker() {
  if (props.modelValue) {
    country.value = extractCountry(props.modelValue)
    search.value = extractName(props.modelValue)
  }
  open.value = true
  setTimeout(() => searchInput.value?.focus(), 50)
}

function closePicker() {
  open.value = false
}

function selectPlayer(name, teamName) {
  const flag = TEAM_FLAG[teamName] ?? teamName
  emit('update:modelValue', `${name} (${flag})`)
  open.value = false
  search.value = ''
}

function clear(e) {
  e.stopPropagation()
  emit('update:modelValue', '')
  country.value = ''
  search.value = ''
  open.value = false
}

// Player list
const POS_ORDER = { GK: 0, D: 1, DF: 1, M: 2, MF: 2, F: 3, FW: 3 }
const POS_LABEL = { GK: 'Goalkeepers', D: 'Defenders', DF: 'Defenders', M: 'Midfielders', MF: 'Midfielders', F: 'Forwards', FW: 'Forwards' }

const groupedPlayers = computed(() => {
  const q = search.value.toLowerCase().trim()
  let pool = []

  if (country.value && ROSTERS[country.value]) {
    pool = ROSTERS[country.value].map(p => ({ ...p, team: country.value }))
  } else if (q.length >= 2) {
    for (const [c, players] of Object.entries(ROSTERS)) {
      for (const p of players) {
        if (p.name.toLowerCase().includes(q)) pool.push({ ...p, team: c })
        if (pool.length >= 40) break
      }
      if (pool.length >= 40) break
    }
  } else {
    return {}
  }

  if (q && country.value) {
    pool = pool.filter(p => p.name.toLowerCase().includes(q))
  }

  // Sort by position then group
  pool.sort((a, b) => (POS_ORDER[a.pos] ?? 9) - (POS_ORDER[b.pos] ?? 9))
  const groups = {}
  for (const p of pool) {
    const g = POS_LABEL[p.pos] ?? 'Other'
    if (!groups[g]) groups[g] = []
    groups[g].push(p)
  }
  return groups
})

const hasResults = computed(() => Object.keys(groupedPlayers.value).length > 0)
const showList = computed(() => country.value || search.value.length >= 2)

const selectedName = computed(() => extractName(props.modelValue))
const selectedCountry = computed(() => extractCountry(props.modelValue))

watch(() => props.modelValue, val => {
  if (!val) { country.value = ''; search.value = '' }
})

watch(country, val => {
  if (val) open.value = true
})

function onOutside(e) {
  if (container.value && !container.value.contains(e.target)) closePicker()
}
onMounted(() => document.addEventListener('mousedown', onOutside))
onUnmounted(() => document.removeEventListener('mousedown', onOutside))
</script>

<template>
  <div ref="container" class="relative">

    <!-- ── Closed: show selected chip ── -->
    <div
      v-if="modelValue && !open"
      class="w-full flex items-center gap-2.5 bg-sky-500/10 border border-sky-400/25 rounded-xl px-3 py-2.5 hover:border-sky-400/50 transition-colors group"
    >
      <button type="button" @click="openPicker" class="flex items-center gap-2.5 flex-1 min-w-0 text-left">
        <span class="text-base leading-none shrink-0">{{ TEAM_FLAG[selectedCountry] ?? '⚽' }}</span>
        <span class="text-sm text-white font-medium flex-1 truncate">{{ selectedName }}</span>
        <svg class="w-3.5 h-3.5 text-slate-600 shrink-0" viewBox="0 0 16 16" fill="none">
          <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button type="button" @click="clear($event)" class="shrink-0 text-slate-600 hover:text-slate-400 text-xs leading-none">✕</button>
    </div>

    <!-- ── Open: search picker ── -->
    <div v-else>
      <!-- Search + country row -->
      <div class="flex items-center gap-1.5">
        <!-- Search input -->
        <div class="relative flex-1">
          <input
            ref="searchInput"
            v-model="search"
            type="text"
            placeholder="Search player…"
            @focus="open = true"
            class="w-full bg-court-900 border rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-700 focus:outline-none transition-colors pr-7"
            :class="open ? 'border-sky-400' : 'border-court-600'"
          />
          <button
            v-if="search"
            type="button"
            @click="search = ''"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 text-xs"
          >✕</button>
        </div>

        <span class="text-[10px] font-bold text-slate-600 shrink-0">or</span>

        <!-- Country selector -->
        <CountrySelect
          class="flex-1"
          v-model="country"
          placeholder="By country"
          @update:modelValue="open = true; setTimeout(() => searchInput?.focus(), 50)"
        />
      </div>

      <!-- Player list dropdown -->
      <div
        v-if="open && showList"
        class="mt-1.5 bg-court-800 border border-court-600 rounded-xl overflow-hidden shadow-2xl shadow-black/60 max-h-52 overflow-y-auto overscroll-contain"
      >
        <template v-if="hasResults">
          <template v-for="(players, posGroup) in groupedPlayers" :key="posGroup">
            <div class="px-3 py-1.5 text-[10px] font-black tracking-widest text-slate-600 uppercase bg-court-900/80 sticky top-0">
              {{ posGroup }}
            </div>
            <button
              v-for="player in players" :key="player.name + player.team"
              type="button"
              @click="selectPlayer(player.name, player.team)"
              class="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors border-t border-court-700/30"
              :class="selectedName === player.name && selectedCountry === player.team
                ? 'bg-sky-500/10 text-sky-300'
                : 'text-slate-300 hover:bg-court-700 hover:text-white'"
            >
              <span class="text-sm leading-none shrink-0">{{ TEAM_FLAG[player.team] ?? '🏳' }}</span>
              <span v-if="player.num" class="text-[10px] font-mono text-slate-600 w-6 text-right shrink-0">#{{ player.num }}</span>
              <span class="flex-1 truncate font-medium">{{ player.name }}</span>
              <svg v-if="selectedName === player.name && selectedCountry === player.team" class="w-3.5 h-3.5 text-sky-400 shrink-0" viewBox="0 0 12 10" fill="none">
                <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </template>
        </template>
        <div v-else class="px-3 py-4 text-xs text-slate-600 text-center">No players found</div>
      </div>

      <p v-else-if="open" class="mt-1.5 text-[11px] text-slate-700">
        Type 2+ characters to search all squads, or pick a country
      </p>
    </div>

  </div>
</template>

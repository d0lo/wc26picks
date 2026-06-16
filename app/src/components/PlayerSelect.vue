<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { TEAM_FLAG, TEAM_ID } from '../data.js'
import { ROSTERS } from '../rosters.js'
import CountrySelect from './CountrySelect.vue'

const props = defineProps({
  modelValue: String,
  positionFilter: { type: String, default: null },
  maxAge: { type: Number, default: null },
  disabled: Boolean,
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const country = ref('')       // teamId UUID of the selected country filter
const search = ref('')
const container = ref(null)
const searchInput = ref(null)
const countrySelectRef = ref(null)

// Build a flat player-by-id lookup once
const PLAYER_BY_ID = {}
for (const [teamName, players] of Object.entries(ROSTERS)) {
  for (const p of players) {
    PLAYER_BY_ID[p.id] = { ...p, team: teamName }
  }
}

// Resolve selected player from UUID
const selectedPlayer = computed(() => props.modelValue ? PLAYER_BY_ID[props.modelValue] ?? null : null)

function openPicker() {
  country.value = ''
  search.value = ''
  open.value = true
  setTimeout(() => searchInput.value?.focus(), 50)
}

function closePicker() {
  open.value = false
}

function selectPlayer(playerId) {
  emit('update:modelValue', playerId)
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
const POS_ORDER = { F: 0, FW: 0, M: 1, MF: 1, D: 2, DF: 2, GK: 3, G: 3 }
const POS_LABEL = { F: 'Forwards', FW: 'Forwards', M: 'Midfielders', MF: 'Midfielders', D: 'Defenders', DF: 'Defenders', GK: 'Goalkeepers', G: 'Goalkeepers' }

const normalize = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

const groupedPlayers = computed(() => {
  const q = normalize(search.value.trim())
  let pool = []

  if (q.length >= 2) {
    for (const [teamName, players] of Object.entries(ROSTERS)) {
      for (const p of players) {
        if (normalize(p.name).includes(q)) pool.push({ ...p, team: teamName })
        if (pool.length >= 40) break
      }
      if (pool.length >= 40) break
    }
  } else if (country.value) {
    // Find team name from teamId
    const teamEntry = Object.entries(ROSTERS).find(([teamName]) => TEAM_ID[teamName] === country.value)
    if (teamEntry) {
      pool = teamEntry[1].map(p => ({ ...p, team: teamEntry[0] }))
    }
  } else {
    return {}
  }

  if (props.positionFilter) {
    pool = pool.filter(p => p.pos === props.positionFilter)
  }

  if (props.maxAge != null) {
    const startOfTournament = new Date('2026-06-11')
    pool = pool.filter(p => {
      if (!p.dob) return false
      const birth = new Date(p.dob)
      const age = startOfTournament.getFullYear() - birth.getFullYear() -
        (startOfTournament < new Date(startOfTournament.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0)
      return age <= props.maxAge
    })
  }

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
const showList = computed(() => search.value.length >= 2 || country.value)

function playerAge(dob) {
  const birth = new Date(dob)
  const ref = new Date('2026-06-11')
  const years = ref.getFullYear() - birth.getFullYear() -
    (ref < new Date(ref.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0)
  const lastBirthday = new Date(ref.getFullYear() - (ref < new Date(ref.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0), birth.getMonth(), birth.getDate())
  const days = Math.floor((ref - lastBirthday) / 86400000)
  return `${years}y ${days}d`
}

watch(() => props.modelValue, val => {
  if (!val) { country.value = ''; search.value = '' }
})

watch(country, val => {
  if (val) open.value = true
})

function onOutside(e) {
  const countryDropdown = countrySelectRef.value?.dropdownEl
  if (
    container.value && !container.value.contains(e.target) &&
    !(countryDropdown && countryDropdown.contains(e.target))
  ) closePicker()
}
onMounted(() => document.addEventListener('mousedown', onOutside))
onUnmounted(() => document.removeEventListener('mousedown', onOutside))
</script>

<template>
  <div ref="container" class="relative">

    <!-- ── Closed: show selected chip ── -->
    <div
      v-if="modelValue && !open"
      class="w-full flex items-center gap-2.5 border rounded-xl px-3 py-2.5 transition-colors group"
      :class="disabled ? 'bg-court-900 border-court-700 opacity-50' : 'bg-emerald-500/10 border-emerald-400/25 hover:border-emerald-400/50'"
    >
      <button type="button" @click="!disabled && openPicker()" :disabled="disabled" class="flex items-center gap-2.5 flex-1 min-w-0 text-left" :class="disabled ? 'cursor-not-allowed' : ''">
        <span class="text-base leading-none shrink-0">{{ TEAM_FLAG[selectedPlayer?.team] ?? '⚽' }}</span>
        <span class="text-sm text-white font-medium flex-1 truncate">{{ selectedPlayer?.name ?? '…' }}</span>
        <svg v-if="!disabled" class="w-3.5 h-3.5 text-zinc-400 shrink-0" viewBox="0 0 16 16" fill="none">
          <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <!-- ── Open: search picker ── -->
    <div v-else-if="!disabled">
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
            class="w-full bg-court-900 border rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none transition-colors pr-7"
            :class="open ? 'border-emerald-400' : 'border-court-600'"
          />
          <button
            v-if="search"
            type="button"
            @click="search = ''"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-zinc-400 hover:text-white"
          >✕</button>
        </div>

        <span class="text-[10px] font-bold text-zinc-400 shrink-0">or</span>

        <!-- Country selector — v-model is teamId UUID -->
        <CountrySelect
          ref="countrySelectRef"
          class="flex-1"
          v-model="country"
          placeholder="By country"
          @update:modelValue="open = true; $nextTick(() => searchInput?.focus())"
        />
      </div>

      <!-- Player list -->
      <div
        v-if="open && showList"
        class="relative z-[9999] mt-1.5 bg-court-800 border border-court-600 rounded-xl overflow-hidden shadow-2xl shadow-black/60 max-h-52 overflow-y-auto overscroll-contain"
      >
        <template v-if="hasResults">
          <template v-for="(players, posGroup) in groupedPlayers" :key="posGroup">
            <div class="px-3 py-1.5 text-[10px] font-black tracking-widest text-zinc-400 uppercase bg-court-900/80 sticky top-0">
              {{ posGroup }}
            </div>
            <button
              v-for="player in players" :key="player.id"
              type="button"
              @click="selectPlayer(player.id)"
              class="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors border-t border-court-700/30"
              :class="modelValue === player.id
                ? 'bg-emerald-500/10 text-emerald-300'
                : 'text-zinc-300 hover:bg-court-700 hover:text-white'"
            >
              <span class="text-sm leading-none shrink-0">{{ TEAM_FLAG[player.team] ?? '🏳' }}</span>
              <span v-if="player.num" class="text-[10px] font-mono text-zinc-400 w-6 text-right shrink-0">#{{ player.num }}</span>
              <span class="flex-1 truncate font-medium">{{ player.name }}</span>
              <span v-if="maxAge != null && player.dob" class="text-[10px] font-mono text-zinc-400 shrink-0">{{ playerAge(player.dob) }}</span>
              <svg v-if="modelValue === player.id" class="w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 12 10" fill="none">
                <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </template>
        </template>
        <div v-else class="px-3 py-4 text-xs text-zinc-400 text-center">No players found</div>
      </div>

      <p v-else-if="open" class="mt-1.5 text-[11px] text-zinc-400">
        Type 2+ characters to search all squads, or pick a country
      </p>
    </div>

  </div>
</template>

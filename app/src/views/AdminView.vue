<script setup>
import { computed, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { doc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '../firebase.js'
import { configQueryOptions, queryKeys } from '../queries.js'
import { PROP_CATEGORIES } from '../data.js'

const router = useRouter()
const queryClient = useQueryClient()

const configQuery = useQuery(configQueryOptions())
const loading = computed(() => configQuery.isLoading.value)

// Local datetime-local input string, e.g. "2026-06-26T20:00"
function toLocalInputValue(timestamp) {
  if (!timestamp) return ''
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const lockTimeInput = reactive({ value: '' })
const scoringForm = reactive({ groupExact: { 1: 0, 2: 0, 3: 0, 4: 0 }, perfectGroupBonus: 0, wildcard: 0 })
const propsForm = reactive({ items: [] })

const saveStatus = reactive({ lock: '', scoring: '', props: '' })

watch(() => configQuery.data.value, (data) => {
  if (!data) return
  lockTimeInput.value = toLocalInputValue(data.picksLockAt)
  const s = data.scoring ?? {}
  scoringForm.groupExact = { 1: s.groupExact?.[1] ?? 0, 2: s.groupExact?.[2] ?? 0, 3: s.groupExact?.[3] ?? 0, 4: s.groupExact?.[4] ?? 0 }
  scoringForm.perfectGroupBonus = s.perfectGroupBonus ?? 0
  scoringForm.wildcard = s.wildcard ?? 0
  propsForm.items = (s.props ?? []).map(p => ({ ...p }))
}, { immediate: true })

const POSITION_FILTERS = [
  { value: '', label: 'Any position' },
  { value: 'G', label: 'Goalkeeper' },
  { value: 'D', label: 'Defender' },
  { value: 'M', label: 'Midfielder' },
  { value: 'F', label: 'Forward' },
]

const activeProps = computed(() => propsForm.items.filter(p => !p.archived))
const archivedProps = computed(() => propsForm.items.filter(p => p.archived))

const propsByCategory = computed(() =>
  PROP_CATEGORIES
    .map(c => ({ ...c, props: activeProps.value.filter(p => p.category === c.key) }))
    .filter(c => c.props.length)
)

function addProp() {
  propsForm.items.push({
    id: crypto.randomUUID(),
    key: '',
    label: 'New Prop',
    hint: '',
    type: 'team',
    category: PROP_CATEGORIES[0].key,
    points: 1,
    allowNone: false,
  })
}

function archiveProp(prop) {
  prop.archived = true
}

function restoreProp(prop) {
  delete prop.archived
}

// Switching type drops the fields that only apply to the other type, so a
// stale positionFilter/maxAge doesn't silently linger on a team prop (or
// allowNone on a player prop).
function onTypeChange(prop) {
  if (prop.type === 'player') {
    delete prop.allowNone
  } else {
    delete prop.positionFilter
    delete prop.maxAge
  }
}

function invalidateConfig() {
  queryClient.invalidateQueries({ queryKey: queryKeys.config })
}

async function saveLockTime() {
  saveStatus.lock = 'saving'
  try {
    const ms = new Date(lockTimeInput.value).getTime()
    await updateDoc(doc(db, 'config', 'public'), { picksLockAt: Timestamp.fromMillis(ms) })
    invalidateConfig()
    saveStatus.lock = 'saved'
  } catch {
    saveStatus.lock = 'error'
  }
}

async function saveScoring() {
  saveStatus.scoring = 'saving'
  try {
    await updateDoc(doc(db, 'config', 'public'), {
      'scoring.groupExact': {
        1: Number(scoringForm.groupExact[1]),
        2: Number(scoringForm.groupExact[2]),
        3: Number(scoringForm.groupExact[3]),
        4: Number(scoringForm.groupExact[4]),
      },
      'scoring.perfectGroupBonus': Number(scoringForm.perfectGroupBonus),
      'scoring.wildcard': Number(scoringForm.wildcard),
    })
    invalidateConfig()
    saveStatus.scoring = 'saved'
  } catch {
    saveStatus.scoring = 'error'
  }
}

// Firestore rejects `undefined` field values, so each prop is rebuilt from
// scratch with only the fields that apply to its type, rather than just
// patching points/maxAge onto whatever shape the row happened to have.
function cleanProp(p) {
  const base = { id: p.id, key: p.key ?? '', label: p.label, hint: p.hint ?? '', type: p.type, category: p.category, points: Number(p.points) }
  if (p.archived) base.archived = true
  if (p.type === 'player') {
    if (p.positionFilter) base.positionFilter = p.positionFilter
    if (p.maxAge !== undefined && p.maxAge !== '') base.maxAge = Number(p.maxAge)
  } else if (p.allowNone) {
    base.allowNone = true
  }
  return base
}

async function saveProps() {
  saveStatus.props = 'saving'
  try {
    const props = propsForm.items.map(cleanProp)
    await updateDoc(doc(db, 'config', 'public'), { 'scoring.props': props })
    invalidateConfig()
    saveStatus.props = 'saved'
  } catch {
    saveStatus.props = 'error'
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 pt-4 pb-10">
    <div class="flex items-center gap-3 mb-5">
      <button
        type="button"
        @click="router.push('/leaderboard')"
        class="text-zinc-400 hover:text-zinc-200 transition-colors"
        aria-label="Back"
      >
        <svg class="w-5 h-5" viewBox="0 0 20 20" fill="none">
          <path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <h1 class="text-sm font-black tracking-[0.2em] text-white uppercase">Admin · Config</h1>
    </div>

    <div v-if="loading" class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <div v-else class="space-y-4">
      <!-- Picks lock time -->
      <section class="bg-court-800 border border-court-700 rounded-2xl p-4">
        <h2 class="text-xs font-black tracking-[0.15em] text-white uppercase mb-3">Picks Lock Time</h2>
        <div class="flex items-center gap-3">
          <input
            v-model="lockTimeInput.value"
            type="datetime-local"
            class="flex-1 bg-court-900 border border-court-700 rounded-lg px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            @click="saveLockTime"
            class="px-4 py-2 rounded-lg bg-emerald-500 text-court-950 text-xs font-bold uppercase tracking-wider hover:bg-emerald-400 transition-colors"
          >
            Save
          </button>
        </div>
        <p v-if="saveStatus.lock === 'saved'" class="text-[11px] text-emerald-400 mt-2">Saved</p>
        <p v-if="saveStatus.lock === 'error'" class="text-[11px] text-red-400 mt-2">Failed to save</p>
      </section>

      <!-- Group / wildcard scoring -->
      <section class="bg-court-800 border border-court-700 rounded-2xl p-4">
        <h2 class="text-xs font-black tracking-[0.15em] text-white uppercase mb-3">Group Scoring</h2>
        <div class="grid grid-cols-4 gap-2 mb-3">
          <label v-for="pos in [1, 2, 3, 4]" :key="pos" class="block">
            <span class="block text-[10px] text-zinc-400 mb-1">{{ pos }}{{ pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th' }}</span>
            <input
              v-model="scoringForm.groupExact[pos]"
              type="number"
              class="w-full bg-court-900 border border-court-700 rounded-lg px-2 py-1.5 text-sm text-white"
            />
          </label>
        </div>
        <div class="grid grid-cols-2 gap-2 mb-3">
          <label class="block">
            <span class="block text-[10px] text-zinc-400 mb-1">Perfect group bonus</span>
            <input
              v-model="scoringForm.perfectGroupBonus"
              type="number"
              class="w-full bg-court-900 border border-court-700 rounded-lg px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label class="block">
            <span class="block text-[10px] text-zinc-400 mb-1">Wildcard (per pick)</span>
            <input
              v-model="scoringForm.wildcard"
              type="number"
              class="w-full bg-court-900 border border-court-700 rounded-lg px-2 py-1.5 text-sm text-white"
            />
          </label>
        </div>
        <button
          type="button"
          @click="saveScoring"
          class="px-4 py-2 rounded-lg bg-emerald-500 text-court-950 text-xs font-bold uppercase tracking-wider hover:bg-emerald-400 transition-colors"
        >
          Save
        </button>
        <p v-if="saveStatus.scoring === 'saved'" class="text-[11px] text-emerald-400 mt-2">Saved</p>
        <p v-if="saveStatus.scoring === 'error'" class="text-[11px] text-red-400 mt-2">Failed to save</p>
      </section>

      <!-- Props catalog -->
      <section class="bg-court-800 border border-court-700 rounded-2xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-xs font-black tracking-[0.15em] text-white uppercase">Props</h2>
          <button
            type="button"
            @click="addProp"
            class="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            + Add prop
          </button>
        </div>

        <div v-for="cat in propsByCategory" :key="cat.key" class="mb-4 last:mb-0">
          <h3 class="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">{{ cat.label }}</h3>
          <div class="space-y-3">
            <div
              v-for="prop in cat.props"
              :key="prop.id"
              class="bg-court-900 border border-court-700 rounded-xl p-3"
            >
              <div class="grid grid-cols-2 gap-2 mb-2">
                <label class="block">
                  <span class="block text-[10px] text-zinc-500 mb-1">Label</span>
                  <input v-model="prop.label" type="text" class="w-full bg-court-800 border border-court-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                </label>
                <label class="block">
                  <span class="block text-[10px] text-zinc-500 mb-1">Hint</span>
                  <input v-model="prop.hint" type="text" class="w-full bg-court-800 border border-court-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                </label>
              </div>

              <div class="grid grid-cols-3 gap-2 mb-2">
                <label class="block">
                  <span class="block text-[10px] text-zinc-500 mb-1">Type</span>
                  <select v-model="prop.type" @change="onTypeChange(prop)" class="w-full bg-court-800 border border-court-700 rounded-lg px-2 py-1.5 text-xs text-white">
                    <option value="player">Player</option>
                    <option value="team">Team</option>
                  </select>
                </label>
                <label class="block">
                  <span class="block text-[10px] text-zinc-500 mb-1">Category</span>
                  <select v-model="prop.category" class="w-full bg-court-800 border border-court-700 rounded-lg px-2 py-1.5 text-xs text-white">
                    <option v-for="c in PROP_CATEGORIES" :key="c.key" :value="c.key">{{ c.label }}</option>
                  </select>
                </label>
                <label class="block">
                  <span class="block text-[10px] text-zinc-500 mb-1">Pts</span>
                  <input v-model="prop.points" type="number" class="w-full bg-court-800 border border-court-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                </label>
              </div>

              <div v-if="prop.type === 'player'" class="grid grid-cols-2 gap-2 mb-2">
                <label class="block">
                  <span class="block text-[10px] text-zinc-500 mb-1">Position filter</span>
                  <select v-model="prop.positionFilter" class="w-full bg-court-800 border border-court-700 rounded-lg px-2 py-1.5 text-xs text-white">
                    <option v-for="f in POSITION_FILTERS" :key="f.value" :value="f.value">{{ f.label }}</option>
                  </select>
                </label>
                <label class="block">
                  <span class="block text-[10px] text-zinc-500 mb-1">Max age</span>
                  <input v-model="prop.maxAge" type="number" placeholder="No limit" class="w-full bg-court-800 border border-court-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                </label>
              </div>
              <div v-else class="mb-2">
                <label class="flex items-center gap-2">
                  <input v-model="prop.allowNone" type="checkbox" class="rounded border-court-700 bg-court-800" />
                  <span class="text-[11px] text-zinc-400">Allow "No Team" pick</span>
                </label>
              </div>

              <button
                type="button"
                @click="archiveProp(prop)"
                class="text-[10px] font-bold text-red-400/80 hover:text-red-400 uppercase tracking-wider transition-colors"
              >
                Archive
              </button>
            </div>
          </div>
        </div>

        <div v-if="archivedProps.length" class="mt-4 pt-4 border-t border-court-700">
          <h3 class="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Archived</h3>
          <div class="space-y-2">
            <div
              v-for="prop in archivedProps"
              :key="prop.id"
              class="flex items-center justify-between gap-2 bg-court-900/60 border border-court-700/60 rounded-xl px-3 py-2"
            >
              <span class="text-xs text-zinc-500 truncate">{{ prop.label }}</span>
              <button
                type="button"
                @click="restoreProp(prop)"
                class="text-[10px] font-bold text-emerald-400/80 hover:text-emerald-400 uppercase tracking-wider transition-colors shrink-0"
              >
                Restore
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          @click="saveProps"
          class="mt-4 px-4 py-2 rounded-lg bg-emerald-500 text-court-950 text-xs font-bold uppercase tracking-wider hover:bg-emerald-400 transition-colors"
        >
          Save
        </button>
        <p v-if="saveStatus.props === 'saved'" class="text-[11px] text-emerald-400 mt-2">Saved</p>
        <p v-if="saveStatus.props === 'error'" class="text-[11px] text-red-400 mt-2">Failed to save</p>
      </section>
    </div>
  </div>
</template>

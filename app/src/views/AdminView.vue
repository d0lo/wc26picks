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

const propsByCategory = computed(() =>
  PROP_CATEGORIES
    .map(c => ({ ...c, props: propsForm.items.filter(p => p.category === c.key) }))
    .filter(c => c.props.length)
)

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

async function saveProps() {
  saveStatus.props = 'saving'
  try {
    const props = propsForm.items.map(p => ({ ...p, points: Number(p.points) }))
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
        <h2 class="text-xs font-black tracking-[0.15em] text-white uppercase mb-3">Props</h2>

        <div v-for="cat in propsByCategory" :key="cat.key" class="mb-4 last:mb-0">
          <h3 class="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">{{ cat.label }}</h3>
          <div class="space-y-2">
            <div
              v-for="prop in cat.props"
              :key="prop.id"
              class="grid gap-2 items-end"
              style="grid-template-columns: 1fr 1fr 4.5rem"
            >
              <label class="block">
                <span class="block text-[10px] text-zinc-500 mb-1">Label</span>
                <input
                  v-model="prop.label"
                  type="text"
                  class="w-full bg-court-900 border border-court-700 rounded-lg px-2 py-1.5 text-xs text-white"
                />
              </label>
              <label class="block">
                <span class="block text-[10px] text-zinc-500 mb-1">Hint</span>
                <input
                  v-model="prop.hint"
                  type="text"
                  class="w-full bg-court-900 border border-court-700 rounded-lg px-2 py-1.5 text-xs text-white"
                />
              </label>
              <label class="block">
                <span class="block text-[10px] text-zinc-500 mb-1">Pts</span>
                <input
                  v-model="prop.points"
                  type="number"
                  class="w-full bg-court-900 border border-court-700 rounded-lg px-2 py-1.5 text-xs text-white"
                />
              </label>
            </div>
          </div>
        </div>

        <button
          type="button"
          @click="saveProps"
          class="mt-2 px-4 py-2 rounded-lg bg-emerald-500 text-court-950 text-xs font-bold uppercase tracking-wider hover:bg-emerald-400 transition-colors"
        >
          Save
        </button>
        <p v-if="saveStatus.props === 'saved'" class="text-[11px] text-emerald-400 mt-2">Saved</p>
        <p v-if="saveStatus.props === 'error'" class="text-[11px] text-red-400 mt-2">Failed to save</p>
      </section>
    </div>
  </div>
</template>

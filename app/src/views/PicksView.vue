<script setup>
import { reactive, ref, computed, inject, watch } from 'vue'
import { useRouter } from 'vue-router'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { GROUP_TEAMS, GROUPS, PROPS, orderedPropCategories, TEAM_FLAG, FIFA_RANKING, TEAM_ID, TEAM_BY_ID } from '../data.js'
import { ROSTERS } from '../rosters.js'
import { pickQueryOptions, queryKeys } from '../queries.js'
import CountrySelect from '../components/CountrySelect.vue'
import PlayerSelect from '../components/PlayerSelect.vue'
import GroupOverlayPanel from '../components/GroupOverlayPanel.vue'

const router = useRouter()
const user = inject('user')
const picksLocked = inject('picksLocked')
const picksLockTime = inject('picksLockTime')
const queryClient = useQueryClient()

function fmtLockTime(ts) {
  if (!ts) return null
  const d = ts?.toDate?.() ?? new Date(ts)
  const time = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  const isToday = new Date().toDateString() === d.toDateString()
  if (isToday) return `at ${time}`
  const date = d.toLocaleString('en-US', { month: 'short', day: 'numeric' })
  return `on ${date} at ${time}`
}

// ── State ──────────────────────────────────────────────────────────────
// order[group] = [1st, 2nd, 3rd, 4th] — default sorted by FIFA ranking
function fifaOrder(group) {
  return [...GROUP_TEAMS[group]].sort((a, b) => (FIFA_RANKING[a] ?? 999) - (FIFA_RANKING[b] ?? 999))
}

const order = reactive(Object.fromEntries(GROUPS.map(g => [g, fifaOrder(g)])))
const wildcards = ref([])
const propAnswers = reactive(Object.fromEntries(PROPS.map(p => [p.key, ''])))
const submitting = ref(false)
const submitError = ref('')
const isUpdate = ref(false)
const savedSnapshot = ref(null)
const loaded = ref(false)

function makeSnapshot() {
  return JSON.stringify({
    groups: Object.fromEntries(GROUPS.map(g => [g, [...order[g]]])),
    wildcards: [...wildcards.value].sort(),
    props: Object.fromEntries(PROPS.map(p => [p.key, propAnswers[p.key]])),
  })
}

function picksChanged() {
  if (!savedSnapshot.value) return true
  return makeSnapshot() !== savedSnapshot.value
}

// ── Pre-populate from existing pick ───────────────────────────────────
const pickQuery = useQuery(computed(() => pickQueryOptions(user.value?.uid)))

watch(pickQuery.isFetched, (fetched) => {
  if (!fetched) return
  const data = pickQuery.data.value
  if (data) {
    isUpdate.value = true
    if (data.groups) {
      for (const [g, teamIds] of Object.entries(data.groups)) {
        // teamIds are UUIDs — map back to team names for the drag-drop UI
        const names = teamIds.map(id => TEAM_BY_ID[id]?.name).filter(Boolean)
        if (names.length === 4 && order[g]) order[g] = names
      }
    }
    if (data.wildcards) wildcards.value = [...data.wildcards]
    if (data.props) Object.assign(propAnswers, data.props)
    savedSnapshot.value = makeSnapshot()
  }
  loaded.value = true
}, { immediate: true })

// ── Drag and drop ──────────────────────────────────────────────────────
const drag = reactive({ group: null, item: null })
let _dragSaved = null // order snapshot before drag; cleared on valid drop

function onDragStart(e, group, team) {
  drag.group = group
  drag.item = team
  _dragSaved = { group, order: [...order[group]] }
  e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(e, group, idx) {
  e.preventDefault()
  if (drag.group !== group || !drag.item) return
  const arr = order[group]
  const from = arr.indexOf(drag.item)
  if (from === idx) return
  arr.splice(from, 1)
  arr.splice(idx, 0, drag.item)
}

function onDrop(e) {
  e.preventDefault()
  _dragSaved = null // valid drop within group — keep new order
}

function onDragEnd() {
  if (_dragSaved) {
    // Dropped outside the group card — restore original order
    order[_dragSaved.group].splice(0, Infinity, ..._dragSaved.order)
  }
  drag.group = null
  drag.item = null
  _dragSaved = null
}

// ── Touch drag (mobile) ────────────────────────────────────────────────
const touch = reactive({ group: null, item: null })
let _touchSaved = null // order snapshot before touch drag

function onTouchStart(e, group, team) {
  touch.group = group
  touch.item = team
  drag.group = group
  drag.item = team
  _touchSaved = { group, order: [...order[group]] }
}

function onTouchMove(e) {
  if (!touch.item) return
  e.preventDefault()
  const t = e.touches[0]
  // Temporarily hide the dragged element so elementFromPoint finds the target beneath
  const dragged = e.currentTarget
  dragged.style.visibility = 'hidden'
  const el = document.elementFromPoint(t.clientX, t.clientY)
  dragged.style.visibility = ''
  if (!el) return
  const row = el.closest('[data-drag-row]')
  if (!row) return
  const targetGroup = row.dataset.dragGroup
  const targetIdx = Number(row.dataset.dragIdx)
  if (targetGroup !== touch.group) return
  const arr = order[touch.group]
  const from = arr.indexOf(touch.item)
  if (from === targetIdx) return
  arr.splice(from, 1)
  arr.splice(targetIdx, 0, touch.item)
}

function onTouchEnd(e) {
  if (_touchSaved && touch.group) {
    const t = e.changedTouches[0]
    const el = document.elementFromPoint(t.clientX, t.clientY)
    const groupEl = el?.closest('[data-group]')
    if (groupEl?.dataset.group !== touch.group) {
      // Finger lifted outside the group card — restore original order
      order[_touchSaved.group].splice(0, Infinity, ..._touchSaved.order)
    }
  }
  touch.group = null
  touch.item = null
  drag.group = null
  drag.item = null
  _touchSaved = null
}

function resetGroup(group) {
  order[group] = fifaOrder(group)
}

// ── Wildcard logic ─────────────────────────────────────────────────────
function thirdOf(group) {
  return order[group][2] ?? null
}

function toggleWildcard(group) {
  const i = wildcards.value.indexOf(group)
  if (i >= 0) wildcards.value.splice(i, 1)
  else if (wildcards.value.length < 8) wildcards.value.push(group)
}

function wcDisabled(group) {
  return wildcards.value.length >= 8 && !wildcards.value.includes(group)
}

// ── Progress ───────────────────────────────────────────────────────────
const doneProps = computed(() => PROPS.filter(p => propAnswers[p.key] !== '').length)
const propsByCategory = computed(() =>
  orderedPropCategories().map(c => ({ ...c, props: PROPS.filter(p => p.category === c.key) })).filter(c => c.props.length)
)
const canSubmit = computed(
  () => !picksLocked.value && wildcards.value.length === 8 && doneProps.value === PROPS.length
)

// ── Submit ─────────────────────────────────────────────────────────────
async function submit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const changed = picksChanged()
    await setDoc(doc(db, 'picks', user.value.uid), {
      name: user.value.displayName,
      uid: user.value.uid,
      photoURL: user.value.photoURL ?? null,
      ...(changed ? { submittedAt: serverTimestamp() } : {}),
      // Store team UUIDs, not names
      groups: Object.fromEntries(GROUPS.map(g => [g, order[g].map(name => TEAM_ID[name])])),
      wildcards: wildcards.value,
      // Props already store UUIDs (from CountrySelect/PlayerSelect); cleanGroupTeam null-safe
      props: Object.fromEntries(
        PROPS.map(p => [p.key, propAnswers[p.key] === '' ? null : propAnswers[p.key]])
      ),
    }, { merge: true })
    queryClient.invalidateQueries({ queryKey: queryKeys.pick(user.value.uid) })
    queryClient.invalidateQueries({ queryKey: queryKeys.picksList })
    router.push('/leaderboard')
  } catch {
    submitError.value = 'Save failed — check your connection and try again.'
    submitting.value = false
  }
}

// ── Sticky group preview ───────────────────────────────────────────────
// Mobile sticky overlay (grid/ticker) is rendered + tracked by
// GroupOverlayPanel; the desktop side-rail panels below just mirror its
// pinnedGroups, exposed via template ref, to avoid a second scroll tracker.
const groupCardRefs = reactive({})
const wildcardsSectionRef = ref(null)
const propsSectionRef = ref(null)
const overlayPanelRef = ref(null)
const pinnedGroups = computed(() => overlayPanelRef.value?.pinnedGroups ?? [])
const leftPinnedGroups = computed(() => pinnedGroups.value.slice(0, 6))
const rightPinnedGroups = computed(() => pinnedGroups.value.slice(6))

function getGroupCardRefs() {
  return groupCardRefs
}
function getWildcardsSectionEl() {
  return wildcardsSectionRef.value
}
function getHeaderEl() {
  return document.querySelector('header')
}
function resolveTeamFlag(team) {
  return TEAM_FLAG[team] ?? '🏳️'
}

// ── Position styles ────────────────────────────────────────────────────
const POS_COLORS = [
  'bg-amber-400 text-zinc-900',
  'bg-zinc-300 text-zinc-900',
  'bg-amber-700 text-amber-100',
  'bg-zinc-700 text-zinc-300',
]
</script>

<template>
  <div>

    <!-- ── Mobile: sticky top rows ── -->
    <GroupOverlayPanel
      ref="overlayPanelRef"
      :groups="order"
      :wildcards="wildcards"
      :resolve-flag="resolveTeamFlag"
      :get-group-card-refs="getGroupCardRefs"
      :get-wildcards-section-el="getWildcardsSectionEl"
      :get-anchor-el="getHeaderEl"
      :columns="1"
    />

    <!-- ── Desktop: fixed left panel ── -->
      <!-- wide: single left panel, 2 cols -->
      <div
        v-if="pinnedGroups.length"
        class="hidden min-[1248px]:block fixed top-16 z-[60] mt-4"
        style="right: calc(50% + 340px); width: min(312px, calc(50vw - 348px))"
      >
        <TransitionGroup name="pin" tag="div" class="grid gap-2" style="grid-template-columns: repeat(auto-fill, calc(4 * 1.5rem + 3 * 0.25rem + 2 * 0.75rem + 2px)); justify-content: end">
          <div
            v-for="group in pinnedGroups" :key="group"
            class="flex flex-col gap-0.5 bg-court-800/80 backdrop-blur-sm border border-court-700/60 rounded-xl px-3 py-2"
          >
            <span class="text-[10px] font-black tracking-[0.2em] text-emerald-500">{{ group }}</span>
            <div class="flex gap-1">
              <span v-for="(team, i) in order[group]" :key="team" class="relative group/flag cursor-default">
                <span class="text-2xl leading-none transition-opacity" :class="i >= 2 && !(wildcards.includes(group) && i === 2) ? 'opacity-30' : ''">{{ TEAM_FLAG[team] ?? '🏳️' }}</span>
                <span class="pointer-events-none absolute bottom-full left-1/2 -tranzinc-x-1/2 mb-1.5 whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold bg-white text-black shadow-lg opacity-0 group-hover/flag:opacity-100 transition-opacity z-[200]">
                  {{ team }}<span class="text-zinc-400 font-normal"> · #{{ FIFA_RANKING[team] ?? '–' }}</span>
                </span>
              </span>
            </div>
          </div>
        </TransitionGroup>
      </div>

      <!-- narrow desktop: two panels, left and right, 1 col each -->
      <template v-if="pinnedGroups.length">
        <div
          v-if="leftPinnedGroups.length"
          class="hidden min-[964px]:block min-[1248px]:hidden fixed top-16 z-[60] mt-4"
          style="right: calc(50% + 348px)"
        >
          <TransitionGroup name="pin" tag="div" class="grid gap-2" style="grid-template-columns: calc(4 * 1.5rem + 3 * 0.25rem + 2 * 0.75rem + 2px)">
            <div v-for="group in leftPinnedGroups" :key="group" class="flex flex-col gap-0.5 bg-court-800/80 backdrop-blur-sm border border-court-700/60 rounded-xl px-3 py-2">
              <span class="text-[10px] font-black tracking-[0.2em] text-emerald-500">{{ group }}</span>
              <div class="flex gap-1">
                <span v-for="(team, i) in order[group]" :key="team" class="relative group/flag cursor-default">
                  <span class="text-2xl leading-none transition-opacity" :class="i >= 2 && !(wildcards.includes(group) && i === 2) ? 'opacity-30' : ''">{{ TEAM_FLAG[team] ?? '🏳️' }}</span>
                  <span class="pointer-events-none absolute bottom-full left-1/2 -tranzinc-x-1/2 mb-1.5 whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold bg-white text-black shadow-lg opacity-0 group-hover/flag:opacity-100 transition-opacity z-[200]">
                    {{ team }}<span class="text-zinc-400 font-normal"> · #{{ FIFA_RANKING[team] ?? '–' }}</span>
                  </span>
                </span>
              </div>
            </div>
          </TransitionGroup>
        </div>
        <div
          v-if="rightPinnedGroups.length"
          class="hidden min-[964px]:block min-[1248px]:hidden fixed top-16 z-[60] mt-4"
          style="left: calc(50% + 348px)"
        >
          <TransitionGroup name="pin" tag="div" class="grid gap-2" style="grid-template-columns: calc(4 * 1.5rem + 3 * 0.25rem + 2 * 0.75rem + 2px)">
            <div v-for="group in rightPinnedGroups" :key="group" class="flex flex-col gap-0.5 bg-court-800/80 backdrop-blur-sm border border-court-700/60 rounded-xl px-3 py-2">
              <span class="text-[10px] font-black tracking-[0.2em] text-emerald-500">{{ group }}</span>
              <div class="flex gap-1">
                <span v-for="(team, i) in order[group]" :key="team" class="relative group/flag cursor-default">
                  <span class="text-2xl leading-none transition-opacity" :class="i >= 2 && !(wildcards.includes(group) && i === 2) ? 'opacity-30' : ''">{{ TEAM_FLAG[team] ?? '🏳️' }}</span>
                  <span class="pointer-events-none absolute bottom-full left-1/2 -tranzinc-x-1/2 mb-1.5 whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold bg-white text-black shadow-lg opacity-0 group-hover/flag:opacity-100 transition-opacity z-[200]">
                    {{ team }}<span class="text-zinc-400 font-normal"> · #{{ FIFA_RANKING[team] ?? '–' }}</span>
                  </span>
                </span>
              </div>
            </div>
          </TransitionGroup>
        </div>
      </template>

    <!-- ── Content ── -->
    <div class="max-w-2xl mx-auto px-4 pt-4 pb-10">

    <!-- ── SECTION 1: Group Standings ── -->
    <div v-if="!loaded" class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <template v-if="loaded">

    <section class="mt-4 mb-10">
      <div class="flex items-start justify-between mb-5">
        <div>
          <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase">Group Standings</h2>
          <p class="text-[11px] text-zinc-400 mt-1">Drag teams to set your predicted finish order.</p>
        </div>
        <div class="text-right shrink-0">
          <div class="text-[10px] text-zinc-400 font-mono tabular-nums">3 · 3 · 1 · 1 pts</div>
          <div class="text-[10px] text-zinc-500">Perfect Group: +1 pt</div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          v-for="group in GROUPS" :key="group"
          :ref="el => { if (el) groupCardRefs[group] = el }"
          :data-group="group"
          class="rounded-2xl border p-4 bg-court-800 border-court-700"
        >
          <!-- Group card header -->
          <div class="flex items-center justify-between mb-3">
            <span class="text-[11px] font-black tracking-[0.2em] text-emerald-400">GROUP {{ group }}</span>
            <button
              @click="resetGroup(group)"
              :disabled="picksLocked"
              class="text-[10px] transition-colors font-medium"
              :class="picksLocked ? 'text-zinc-800 cursor-not-allowed' : 'text-zinc-400 hover:text-red-400'"
            >reset</button>
          </div>

          <!-- Draggable team rows -->
          <TransitionGroup tag="div" :name="drag.group === group ? '' : 'drag-list'" class="space-y-1">
            <div
              v-for="(team, idx) in order[group]" :key="team"
              :draggable="!picksLocked"
              data-drag-row
              :data-drag-group="group"
              :data-drag-idx="idx"
              @dragstart="!picksLocked && onDragStart($event, group, team)"
              @dragover="!picksLocked && onDragOver($event, group, idx)"
              @drop="!picksLocked && onDrop($event)"
              @dragend="!picksLocked && onDragEnd()"
              @touchstart.passive="!picksLocked && onTouchStart($event, group, team)"
              @touchmove="!picksLocked && onTouchMove($event)"
              @touchend="!picksLocked && onTouchEnd($event)"
              class="flex items-center gap-2 px-2 py-1.5 rounded-xl select-none border"
              :class="[
                picksLocked ? 'cursor-default bg-court-750 border-transparent opacity-60' :
                  drag.group === group && drag.item === team
                    ? 'opacity-30 bg-court-750 border-transparent cursor-grab active:cursor-grabbing'
                    : 'bg-court-750 border-transparent hover:border-court-600 cursor-grab active:cursor-grabbing'
              ]"
            >
              <!-- Position badge -->
              <div
                class="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0"
                :class="POS_COLORS[idx]"
              >{{ idx + 1 }}</div>

              <!-- Flag -->
              <span class="text-base leading-none shrink-0">{{ TEAM_FLAG[team] ?? '🏳️' }}</span>

              <!-- Team name -->
              <span class="text-xs font-medium text-white flex-1 truncate">{{ team }}</span>

              <!-- FIFA rank -->
              <span class="text-[10px] text-zinc-400 font-mono shrink-0">#{{ FIFA_RANKING[team] ?? '–' }}</span>

              <!-- Drag handle -->
              <svg class="w-3 h-3 text-zinc-400 shrink-0" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
                <circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/>
                <circle cx="3" cy="6" r="1.2"/><circle cx="7" cy="6" r="1.2"/>
                <circle cx="3" cy="10" r="1.2"/><circle cx="7" cy="10" r="1.2"/>
                <circle cx="3" cy="14" r="1.2"/><circle cx="7" cy="14" r="1.2"/>
              </svg>
            </div>
          </TransitionGroup>
        </div>
      </div>
    </section>

    <!-- ── SECTION 2: Wildcards ── -->
    <section ref="wildcardsSectionRef" class="mb-10">
      <div class="flex items-baseline justify-between mb-1">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase">Best 3rd-Place Teams</h2>
        <span class="text-[10px] text-zinc-400 font-mono">2 pts each</span>
      </div>
      <p class="text-[11px] text-zinc-400 mb-5">
        Pick 8 groups whose 3rd-place team advances.
        <span
          class="font-mono ml-1 transition-colors"
          :class="wildcards.length === 8 ? 'text-emerald-400' : 'text-zinc-400'"
        >{{ wildcards.length }}/8</span>
      </p>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <button
          v-for="group in GROUPS" :key="group"
          type="button"
          @click="!picksLocked && toggleWildcard(group)"
          :disabled="picksLocked || wcDisabled(group)"
          class="relative text-left p-3 rounded-xl border transition-all duration-150 bg-court-800 border-court-700"
          :class="[
            wcDisabled(group)
              ? 'opacity-30 cursor-not-allowed'
              : 'hover:border-zinc-600 cursor-pointer active:scale-[0.98]',
          ]"
        >
          <div class="text-[10px] font-black tracking-[0.2em] mb-0.5 text-emerald-400">GROUP {{ group }}</div>
          <div class="flex items-center gap-1.5">
            <span class="text-sm leading-none">{{ TEAM_FLAG[thirdOf(group)] ?? '🏳️' }}</span>
            <div class="text-xs font-semibold truncate text-white"
            >{{ thirdOf(group) }}<span class="text-zinc-400 font-normal"> · #{{ FIFA_RANKING[thirdOf(group)] ?? '–' }}</span></div>
          </div>

          <div
            v-if="wildcards.includes(group)"
            class="absolute top-2 right-2 w-3.5 h-3.5 bg-emerald-400 rounded-full flex items-center justify-center"
          >
            <svg width="7" height="5" viewBox="0 0 7 5" fill="none" aria-hidden="true">
              <path d="M1 2.5L2.8 4.3L6 1" stroke="#06101F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </button>
      </div>
    </section>

    <!-- ── SECTION 3: Props (by category) ── -->
    <section
      v-for="cat in propsByCategory" :key="cat.key"
      :ref="cat.key === 'group' ? 'propsSectionRef' : undefined"
      class="mb-10"
    >
      <div class="flex items-baseline justify-between mb-5">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase">{{ cat.label }}</h2>
        <span class="text-[10px] text-zinc-400 font-mono">{{ Math.min(...cat.props.map(p => p.points)) }}–{{ Math.max(...cat.props.map(p => p.points)) }} pts</span>
      </div>
      <div class="space-y-2">
        <div
          v-for="prop in cat.props" :key="prop.key"
          class="bg-court-800 border border-court-700 rounded-2xl p-4"
        >
          <div class="relative mb-3">
            <div class="pr-14">
              <div class="text-xs font-bold text-white">{{ prop.label }}</div>
              <div class="text-[11px] text-zinc-400 mt-0.5">{{ prop.hint }}</div>
            </div>
            <div class="absolute top-0 right-0 text-[10px] font-black text-amber-400/60 bg-amber-400/5 border border-amber-400/10 rounded-full px-2 py-0.5 font-mono leading-5">
              {{ prop.points }}pt{{ prop.points !== 1 ? 's' : '' }}
            </div>
          </div>

          <CountrySelect
            v-if="prop.type === 'team'"
            v-model="propAnswers[prop.key]"
            :disabled="picksLocked"
            :allowNone="prop.key === 'cleanGroupTeam'"
          />
          <PlayerSelect
            v-else-if="prop.type === 'player'"
            v-model="propAnswers[prop.key]"
            :positionFilter="prop.positionFilter ?? null"
            :maxAge="prop.maxAge ?? null"
            :disabled="picksLocked"
          />
          <input
            v-else
            v-model="propAnswers[prop.key]"
            type="number"
            min="0"
            placeholder="e.g. 24"
            :disabled="picksLocked"
            class="w-full bg-court-900 border border-court-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>
    </section>

    <!-- Submit section -->
    <div class="mt-2 mb-10">
      <!-- Locked state -->
      <div v-if="picksLocked" class="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-court-800 border border-court-700">
        <svg class="w-4 h-4 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span class="text-sm font-black tracking-[0.08em] uppercase text-zinc-400">Picks Locked</span>
      </div>
      <!-- Normal submit -->
      <template v-else>
        <p v-if="submitError" class="text-red-400 text-xs text-center mb-2">{{ submitError }}</p>
        <button
          type="button"
          :disabled="!canSubmit || submitting"
          @click="submit"
          class="w-full py-4 rounded-2xl font-black text-sm tracking-[0.08em] uppercase transition-all duration-150"
          :class="canSubmit
            ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_0_32px_-4px_rgba(14,165,233,0.45)] active:scale-[0.99]'
            : 'bg-court-700 text-zinc-400 cursor-not-allowed'"
        >
          <span v-if="submitting" class="flex items-center justify-center gap-2">
            <svg class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" stroke-dasharray="31.4" class="opacity-30"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
            Saving…
          </span>
          <span v-else>{{ isUpdate ? 'Save' : 'Submit Picks' }}</span>
        </button>
        <p v-if="!canSubmit && !submitting" class="text-center text-[11px] text-zinc-400 mt-1.5">
          <span v-if="wildcards.length < 8">{{ 8 - wildcards.length }} wildcard{{ 8 - wildcards.length !== 1 ? 's' : '' }} remaining</span>
          <span v-if="wildcards.length < 8 && doneProps < PROPS.length"> · </span>
          <span v-if="doneProps < PROPS.length">{{ PROPS.length - doneProps }} prop{{ PROPS.length - doneProps !== 1 ? 's' : '' }} remaining</span>
        </p>
        <p v-if="picksLockTime && !picksLocked" class="text-center text-[11px] text-zinc-400 mt-1.5">
          Picks lock {{ fmtLockTime(picksLockTime) }}
        </p>
      </template>
    </div>

    </template><!-- end loaded -->

    </div><!-- end content wrapper -->
  </div>
</template>

<style scoped>
.drag-list-move {
  transition: transform 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.pin-enter-active { transition: all 0.15s ease-out; }
.pin-leave-active { transition: all 0.1s ease-in; }
.pin-enter-from  { opacity: 0; transform: translateY(-6px); }
.pin-leave-to    { opacity: 0; transform: translateY(-4px); }
.pin-move        { transition: transform 0.15s ease; }
.panel-enter-active { transition: all 0.2s ease-out; }
.panel-leave-active { transition: all 0.15s ease-in; }
.panel-enter-from   { opacity: 0; transform: translateX(-8px); }
.panel-leave-to     { opacity: 0; transform: translateX(-8px); }
</style>

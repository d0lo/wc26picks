<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { doc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '../firebase.js'
import { configQueryOptions, queryKeys } from '../queries.js'
import { PROP_CATEGORIES } from '../data.js'
import { useDragList } from '../composables/useDragList.js'

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
const saveError = reactive({ lock: '', scoring: '', props: '' })

// Snapshots of each section's last-saved state, used both to detect "dirty"
// (unsaved changes) and to revert on Cancel. Replaced whenever config data
// loads/refetches or a save succeeds.
function snapshotLock() { return lockTimeInput.value }
function snapshotScoring() { return JSON.stringify(scoringForm) }
function snapshotProps() { return JSON.stringify(propsForm.items) }
const savedSnapshot = reactive({ lock: '', scoring: '', props: '' })

function loadFromConfig(data) {
  if (!data) return
  lockTimeInput.value = toLocalInputValue(data.picksLockAt)
  const s = data.scoring ?? {}
  scoringForm.groupExact = { 1: s.groupExact?.[1] ?? 0, 2: s.groupExact?.[2] ?? 0, 3: s.groupExact?.[3] ?? 0, 4: s.groupExact?.[4] ?? 0 }
  scoringForm.perfectGroupBonus = s.perfectGroupBonus ?? 0
  scoringForm.wildcard = s.wildcard ?? 0
  propsForm.items = (s.props ?? []).map(p => ({ ...p }))
  savedSnapshot.lock = snapshotLock()
  savedSnapshot.scoring = snapshotScoring()
  savedSnapshot.props = snapshotProps()
}

watch(() => configQuery.data.value, loadFromConfig, { immediate: true })

const lockDirty = computed(() => snapshotLock() !== savedSnapshot.lock)
const scoringDirty = computed(() => snapshotScoring() !== savedSnapshot.scoring)
const propsDirty = computed(() => snapshotProps() !== savedSnapshot.props)
const anyDirty = computed(() => lockDirty.value || scoringDirty.value || propsDirty.value)

// Custom confirm dialog (replaces window.confirm so it matches app styling).
// confirmDiscard() resolves true/false once the user picks a button.
const discardConfirm = reactive({ open: false, resolve: null })

function confirmDiscard() {
  return new Promise((resolve) => {
    discardConfirm.open = true
    discardConfirm.resolve = resolve
  })
}

function resolveDiscardConfirm(result) {
  discardConfirm.open = false
  discardConfirm.resolve?.(result)
  discardConfirm.resolve = null
}

async function cancelLock() {
  if (!lockDirty.value) return
  if (!(await confirmDiscard())) return
  lockTimeInput.value = savedSnapshot.lock
  saveStatus.lock = ''
  saveError.lock = ''
}

async function cancelScoring() {
  if (!scoringDirty.value) return
  if (!(await confirmDiscard())) return
  loadFromConfig(configQuery.data.value)
  saveStatus.scoring = ''
  saveError.scoring = ''
}

async function cancelProps() {
  if (!propsDirty.value) return
  if (!(await confirmDiscard())) return
  // Any dialog editing a now-discarded draft must close — its OK would
  // otherwise resurrect a prop (or edit) the user just asked to discard.
  closeDialog()
  propsForm.items = JSON.parse(savedSnapshot.props)
  saveStatus.props = ''
  saveError.props = ''
}

// Warn before leaving the page entirely (route change) with unsaved changes
// in any section.
onBeforeRouteLeave(async () => {
  if (!anyDirty.value) return true
  return await confirmDiscard()
})

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
  PROP_CATEGORIES.map(c => ({ ...c, props: activeProps.value.filter(p => p.category === c.key) }))
)

function addProp(categoryKey) {
  propsForm.items.push({
    id: crypto.randomUUID(),
    key: '',
    label: 'New Prop',
    hint: '',
    type: 'team',
    category: categoryKey,
    points: 0,
    allowNone: false,
  })
}

function restoreProp(prop) {
  delete prop.archived
}

// --- Drag and drop: reorder within a category list, or move across lists
// (which updates the prop's category). Shares useDragList with PicksView's
// team-order drag, so both float the grabbed row with the pointer and
// reflow the rest via the same FLIP transition.
const { drag, start: startDrag, onSettled } = useDragList()
let dragFromCategory = null
let dragSavedOrder = null

let dragMoved = false

function onRowPointerDown(e, prop) {
  // A prop's dialog may be open while the user drags a *different* row —
  // that's fine. But dragging the row whose dialog is currently open would
  // let the in-flight draft and the reordered list disagree about identity,
  // so block it.
  if (dialogPropId.value === prop.id) return
  dragFromCategory = prop.category
  dragSavedOrder = activeProps.value.map(p => p.id)
  dragMoved = false
  startDrag(e, prop.id, {
    containerSelector: '[data-prop-list]',
    onMove(hit) {
      dragMoved = true
      const row = hit?.closest('[data-prop-row]')
      const list = hit?.closest('[data-prop-list]')
      if (row) {
        const targetId = row.dataset.propRow
        const categoryKey = row.dataset.category
        if (targetId !== prop.id) moveDraggedTo(categoryKey, indexInCategory(categoryKey, targetId))
      } else if (list) {
        const categoryKey = list.dataset.propList
        const cat = propsByCategory.value.find(c => c.key === categoryKey)
        if (cat) moveDraggedTo(categoryKey, cat.props.length)
      }
    },
    onEnd(inside) {
      if (!inside) {
        // Dropped outside every category list — revert order and category.
        const dragged = propsForm.items.find(p => p.id === prop.id)
        if (dragged) dragged.category = dragFromCategory
        const others = propsForm.items.filter(p => p.id !== prop.id)
        const restoreAt = dragSavedOrder.indexOf(prop.id)
        const beforeId = dragSavedOrder[restoreAt + 1]
        const insertAt = beforeId ? others.findIndex(p => p.id === beforeId) : others.length
        others.splice(insertAt === -1 ? others.length : insertAt, 0, dragged)
        propsForm.items.splice(0, propsForm.items.length, ...others)
      }
      dragFromCategory = null
      dragSavedOrder = null
    },
  })
}

function indexInCategory(categoryKey, propId) {
  const cat = propsByCategory.value.find(c => c.key === categoryKey)
  if (!cat) return 0
  return cat.props.findIndex(p => p.id === propId)
}

function moveDraggedTo(categoryKey, targetIndexInCategory) {
  const dragged = propsForm.items.find(p => p.id === drag.id)
  if (!dragged) return
  dragged.category = categoryKey

  // Recompute order: pull the dragged prop's underlying items array index
  // out, then splice it back in among the other props of the target
  // category at the requested position, preserving relative order of
  // everyone else (including untouched categories and archived items).
  const others = propsForm.items.filter(p => p.id !== drag.id)
  const catProps = others.filter(p => p.category === categoryKey && !p.archived)
  const insertAfterId = catProps[targetIndexInCategory - 1]?.id
  let insertAt
  if (catProps.length === 0) {
    insertAt = others.length
  } else if (insertAfterId == null) {
    insertAt = others.indexOf(catProps[0])
  } else {
    insertAt = others.findIndex(p => p.id === insertAfterId) + 1
  }
  others.splice(insertAt, 0, dragged)
  propsForm.items.splice(0, propsForm.items.length, ...others)
}

function onRowClick(prop) {
  // A trailing click fires after a real drag (pointerup, then a synthetic
  // click) — ignore it so dragging a row doesn't also pop its dialog open.
  if (dragMoved) { dragMoved = false; return }
  openDialog(prop)
}

function rowStyle(prop) {
  if (drag.id !== prop.id) return null
  const style = { transform: `translate(${drag.dx}px, ${drag.dy}px)`, zIndex: 50 }
  if (!drag.settling) style.transition = 'none'
  return style
}

// --- Prop editor dialog: edits happen on a draft copy, only merged back
// into propsForm.items on OK. Cancel (or closing without OK) discards it.
const dialogPropId = ref(null)
const draft = reactive({})

function openDialog(prop) {
  Object.keys(draft).forEach(k => delete draft[k])
  Object.assign(draft, JSON.parse(JSON.stringify(prop)))
  dialogPropId.value = prop.id
}

function closeDialog() {
  dialogPropId.value = null
}

function dialogTypeChange() {
  if (draft.type === 'player') {
    delete draft.allowNone
  } else {
    delete draft.positionFilter
    delete draft.maxAge
  }
}

function commitDialog() {
  const target = propsForm.items.find(p => p.id === dialogPropId.value)
  if (target) Object.assign(target, JSON.parse(JSON.stringify(draft)))
  closeDialog()
}

function archiveDraft() {
  draft.archived = true
  commitDialog()
}

function invalidateConfig() {
  queryClient.invalidateQueries({ queryKey: queryKeys.config })
}

async function saveLockTime() {
  saveStatus.lock = 'saving'
  saveError.lock = ''
  try {
    const ms = new Date(lockTimeInput.value).getTime()
    await updateDoc(doc(db, 'config', 'public'), { picksLockAt: Timestamp.fromMillis(ms) })
    invalidateConfig()
    savedSnapshot.lock = snapshotLock()
    saveStatus.lock = 'saved'
  } catch (e) {
    saveStatus.lock = 'error'
    saveError.lock = e?.message ?? 'Unknown error'
  }
}

async function saveScoring() {
  saveStatus.scoring = 'saving'
  saveError.scoring = ''
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
    savedSnapshot.scoring = snapshotScoring()
    saveStatus.scoring = 'saved'
  } catch (e) {
    saveStatus.scoring = 'error'
    saveError.scoring = e?.message ?? 'Unknown error'
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
  saveError.props = ''
  try {
    const props = propsForm.items.map(cleanProp)
    await updateDoc(doc(db, 'config', 'public'), { 'scoring.props': props })
    invalidateConfig()
    savedSnapshot.props = snapshotProps()
    saveStatus.props = 'saved'
  } catch (e) {
    saveStatus.props = 'error'
    saveError.props = e?.message ?? 'Unknown error'
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
        </div>
        <div class="flex items-center gap-2 mt-3">
          <button
            type="button"
            @click="saveLockTime"
            :disabled="!lockDirty"
            class="px-4 py-2 rounded-lg bg-emerald-500 text-court-950 text-xs font-bold uppercase tracking-wider hover:bg-emerald-400 transition-colors disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            @click="cancelLock"
            :disabled="!lockDirty"
            class="px-4 py-2 rounded-lg bg-court-700 text-zinc-300 text-xs font-bold uppercase tracking-wider hover:bg-court-600 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
        <p v-if="saveStatus.lock === 'saved'" class="text-[11px] text-emerald-400 mt-2">Saved</p>
        <p v-if="saveStatus.lock === 'error'" class="text-[11px] text-red-400 mt-2">Failed to save{{ saveError.lock ? `: ${saveError.lock}` : '' }}</p>
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
        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="saveScoring"
            :disabled="!scoringDirty"
            class="px-4 py-2 rounded-lg bg-emerald-500 text-court-950 text-xs font-bold uppercase tracking-wider hover:bg-emerald-400 transition-colors disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            @click="cancelScoring"
            :disabled="!scoringDirty"
            class="px-4 py-2 rounded-lg bg-court-700 text-zinc-300 text-xs font-bold uppercase tracking-wider hover:bg-court-600 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
        <p v-if="saveStatus.scoring === 'saved'" class="text-[11px] text-emerald-400 mt-2">Saved</p>
        <p v-if="saveStatus.scoring === 'error'" class="text-[11px] text-red-400 mt-2">Failed to save{{ saveError.scoring ? `: ${saveError.scoring}` : '' }}</p>
      </section>

      <!-- Props catalog -->
      <section class="bg-court-800 border border-court-700 rounded-2xl p-4">
        <h2 class="text-xs font-black tracking-[0.15em] text-white uppercase mb-3">Props</h2>

        <div v-for="cat in propsByCategory" :key="cat.key" class="mb-4 last:mb-0">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{{ cat.label }}</h3>
            <button
              type="button"
              @click="addProp(cat.key)"
              class="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              + Add Prop
            </button>
          </div>

          <TransitionGroup
            tag="div"
            name="drag-list"
            :data-prop-list="cat.key"
            class="space-y-1.5 min-h-[2.5rem] rounded-xl"
          >
            <div
              v-for="prop in cat.props"
              :key="prop.id"
              :data-prop-row="prop.id"
              :data-category="cat.key"
              @pointerdown="onRowPointerDown($event, prop)"
              @transitionend="onSettled(prop.id)"
              @click="onRowClick(prop)"
              class="flex items-center gap-2 px-2 py-1.5 rounded-xl select-none border touch-none cursor-grab active:cursor-grabbing"
              :class="[
                drag.id === prop.id
                  ? ['opacity-30 bg-court-750 border-transparent shadow-xl shadow-black/40 cursor-grabbing', drag.settling && 'drag-settle']
                  : 'bg-court-750 border-transparent hover:border-court-600'
              ]"
              :style="rowStyle(prop)"
            >
              <svg class="w-3 h-3 text-zinc-400 shrink-0" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
                <circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/>
                <circle cx="3" cy="6" r="1.2"/><circle cx="7" cy="6" r="1.2"/>
                <circle cx="3" cy="10" r="1.2"/><circle cx="7" cy="10" r="1.2"/>
                <circle cx="3" cy="14" r="1.2"/><circle cx="7" cy="14" r="1.2"/>
              </svg>
              <span class="flex-1 text-xs font-medium text-white truncate">{{ prop.label }}</span>
              <span class="text-[10px] text-emerald-400 font-mono shrink-0">{{ prop.points }} pts</span>
            </div>
            <p v-if="!cat.props.length" key="empty" class="text-[11px] text-zinc-600 italic px-1 py-1">No props yet.</p>
          </TransitionGroup>
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

        <div class="flex items-center gap-2 mt-4">
          <button
            type="button"
            @click="saveProps"
            :disabled="!propsDirty"
            class="px-4 py-2 rounded-lg bg-emerald-500 text-court-950 text-xs font-bold uppercase tracking-wider hover:bg-emerald-400 transition-colors disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            @click="cancelProps"
            :disabled="!propsDirty"
            class="px-4 py-2 rounded-lg bg-court-700 text-zinc-300 text-xs font-bold uppercase tracking-wider hover:bg-court-600 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
        <p v-if="saveStatus.props === 'saved'" class="text-[11px] text-emerald-400 mt-2">Saved</p>
        <p v-if="saveStatus.props === 'error'" class="text-[11px] text-red-400 mt-2">Failed to save{{ saveError.props ? `: ${saveError.props}` : '' }}</p>
      </section>
    </div>

    <!-- Prop editor dialog -->
    <div v-if="dialogPropId" class="fixed inset-0 z-[200] flex items-center justify-center p-4" @mousedown.self="closeDialog">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div class="relative w-full max-w-sm mx-auto bg-court-800 border border-court-700 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-court-700">
          <h2 class="text-xs font-black tracking-[0.15em] text-white uppercase">Edit Prop</h2>
          <button
            type="button"
            @click="archiveDraft"
            aria-label="Archive prop"
            class="text-red-400/80 hover:text-red-400 transition-colors"
          >
            <svg class="w-4 h-4" viewBox="0 0 20 20" fill="none">
              <path d="M6 2h8M3 5h14M8 8v6M12 8v6M4 5l1 11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1L16 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <div class="p-4 space-y-3">
          <label class="block">
            <span class="block text-[10px] text-zinc-500 mb-1">Label</span>
            <input v-model="draft.label" type="text" class="w-full bg-court-900 border border-court-700 rounded-lg px-3 py-2 text-sm text-white" />
          </label>
          <label class="block">
            <span class="block text-[10px] text-zinc-500 mb-1">Hint</span>
            <input v-model="draft.hint" type="text" class="w-full bg-court-900 border border-court-700 rounded-lg px-3 py-2 text-sm text-white" />
          </label>

          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="block text-[10px] text-zinc-500 mb-1">Type</span>
              <select v-model="draft.type" @change="dialogTypeChange" class="w-full bg-court-900 border border-court-700 rounded-lg px-2 py-2 text-sm text-white">
                <option value="player">Player</option>
                <option value="team">Team</option>
              </select>
            </label>
            <label class="block">
              <span class="block text-[10px] text-zinc-500 mb-1">Points</span>
              <input v-model="draft.points" type="number" class="w-full bg-court-900 border border-court-700 rounded-lg px-2 py-2 text-sm text-white" />
            </label>
          </div>

          <div v-if="draft.type === 'player'" class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="block text-[10px] text-zinc-500 mb-1">Position filter</span>
              <select v-model="draft.positionFilter" class="w-full bg-court-900 border border-court-700 rounded-lg px-2 py-2 text-sm text-white">
                <option v-for="f in POSITION_FILTERS" :key="f.value" :value="f.value">{{ f.label }}</option>
              </select>
            </label>
            <label class="block">
              <span class="block text-[10px] text-zinc-500 mb-1">Max age</span>
              <input v-model="draft.maxAge" type="number" placeholder="No limit" class="w-full bg-court-900 border border-court-700 rounded-lg px-2 py-2 text-sm text-white" />
            </label>
          </div>
          <label v-else class="flex items-center gap-2">
            <input v-model="draft.allowNone" type="checkbox" class="rounded border-court-700 bg-court-900" />
            <span class="text-[11px] text-zinc-400">Allow "No Team" pick</span>
          </label>
        </div>

        <div class="flex items-center gap-2 px-4 pb-4">
          <button
            type="button"
            @click="commitDialog"
            class="flex-1 py-2.5 rounded-xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-white transition-colors"
          >
            OK
          </button>
          <button
            type="button"
            @click="closeDialog"
            class="flex-1 py-2.5 rounded-xl font-bold text-sm bg-court-700 hover:bg-court-600 text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Discard-changes confirm dialog -->
    <div v-if="discardConfirm.open" class="fixed inset-0 z-[210] flex items-center justify-center p-4" @mousedown.self="resolveDiscardConfirm(false)">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div class="relative w-full max-w-xs mx-auto bg-court-800 border border-court-700 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden p-5">
        <p class="text-sm text-white text-center mb-4">Are you sure you want to discard your changes?</p>
        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="resolveDiscardConfirm(true)"
            class="flex-1 py-2.5 rounded-xl font-bold text-sm bg-red-500 hover:bg-red-400 text-white transition-colors"
          >
            Discard
          </button>
          <button
            type="button"
            @click="resolveDiscardConfirm(false)"
            class="flex-1 py-2.5 rounded-xl font-bold text-sm bg-court-700 hover:bg-court-600 text-white transition-colors"
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drag-list-move {
  transition: transform 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.drag-settle {
  transition: transform 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
</style>

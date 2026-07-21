<script setup>
import { computed, reactive, ref, watch } from 'vue'
import draggable from 'vuedraggable'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { doc, updateDoc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '../firebase.js'
import { configQueryOptions, propResultsQueryOptions, propOverridesQueryOptions, queryKeys } from '../queries.js'
import { PROP_CATEGORIES, TEAM_BY_ID, TEAM_FLAG } from '../data.js'
import { ROSTERS } from '../rosters.js'
import { ROUNDS, ROUND_LABELS, ROUND_POINTS } from '../bracket.js'
import PlayerSelect from '../components/PlayerSelect.vue'
import CountrySelect from '../components/CountrySelect.vue'

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
const knockoutLockInput = reactive({ value: '' })
const scoringForm = reactive({ groupExact: { 1: 0, 2: 0, 3: 0, 4: 0 }, perfectGroupBonus: 0, wildcard: 0, knockout: { r32: 0, r16: 0, qf: 0, sf: 0, final: 0 } })
const propsForm = reactive({ items: [] })
// Manual prop-winner overrides — mirrors config/propResults.overrides:
// { [propId]: { winners: [entityIds], noWinner?: true } }. The prop engine
// merges these over its auto-computed winners (manual always wins), so
// deleting an entry here reverts that prop to auto grading.
const winnersForm = reactive({ overrides: {} })

const saveStatus = reactive({ lock: '', knockoutLock: '', scoring: '', props: '', winners: '' })
const saveError = reactive({ lock: '', knockoutLock: '', scoring: '', props: '', winners: '' })

// Snapshots of each section's last-saved state, used both to detect "dirty"
// (unsaved changes) and to revert on Cancel. Replaced whenever config data
// loads/refetches or a save succeeds.
function snapshotLock() { return lockTimeInput.value }
function snapshotKnockoutLock() { return knockoutLockInput.value }
function snapshotScoring() { return JSON.stringify(scoringForm) }
// Snapshot the SAVE PAYLOAD (cleanProp-normalized), not the raw rows — a
// Firestore round-trip reorders map keys and legacy docs carry stray/absent
// fields, so raw-JSON comparison could read as "dirty" (enabling Save and
// the discard prompt) when nothing was actually changed.
function snapshotProps() { return JSON.stringify(propsForm.items.map(cleanProp)) }
// Same idea for the winner overrides: reduce to the canonical shape the save
// writes — sorted prop ids, fixed entry key order, empty entries dropped —
// so a server round-trip can never differ from an unchanged form.
function canonicalOverrides(overrides) {
  const out = {}
  for (const id of Object.keys(overrides ?? {}).sort()) {
    const o = overrides[id]
    if (!o) continue
    if (o.noWinner) out[id] = { winners: [], noWinner: true }
    else if (o.winners?.length) out[id] = { winners: [...o.winners] }
  }
  return out
}
function snapshotWinners() { return JSON.stringify(canonicalOverrides(winnersForm.overrides)) }
const savedSnapshot = reactive({ lock: '', knockoutLock: '', scoring: '', props: '', winners: '' })

const activeProps = computed(() => propsForm.items.filter(p => !p.archived))
const archivedProps = computed(() => propsForm.items.filter(p => p.archived))

const propsByCategory = computed(() =>
  PROP_CATEGORIES.map(c => ({ ...c, props: activeProps.value.filter(p => p.category === c.key) }))
)

// One reactive array per category, bound via vuedraggable with a shared
// `group` so rows can be dragged between category lists, not just reordered
// within one. After every drag-driven change, the dragged prop's category is
// corrected to match wherever it landed and the canonical propsForm.items
// order is rebuilt from the category lists.
const categoryLists = reactive(Object.fromEntries(PROP_CATEGORIES.map(c => [c.key, []])))

function rebuildCategoryLists() {
  for (const cat of PROP_CATEGORIES) {
    categoryLists[cat.key] = activeProps.value.filter(p => p.category === cat.key)
  }
}

function loadFromConfig(data) {
  if (!data) return
  lockTimeInput.value = toLocalInputValue(data.picksLockAt)
  knockoutLockInput.value = toLocalInputValue(data.knockoutLockAt)
  const s = data.scoring ?? {}
  scoringForm.groupExact = { 1: s.groupExact?.[1] ?? 0, 2: s.groupExact?.[2] ?? 0, 3: s.groupExact?.[3] ?? 0, 4: s.groupExact?.[4] ?? 0 }
  scoringForm.perfectGroupBonus = s.perfectGroupBonus ?? 0
  scoringForm.wildcard = s.wildcard ?? 0
  scoringForm.knockout = Object.fromEntries(ROUNDS.map((r) => [r, s.knockout?.[r] ?? ROUND_POINTS[r] ?? 0]))
  // Coalesce any legacy `category` (e.g. 'group'/'knockout' from before props
  // were unified) onto the single tournament category so older docs still
  // render and edit instead of silently dropping out of every category list.
  const KNOWN_CATEGORIES = new Set(PROP_CATEGORIES.map(c => c.key))
  propsForm.items = (s.props ?? []).map(p => ({
    ...p,
    category: KNOWN_CATEGORIES.has(p.category) ? p.category : 'tournament',
  }))
  rebuildCategoryLists()
  savedSnapshot.lock = snapshotLock()
  savedSnapshot.knockoutLock = snapshotKnockoutLock()
  savedSnapshot.scoring = snapshotScoring()
  savedSnapshot.props = snapshotProps()
}

watch(() => configQuery.data.value, loadFromConfig, { immediate: true })

// ── Prop winners (manual grading) ──────────────────────────────────────
// liveData/propResults is the engine's merged output (auto + manual) — shown
// read-only as "what's currently graded". config/propResults.overrides is
// the editable manual input this section saves.
const propResultsQuery = useQuery(propResultsQueryOptions())
const overridesQuery = useQuery(propOverridesQueryOptions())

const PLAYER_BY_ID = {}
for (const [teamName, players] of Object.entries(ROSTERS)) {
  for (const p of players) PLAYER_BY_ID[p.id] = { ...p, team: teamName }
}

function loadFromOverrides(data) {
  winnersForm.overrides = canonicalOverrides(data?.overrides)
  savedSnapshot.winners = snapshotWinners()
}

// Baseline an empty-but-clean form until the real doc arrives, so the
// pre-load state can never read as dirty.
loadFromOverrides(null)

// The grading rows/dialog stay disabled until the saved overrides have
// actually loaded — otherwise a dialog opened during the initial fetch is
// seeded from an empty form, and committing it (then saving) would silently
// overwrite the manual winners already stored on the server.
const winnersLoaded = ref(false)

// Reloads are guarded two ways: never before the first real fetch resolves,
// and never over unsaved edits (a background refetch — staleTime 0, focus
// refetch, or another writer poking config/propResults — must not wipe a
// dirty form; explicit Cancel is the only path that discards one).
watch(() => overridesQuery.data.value, (data) => {
  if (data === undefined) return
  if (winnersLoaded.value && snapshotWinners() !== savedSnapshot.winners) return
  loadFromOverrides(data)
  winnersLoaded.value = true
}, { immediate: true })

const lockDirty = computed(() => snapshotLock() !== savedSnapshot.lock)
const knockoutLockDirty = computed(() => snapshotKnockoutLock() !== savedSnapshot.knockoutLock)
const scoringDirty = computed(() => snapshotScoring() !== savedSnapshot.scoring)
const propsDirty = computed(() => snapshotProps() !== savedSnapshot.props)
const winnersDirty = computed(() => snapshotWinners() !== savedSnapshot.winners)
const anyDirty = computed(() => lockDirty.value || knockoutLockDirty.value || scoringDirty.value || propsDirty.value || winnersDirty.value)

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

async function cancelKnockoutLock() {
  if (!knockoutLockDirty.value) return
  if (!(await confirmDiscard())) return
  knockoutLockInput.value = savedSnapshot.knockoutLock
  saveStatus.knockoutLock = ''
  saveError.knockoutLock = ''
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
  rebuildCategoryLists()
  saveStatus.props = ''
  saveError.props = ''
}

async function cancelWinners() {
  if (!winnersDirty.value) return
  if (!(await confirmDiscard())) return
  closeWinnerDialog()
  loadFromOverrides(overridesQuery.data.value)
  saveStatus.winners = ''
  saveError.winners = ''
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
    manual: false,
  })
  rebuildCategoryLists()
}

function restoreProp(prop) {
  delete prop.archived
  rebuildCategoryLists()
}

function onCategoryListChange(categoryKey, evt) {
  if (evt.added) evt.added.element.category = categoryKey
  const archived = propsForm.items.filter(p => p.archived)
  const ordered = PROP_CATEGORIES.flatMap(c => categoryLists[c.key])
  propsForm.items.splice(0, propsForm.items.length, ...ordered, ...archived)
}

function onRowClick(prop) {
  openDialog(prop)
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
  rebuildCategoryLists()
}

function archiveDraft() {
  // A prop that was never saved has nothing to preserve for existing
  // picks — archiving it would just leave a dead, never-visible row
  // sitting in the Archived list forever. Delete it outright instead.
  const savedIds = new Set(JSON.parse(savedSnapshot.props).map(p => p.id))
  if (!savedIds.has(draft.id)) {
    propsForm.items = propsForm.items.filter(p => p.id !== draft.id)
    closeDialog()
    rebuildCategoryLists()
    return
  }
  draft.archived = true
  commitDialog()
}

// --- Prop-winner grading dialog: same draft-copy pattern as the prop
// editor above — edits land in winnersForm.overrides only on OK.
const winnerDialogPropId = ref(null)
const winnerDraft = reactive({ winners: [], noWinner: false })
const winnerPickerValue = ref('')

const winnerDialogProp = computed(() => propsForm.items.find(p => p.id === winnerDialogPropId.value) ?? null)

function openWinnerDialog(prop) {
  const existing = winnersForm.overrides[prop.id]
  winnerDraft.winners = [...(existing?.winners ?? [])]
  winnerDraft.noWinner = !!existing?.noWinner
  winnerPickerValue.value = ''
  winnerDialogPropId.value = prop.id
}

function closeWinnerDialog() {
  winnerDialogPropId.value = null
}

// The picker (PlayerSelect/CountrySelect) is add-only here: each selection is
// appended to the draft winner list and the picker resets, so ties/multiple
// winners (e.g. two hat-trick scorers) can all be entered.
watch(winnerPickerValue, (id) => {
  if (!id) return
  if (!winnerDraft.winners.includes(id)) winnerDraft.winners.push(id)
  winnerDraft.noWinner = false
  winnerPickerValue.value = ''
})

function removeDraftWinner(id) {
  winnerDraft.winners = winnerDraft.winners.filter(w => w !== id)
}

function commitWinnerDialog() {
  const id = winnerDialogPropId.value
  if (winnerDraft.noWinner) {
    winnersForm.overrides[id] = { winners: [], noWinner: true }
  } else if (winnerDraft.winners.length) {
    winnersForm.overrides[id] = { winners: [...winnerDraft.winners] }
  } else {
    // No winners and not explicitly "no winner" — clear the override so the
    // prop reverts to auto grading.
    delete winnersForm.overrides[id]
  }
  closeWinnerDialog()
}

// Display helpers for the section rows + dialog. The engine's merged output
// (liveData/propResults) is the graded truth; an unsaved draft override is
// previewed in its place so the admin sees what Save will produce.
function engineEntry(propId) {
  return propResultsQuery.data.value?.results?.[propId] ?? null
}

function effectiveEntry(propId) {
  const override = winnersForm.overrides[propId]
  if (override && (override.noWinner || override.winners?.length)) return { ...override, source: 'manual' }
  return engineEntry(propId)
}

function winnerMode(prop) {
  const entry = effectiveEntry(prop.id)
  if (!entry) return 'ungraded'
  if (entry.source === 'manual') return 'manual'
  return entry.noWinner || entry.winners?.length ? 'auto' : 'ungraded'
}

// { flag, name } for a winner entity id, resolved per the prop's pick type.
function entityView(prop, id) {
  if (prop.type === 'player') {
    const p = PLAYER_BY_ID[id]
    return { flag: TEAM_FLAG[p?.team] ?? '⚽', name: p?.name ?? '—' }
  }
  return { flag: TEAM_BY_ID[id]?.flag ?? '🏳️', name: TEAM_BY_ID[id]?.name ?? '—' }
}

function winnerSummary(prop) {
  const entry = effectiveEntry(prop.id)
  if (!entry) return []
  if (entry.noWinner) return [{ flag: '🚫', name: 'No Team' }]
  return (entry.winners ?? []).map((id) => entityView(prop, id))
}

async function saveWinners() {
  if (!winnersLoaded.value) return
  saveStatus.winners = 'saving'
  saveError.winners = ''
  try {
    // Full overwrite (not merge) so cleared overrides actually disappear;
    // the prop engine listens to this doc and re-grades on every save.
    await setDoc(doc(db, 'config', 'propResults'), { overrides: canonicalOverrides(winnersForm.overrides) })
    queryClient.invalidateQueries({ queryKey: queryKeys.propOverrides })
    // The engine recomputes liveData/propResults asynchronously — refetch it
    // shortly so the section reflects the newly-graded winners without a
    // manual reload. (Harmless if the engine was a no-op.)
    setTimeout(() => queryClient.invalidateQueries({ queryKey: queryKeys.propResults }), 4000)
    savedSnapshot.winners = snapshotWinners()
    saveStatus.winners = 'saved'
  } catch (e) {
    saveStatus.winners = 'error'
    saveError.winners = e?.message ?? 'Unknown error'
  }
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

async function saveKnockoutLock() {
  saveStatus.knockoutLock = 'saving'
  saveError.knockoutLock = ''
  try {
    const ms = new Date(knockoutLockInput.value).getTime()
    await updateDoc(doc(db, 'config', 'public'), { knockoutLockAt: Timestamp.fromMillis(ms) })
    invalidateConfig()
    savedSnapshot.knockoutLock = snapshotKnockoutLock()
    saveStatus.knockoutLock = 'saved'
  } catch (e) {
    saveStatus.knockoutLock = 'error'
    saveError.knockoutLock = e?.message ?? 'Unknown error'
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
      'scoring.knockout': Object.fromEntries(ROUNDS.map((r) => [r, Number(scoringForm.knockout[r])])),
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
  // `|| 0` (not just Number()) so a malformed/blank points value can't become
  // NaN — NaN survives a save but JSON-serializes to null, which would make
  // the cleaned-snapshot dirty check disagree with itself after a Cancel.
  const base = { id: p.id, key: p.key ?? '', label: p.label, hint: p.hint ?? '', type: p.type, category: p.category, points: Number(p.points) || 0 }
  if (p.archived) base.archived = true
  if (p.manual) base.manual = true
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

      <!-- Knockout bracket lock time -->
      <section class="bg-court-800 border border-court-700 rounded-2xl p-4">
        <h2 class="text-xs font-black tracking-[0.15em] text-white uppercase mb-1">Knockout Lock Time</h2>
        <p class="text-[11px] text-zinc-500 mb-3">When the knockout bracket locks for editing (separate from the group picks lock).</p>
        <div class="flex items-center gap-3">
          <input
            v-model="knockoutLockInput.value"
            type="datetime-local"
            class="flex-1 bg-court-900 border border-court-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </div>
        <div class="flex items-center gap-2 mt-3">
          <button
            type="button"
            @click="saveKnockoutLock"
            :disabled="!knockoutLockDirty"
            class="px-4 py-2 rounded-lg bg-emerald-500 text-court-950 text-xs font-bold uppercase tracking-wider hover:bg-emerald-400 transition-colors disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            @click="cancelKnockoutLock"
            :disabled="!knockoutLockDirty"
            class="px-4 py-2 rounded-lg bg-court-700 text-zinc-300 text-xs font-bold uppercase tracking-wider hover:bg-court-600 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
        <p v-if="saveStatus.knockoutLock === 'saved'" class="text-[11px] text-emerald-400 mt-2">Saved</p>
        <p v-if="saveStatus.knockoutLock === 'error'" class="text-[11px] text-red-400 mt-2">Failed to save{{ saveError.knockoutLock ? `: ${saveError.knockoutLock}` : '' }}</p>
      </section>

      <!-- Group / wildcard scoring -->
      <section class="bg-court-800 border border-court-700 rounded-2xl p-4">
        <h2 class="text-xs font-black tracking-[0.15em] text-white uppercase mb-3">Group Scoring</h2>
        <div class="grid grid-cols-4 gap-2 mb-3">
          <label v-for="pos in [1, 2, 3, 4]" :key="pos" class="block">
            <span class="block text-[10px] text-zinc-400 mb-1">{{ pos }}{{ pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th' }}</span>
            <input
              v-model.number="scoringForm.groupExact[pos]"
              type="number"
              inputmode="numeric"
              class="w-full bg-court-900 border border-court-700 rounded-lg px-2 py-1.5 text-sm text-white"
            />
          </label>
        </div>
        <div class="grid grid-cols-2 gap-2 mb-3">
          <label class="block">
            <span class="block text-[10px] text-zinc-400 mb-1">Perfect group bonus</span>
            <input
              v-model.number="scoringForm.perfectGroupBonus"
              type="number"
              inputmode="numeric"
              class="w-full bg-court-900 border border-court-700 rounded-lg px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label class="block">
            <span class="block text-[10px] text-zinc-400 mb-1">Wildcard (per pick)</span>
            <input
              v-model.number="scoringForm.wildcard"
              type="number"
              inputmode="numeric"
              class="w-full bg-court-900 border border-court-700 rounded-lg px-2 py-1.5 text-sm text-white"
            />
          </label>
        </div>
        <span class="block text-[10px] text-zinc-400 mb-1">Knockout (per correct winner)</span>
        <div class="grid grid-cols-5 gap-2 mb-3">
          <label v-for="r in ROUNDS" :key="r" class="block">
            <span class="block text-[9px] text-zinc-500 mb-1 uppercase">{{ ROUND_LABELS[r].replace('Round of ', 'R') }}</span>
            <input
              v-model.number="scoringForm.knockout[r]"
              type="number"
              inputmode="numeric"
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

          <draggable
            v-model="categoryLists[cat.key]"
            :item-key="'id'"
            group="props"
            tag="div"
            class="space-y-1.5 min-h-[2.5rem] rounded-xl"
            :animation="200"
            :delay="100"
            :delay-on-touch-only="true"
            ghost-class="drag-ghost"
            chosen-class="drag-chosen"
            drag-class="drag-dragging"
            @change="onCategoryListChange(cat.key, $event)"
          >
            <template #item="{ element: prop }">
              <div
                @click="onRowClick(prop)"
                class="flex items-center gap-2 px-2 py-1.5 rounded-xl select-none border cursor-grab active:cursor-grabbing bg-court-750 border-transparent hover:border-court-600"
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
            </template>
            <template #footer>
              <p v-if="!cat.props.length" class="text-[11px] text-zinc-600 italic px-1 py-1">No props yet.</p>
            </template>
          </draggable>
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

      <!-- Prop winners (manual grading) -->
      <section class="bg-court-800 border border-court-700 rounded-2xl p-4">
        <h2 class="text-xs font-black tracking-[0.15em] text-white uppercase mb-1">Prop Winners</h2>
        <p class="text-[11px] text-zinc-500 mb-3">
          Auto-graded props re-resolve themselves after every match. Tap a prop to enter winners by hand —
          a manual entry always overrides the auto result, and is the only way to grade props that can't be
          computed from match data.
        </p>

        <p v-if="!winnersLoaded && overridesQuery.isError" class="text-[11px] text-red-400">
          Failed to load saved winners{{ overridesQuery.error?.message ? `: ${overridesQuery.error.message}` : '' }} — refocus or reload to retry
        </p>
        <p v-else-if="!winnersLoaded" class="text-[11px] text-zinc-600 italic">Loading…</p>
        <div v-else class="space-y-1.5">
          <div
            v-for="prop in activeProps" :key="prop.id"
            @click="openWinnerDialog(prop)"
            class="px-3 py-2 rounded-xl select-none cursor-pointer border bg-court-750 border-transparent hover:border-court-600"
          >
            <div class="flex items-center gap-2">
              <span class="flex-1 text-xs font-medium text-white truncate">{{ prop.label }}</span>
              <span
                class="text-[9px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 shrink-0"
                :class="winnerMode(prop) === 'manual' ? 'text-amber-400 bg-amber-400/10' : winnerMode(prop) === 'auto' ? 'text-emerald-400 bg-emerald-400/10' : 'text-zinc-500 bg-court-900'"
              >{{ winnerMode(prop) === 'manual' ? 'Manual' : winnerMode(prop) === 'auto' ? 'Auto' : 'Ungraded' }}</span>
            </div>
            <div v-if="winnerSummary(prop).length" class="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
              <span v-for="(w, i) in winnerSummary(prop)" :key="i" class="flex items-center gap-1 text-[11px] text-zinc-300">
                <span class="text-sm leading-none">{{ w.flag }}</span>
                <span class="truncate">{{ w.name }}</span>
              </span>
            </div>
            <p v-else class="text-[11px] text-zinc-600 italic mt-1">No winner yet</p>
            <p v-if="winnerMode(prop) !== 'manual' && engineEntry(prop.id)?.unmatched?.length" class="text-[10px] text-amber-400/90 mt-1">
              ⚠ Couldn't match to a roster player: {{ engineEntry(prop.id).unmatched.join(', ') }} — grade manually
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 mt-4">
          <button
            type="button"
            @click="saveWinners"
            :disabled="!winnersDirty"
            class="px-4 py-2 rounded-lg bg-emerald-500 text-court-950 text-xs font-bold uppercase tracking-wider hover:bg-emerald-400 transition-colors disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            @click="cancelWinners"
            :disabled="!winnersDirty"
            class="px-4 py-2 rounded-lg bg-court-700 text-zinc-300 text-xs font-bold uppercase tracking-wider hover:bg-court-600 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
        <p v-if="saveStatus.winners === 'saved'" class="text-[11px] text-emerald-400 mt-2">Saved — picks re-grade automatically in a few seconds</p>
        <p v-if="saveStatus.winners === 'error'" class="text-[11px] text-red-400 mt-2">Failed to save{{ saveError.winners ? `: ${saveError.winners}` : '' }}</p>
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
              <input v-model.number="draft.points" type="number" inputmode="numeric" class="w-full bg-court-900 border border-court-700 rounded-lg px-2 py-2 text-sm text-white" />
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
              <input v-model.number="draft.maxAge" type="number" inputmode="numeric" placeholder="No limit" class="w-full bg-court-900 border border-court-700 rounded-lg px-2 py-2 text-sm text-white" />
            </label>
          </div>
          <label v-else class="flex items-center gap-2">
            <input v-model="draft.allowNone" type="checkbox" class="rounded border-court-700 bg-court-900" />
            <span class="text-[11px] text-zinc-400">Allow "No Team" pick</span>
          </label>

          <label class="flex items-center gap-2">
            <input v-model="draft.manual" type="checkbox" class="rounded border-court-700 bg-court-900" />
            <span class="text-[11px] text-zinc-400">Manually graded (admin enters the correct answer)</span>
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

    <!-- Prop-winner grading dialog -->
    <div v-if="winnerDialogPropId && winnerDialogProp" class="fixed inset-0 z-[200] flex items-center justify-center p-4" @mousedown.self="closeWinnerDialog">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div class="relative w-full max-w-sm mx-auto bg-court-800 border border-court-700 rounded-2xl shadow-2xl shadow-black/60">
        <div class="px-5 py-4 border-b border-court-700">
          <h2 class="text-xs font-black tracking-[0.15em] text-white uppercase">Grade Prop</h2>
          <p class="text-[11px] text-zinc-400 mt-0.5">{{ winnerDialogProp.label }}</p>
        </div>

        <div class="p-4 space-y-3">
          <!-- What the engine currently resolves on its own -->
          <div v-if="engineEntry(winnerDialogPropId)?.source === 'auto'" class="bg-court-900/60 border border-court-700/60 rounded-xl px-3 py-2">
            <div class="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">Auto result</div>
            <div v-if="engineEntry(winnerDialogPropId).noWinner" class="text-[11px] text-zinc-300">🚫 No Team</div>
            <div v-else-if="engineEntry(winnerDialogPropId).winners?.length" class="flex flex-wrap gap-x-3 gap-y-0.5">
              <span v-for="id in engineEntry(winnerDialogPropId).winners" :key="id" class="flex items-center gap-1 text-[11px] text-zinc-300">
                <span class="text-sm leading-none">{{ entityView(winnerDialogProp, id).flag }}</span>
                <span>{{ entityView(winnerDialogProp, id).name }}</span>
              </span>
            </div>
            <p v-if="engineEntry(winnerDialogPropId).unmatched?.length" class="text-[10px] text-amber-400/90 mt-1">
              ⚠ Unmatched: {{ engineEntry(winnerDialogPropId).unmatched.join(', ') }}
            </p>
            <p class="text-[10px] text-zinc-500 mt-1">Manual winners below override this.</p>
          </div>

          <!-- Manual winners -->
          <div>
            <span class="block text-[10px] text-zinc-500 mb-1">Manual winners{{ winnerDialogProp.type === 'player' ? ' (players)' : ' (teams)' }} — every listed entry counts as correct</span>
            <div v-if="winnerDraft.winners.length" class="space-y-1.5 mb-2">
              <div
                v-for="id in winnerDraft.winners" :key="id"
                class="flex items-center gap-2 bg-emerald-500/10 border border-emerald-400/25 rounded-xl px-3 py-2"
              >
                <span class="text-base leading-none shrink-0">{{ entityView(winnerDialogProp, id).flag }}</span>
                <span class="flex-1 text-xs font-medium text-white truncate">{{ entityView(winnerDialogProp, id).name }}</span>
                <button
                  type="button"
                  @click="removeDraftWinner(id)"
                  aria-label="Remove winner"
                  class="text-zinc-400 hover:text-red-400 transition-colors shrink-0"
                >✕</button>
              </div>
            </div>
            <PlayerSelect
              v-if="winnerDialogProp.type === 'player'"
              v-model="winnerPickerValue"
              :position-filter="winnerDialogProp.positionFilter || null"
              :max-age="winnerDialogProp.maxAge ?? null"
            />
            <CountrySelect v-else v-model="winnerPickerValue" placeholder="Add winning team…" />
          </div>

          <label class="flex items-center gap-2">
            <input
              v-model="winnerDraft.noWinner"
              type="checkbox"
              class="rounded border-court-700 bg-court-900"
              @change="winnerDraft.noWinner && (winnerDraft.winners = [])"
            />
            <span class="text-[11px] text-zinc-400">No Winner</span>
          </label>
          <p class="text-[10px] text-zinc-500">Leaving this empty (no winners, box unchecked) reverts the prop to auto grading.</p>
        </div>

        <div class="flex items-center gap-2 px-4 pb-4">
          <button
            type="button"
            @click="commitWinnerDialog"
            class="flex-1 py-2.5 rounded-xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-white transition-colors"
          >
            OK
          </button>
          <button
            type="button"
            @click="closeWinnerDialog"
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
      <div class="relative w-full max-w-sm mx-auto bg-court-800 border border-court-700 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden p-5">
        <p class="text-sm text-white text-center mb-4">Discard your changes?</p>
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
.drag-ghost {
  opacity: 0.3;
}
.drag-chosen {
  box-shadow: 0 12px 24px -6px rgba(0, 0, 0, 0.5);
  cursor: grabbing !important;
}
.drag-dragging {
  box-shadow: 0 12px 24px -6px rgba(0, 0, 0, 0.5);
  transform: scale(1.03);
}
</style>

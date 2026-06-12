<script setup>
import { reactive, ref, computed, onMounted, watch, nextTick } from 'vue'
const appVersion = __APP_VERSION__
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase.js'
import { GROUP_TEAMS, GROUPS, PROPS, TEAM_FLAG, FIFA_RANKING } from '../data.js'
import CountrySelect from '../components/CountrySelect.vue'
import PlayerSelect from '../components/PlayerSelect.vue'
import ProfileModal from '../components/ProfileModal.vue'
import PicksHeader from '../components/PicksHeader.vue'

const showProfile = ref(false)

const props = defineProps({ user: Object, picksLocked: Boolean, picksLockTime: Object })

function fmtLockTime(ts) {
  if (!ts) return null
  const d = ts?.toDate?.() ?? new Date(ts)
  const time = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  const isToday = new Date().toDateString() === d.toDateString()
  if (isToday) return `at ${time}`
  const date = d.toLocaleString('en-US', { month: 'short', day: 'numeric' })
  return `on ${date} at ${time}`
}
const emit = defineEmits(['submitted', 'cancel'])

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

// ── Pre-populate from existing submission ──────────────────────────────
onMounted(async () => {
  let snap
  try {
    snap = await getDoc(doc(db, 'submissions', props.user.uid))
  } catch {
    loaded.value = true
    return
  }
  if (snap.exists()) {
    isUpdate.value = true
    const data = snap.data()
    if (data.groups) {
      for (const [g, arr] of Object.entries(data.groups)) {
        if (arr && arr.length === 4 && order[g]) order[g] = [...arr]
      }
    }
    if (data.wildcards) wildcards.value = [...data.wildcards]
    if (data.props) Object.assign(propAnswers, data.props)
    savedSnapshot.value = makeSnapshot()
  }
  loaded.value = true
})

// ── Drag and drop ──────────────────────────────────────────────────────
const drag = reactive({ group: null, item: null })

function onDragStart(e, group, team) {
  drag.group = group
  drag.item = team
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

function onDragEnd() {
  drag.group = null
  drag.item = null
}

// ── Touch drag (mobile) ────────────────────────────────────────────────
const touch = reactive({ group: null, item: null })

function onTouchStart(e, group, team) {
  touch.group = group
  touch.item = team
  drag.group = group
  drag.item = team
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

function onTouchEnd() {
  touch.group = null
  touch.item = null
  drag.group = null
  drag.item = null
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
const canSubmit = computed(
  () => !props.picksLocked && wildcards.value.length === 8 && doneProps.value === PROPS.length
)

// ── Submit ─────────────────────────────────────────────────────────────
async function submit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const changed = picksChanged()
    await setDoc(doc(db, 'submissions', props.user.uid), {
      name: props.user.displayName,
      uid: props.user.uid,
      photoURL: props.user.photoURL ?? null,
      ...(changed ? { submittedAt: serverTimestamp() } : {}),
      groups: Object.fromEntries(GROUPS.map(g => [g, [...order[g]]])),
      wildcards: wildcards.value,
      props: Object.fromEntries(
        PROPS.map(p => [p.key, p.type === 'number' ? Number(propAnswers[p.key]) : propAnswers[p.key]])
      ),
    }, { merge: true })
    emit('submitted')
  } catch {
    submitError.value = 'Save failed — check your connection and try again.'
    submitting.value = false
  }
}

// ── Sticky group preview ───────────────────────────────────────────────
const groupCardRefs = reactive({})
const overlayRef = ref(null)
const overlayCollapsed = ref(false)
const overlayContentVisible = ref(false) // true = ticker visible, false = grid visible
const overlayGridRef = ref(null)
const overlayTickerRef = ref(null)

function animateOverlayHeight(el, from, to, clearAfter, onDone) {
  el.style.height = from + 'px'
  el.offsetHeight
  el.style.transition = 'height 280ms cubic-bezier(0.4, 0, 0.2, 1)'
  el.style.height = to + 'px'
  el.addEventListener('transitionend', () => {
    el.style.transition = ''
    if (clearAfter) el.style.height = ''
    onDone?.()
  }, { once: true })
}

function setOverlayCollapsed(val) {
  if (overlayCollapsed.value === val) return
  const el = overlayRef.value
  if (!el) return

  if (val) {
    // COLLAPSE: animate height down, keep it pinned, then fade swap to ticker
    const from = el.offsetHeight
    const to = 36
    overlayCollapsed.value = true
    animateOverlayHeight(el, from, to, false, () => {
      overlayContentVisible.value = true
    })
  } else {
    // EXPAND: fade swap to grid, animate height up, then clear inline height
    overlayContentVisible.value = false
    nextTick(() => {
      const from = parseFloat(el.style.height) || el.offsetHeight
      overlayCollapsed.value = false
      nextTick(() => {
        const to = overlayGridRef.value?.offsetHeight ?? from
        animateOverlayHeight(el, from, to, true, null)
      })
    })
  }
}
const pinnedGroups = ref([])
const leftPinnedGroups = computed(() => pinnedGroups.value.slice(0, 6))
const rightPinnedGroups = computed(() => pinnedGroups.value.slice(6))
const propsSectionRef = ref(null)
const wildcardsSectionRef = ref(null)
let firstWildcardRef = null
const picksHeaderRef = ref(null)
let lastExpandedOverlayHeight = 0
let cachedRowHeight = 0

function getHeaderBottom() {
  const el = picksHeaderRef.value?.headerEl
  if (el) return el.getBoundingClientRect().bottom
  return 60
}

function updatePinned() {
  const headerBottom = getHeaderBottom()
  const count = pinnedGroups.value.length

  // Update cached row height when we have enough rows to measure reliably
  if (!overlayCollapsed.value && overlayRef.value && count > 0) {
    cachedRowHeight = overlayRef.value.getBoundingClientRect().height / count
  }

  const rowHeight = cachedRowHeight || 52
  // Threshold = where the overlay bottom will be once the next group joins
  const threshold = headerBottom + (count + 1) * rowHeight

  pinnedGroups.value = GROUPS.filter(g => {
    const el = groupCardRefs[g]
    if (!el) return false
    const r = el.getBoundingClientRect()
    return (r.top + r.bottom) / 2 < threshold
  })

  if (!overlayRef.value) return
  const overlayRect = overlayRef.value.getBoundingClientRect()

  // Cache height while expanded so we can use it after collapsing
  if (!overlayCollapsed.value) {
    lastExpandedOverlayHeight = overlayRect.height
  }

  if (!overlayCollapsed.value && firstWildcardRef) {
    const r = firstWildcardRef.getBoundingClientRect()
    if ((r.top + r.bottom) / 2 < overlayRect.bottom) {
      setOverlayCollapsed(true)
    }
  }

  // Uncollapse when scrolling back up: wildcards top must clear the expanded overlay bottom
  if (overlayCollapsed.value && wildcardsSectionRef.value && lastExpandedOverlayHeight) {
    const expandedBottom = overlayRect.top + lastExpandedOverlayHeight
    if (wildcardsSectionRef.value.getBoundingClientRect().top > expandedBottom) {
      setOverlayCollapsed(false)
    }
  }
}

onMounted(() => {
  updatePinned()
  window.addEventListener('scroll', updatePinned, { passive: true })
  window.addEventListener('resize', updatePinned, { passive: true })
  return () => {
    window.removeEventListener('scroll', updatePinned)
    window.removeEventListener('resize', updatePinned)
  }
})

// ── Position styles ────────────────────────────────────────────────────
const POS_COLORS = [
  'bg-amber-400 text-zinc-900',
  'bg-zinc-300 text-zinc-900',
  'bg-amber-700 text-amber-100',
  'bg-zinc-700 text-zinc-300',
]
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 pt-16" style="padding-bottom: max(4rem, calc(4rem + env(safe-area-inset-bottom)))">

    <ProfileModal v-if="showProfile" :user="user" @close="showProfile = false" />

    <!-- ══════════════════════════════════════════════════
         LOCKED SUMMARY VIEW
    ══════════════════════════════════════════════════ -->
    <template v-if="picksLocked && !isUpdate">
      <PicksHeader :user="user" :locked="true" @profile="showProfile = true" />
      <div class="flex flex-col items-center justify-center text-center pt-24 pb-16 px-6">
        <div class="text-4xl mb-5">🔒</div>
        <h2 class="text-lg font-black tracking-wide text-white mb-2">Submissions are locked!</h2>
        <p class="text-sm text-zinc-400 mb-8">Come back for the knockout round.</p>
        <button disabled class="flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-sm tracking-[0.08em] uppercase bg-court-700 text-zinc-400 cursor-not-allowed">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8 6l4-4 4 4"/><path d="M12 2v13"/><path d="M20 21H4"/><path d="M16 13l4 4-4 4"/>
          </svg>
          View Leaderboard
        </button>
      </div>
    </template>

    <template v-else-if="picksLocked">
      <PicksHeader :user="user" :locked="true" @profile="showProfile = true" />

      <!-- Group standings summary -->
      <section class="mt-8 mb-10">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase mb-5">Group Standings</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            v-for="group in GROUPS" :key="group"
            class="rounded-2xl border p-4 bg-court-800 border-court-700"
          >
            <div class="text-[10px] font-black tracking-[0.2em] text-emerald-400 mb-3">GROUP {{ group }}</div>
            <div class="space-y-1.5">
              <div v-for="(team, idx) in order[group]" :key="team" class="flex items-center gap-2">
                <div
                  class="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0"
                  :class="POS_COLORS[idx]"
                >{{ idx + 1 }}</div>
                <span class="text-base leading-none shrink-0">{{ TEAM_FLAG[team] ?? '🏳️' }}</span>
                <span class="text-xs font-medium text-white flex-1 truncate">{{ team }}</span>
                <span
                  v-if="idx === 2 && wildcards.includes(group)"
                  class="text-[9px] font-black tracking-wider text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-1.5 py-0.5 shrink-0"
                >WC</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Wildcards summary -->
      <section class="mb-10">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase mb-1">Best 3rd-Place Teams</h2>
        <p class="text-[11px] text-zinc-400 mb-5">Your 8 wildcard picks</p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div
            v-for="group in wildcards" :key="group"
            class="flex items-center gap-2 bg-emerald-500/10 border border-emerald-400/20 rounded-xl px-3 py-2.5"
          >
            <span class="text-lg leading-none">{{ TEAM_FLAG[thirdOf(group)] ?? '🏳️' }}</span>
            <div>
              <div class="text-[9px] font-black tracking-wider text-emerald-400">Group {{ group }}</div>
              <div class="text-xs font-semibold text-white truncate">{{ thirdOf(group) }}<span class="text-zinc-400 font-normal"> · #{{ FIFA_RANKING[thirdOf(group)] ?? '–' }}</span></div>
            </div>
          </div>
        </div>
      </section>

      <!-- Props summary -->
      <section class="mb-10">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase mb-5">Group Stage Props</h2>
        <div class="space-y-2">
          <div
            v-for="prop in PROPS" :key="prop.key"
            class="bg-court-800 border border-court-700 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
          >
            <div class="min-w-0">
              <div class="text-[11px] text-zinc-400 mb-0.5">{{ prop.label }}</div>
              <div class="text-sm font-bold text-white truncate">
                {{ propAnswers[prop.key] === '__none__' ? '🚫 No Team' : (propAnswers[prop.key] || '—') }}
              </div>
            </div>
            <div class="shrink-0 text-[10px] font-black text-amber-400/60 bg-amber-400/5 border border-amber-400/10 rounded-full px-2 py-0.5 font-mono leading-5">
              {{ prop.points }}pt{{ prop.points !== 1 ? 's' : '' }}
            </div>
          </div>
        </div>
      </section>
    </template>

    <!-- ══════════════════════════════════════════════════
         EDIT VIEW (picks not yet locked)
    ══════════════════════════════════════════════════ -->
    <template v-else>

    <PicksHeader ref="picksHeaderRef" :user="user" :locked="false" @profile="showProfile = true" />

    <button
      v-if="isUpdate"
      @click="emit('cancel')"
      class="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs font-medium transition-colors mt-3 mb-1"
    >
      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/>
      </svg>
      Back to Home
    </button>

    <!-- ── Mobile: sticky top rows ── -->
    <div
      ref="overlayRef"
      v-if="pinnedGroups.length"
      class="min-[964px]:hidden fixed top-16 left-0 right-0 z-[60] px-4 bg-court-950/97 backdrop-blur-md border-b border-court-700/60 overflow-hidden"
    >
      <!-- layer wrapper: grid sits in flow to drive height; ticker overlays on top -->
      <div class="relative">
        <!-- expanded: centered grid — always in flow for height measurement -->
        <div ref="overlayGridRef">
          <div class="grid grid-cols-2 gap-x-6 w-fit mx-auto transition-opacity duration-200"
               :class="overlayContentVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'">
            <TransitionGroup name="pin" tag="div" class="contents">
              <div
                v-for="group in pinnedGroups" :key="group"
                class="flex items-center gap-2 py-1.5 px-1 border-t border-court-700/30"
              >
                <span class="text-[11px] font-black tracking-[0.18em] text-emerald-500 w-4 shrink-0">{{ group }}</span>
                <div class="flex gap-1 items-center">
                  <span
                    v-for="(team, i) in order[group]" :key="team"
                    class="relative group/flag cursor-default hover:z-[200]"
                  >
                    <span
                      class="text-xl leading-none transition-opacity"
                      :class="i >= 2 && !(wildcards.includes(group) && i === 2) ? 'opacity-30' : ''"
                    >{{ TEAM_FLAG[team] ?? '🏳️' }}</span>
                    <span class="pointer-events-none absolute bottom-full left-1/2 -tranzinc-x-1/2 mb-1.5 whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold bg-white text-black shadow-lg opacity-0 group-hover/flag:opacity-100 transition-opacity z-[200]">
                      {{ team }}<span class="text-zinc-400 font-normal"> · #{{ FIFA_RANKING[team] ?? '–' }}</span>
                    </span>
                  </span>
                </div>
              </div>
            </TransitionGroup>
          </div>
        </div>

        <!-- collapsed: horizontal ticker — absolutely overlaid, fades in after height collapse -->
        <div
          ref="overlayTickerRef"
          class="absolute top-0 overflow-hidden transition-opacity duration-200 flex items-center"
          style="height: 36px; left: -1rem; right: -1rem;"
          :class="overlayContentVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'"
        >
          <div
            class="shelf-ticker flex gap-5 w-max"
            :style="{ animationDuration: `${pinnedGroups.length * 2.5}s` }"
          >
            <template v-for="pass in 2" :key="pass">
              <div v-for="group in pinnedGroups" :key="`${pass}-${group}`" class="flex items-center gap-1.5 shrink-0">
                <span class="text-[11px] font-black tracking-[0.18em] text-emerald-500">{{ group }}</span>
                <div class="flex gap-0.5 items-center">
                  <span
                    v-for="(team, i) in order[group]" :key="team"
                    class="text-lg leading-none transition-opacity"
                    :class="i >= 2 && !(wildcards.includes(group) && i === 2) ? 'opacity-30' : ''"
                  >{{ TEAM_FLAG[team] ?? '🏳️' }}</span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

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
              @dragend="!picksLocked && onDragEnd()"
              @touchstart.passive="!picksLocked && onTouchStart($event, group, team)"
              @touchmove="!picksLocked && onTouchMove($event)"
              @touchend="!picksLocked && onTouchEnd()"
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
          v-for="(group, idx) in GROUPS" :key="group"
          :ref="idx === 0 ? (el) => { firstWildcardRef = el } : undefined"
          type="button"
          @click="!picksLocked && toggleWildcard(group)"
          :disabled="picksLocked || wcDisabled(group)"
          class="relative text-left p-3 rounded-xl border transition-all duration-150"
          :class="[
            wildcards.includes(group)
              ? 'bg-emerald-500/10 border-emerald-400/30 shadow-[0_0_16px_-4px_rgba(56,189,248,0.2)]'
              : wcDisabled(group)
                ? 'bg-court-800 border-court-700 opacity-30 cursor-not-allowed'
                : 'bg-court-800 border-court-700 hover:border-zinc-600 cursor-pointer active:scale-[0.98]',
          ]"
        >
          <div
            class="text-[10px] font-black tracking-[0.2em] mb-0.5"
            :class="wildcards.includes(group) ? 'text-emerald-400' : 'text-zinc-400'"
          >GROUP {{ group }}</div>
          <div class="flex items-center gap-1.5">
            <span class="text-sm leading-none">{{ TEAM_FLAG[thirdOf(group)] ?? '🏳️' }}</span>
            <div
              class="text-xs font-semibold truncate"
              :class="wildcards.includes(group) ? 'text-white' : 'text-zinc-300'"
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

    <!-- ── SECTION 3: Group Stage Props ── -->
    <section ref="propsSectionRef" class="mb-10">
      <div class="flex items-baseline justify-between mb-5">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase">Group Stage Props</h2>
        <span class="text-[10px] text-zinc-400 font-mono">3–10 pts</span>
      </div>
      <div class="space-y-2">
        <div
          v-for="prop in PROPS" :key="prop.key"
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
            :allowNone="prop.key === 'Clean Sheet Group'"
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
        <p v-if="picksLockTime" class="text-center text-[11px] text-zinc-400 mt-1.5">
          Picks lock {{ fmtLockTime(picksLockTime) }}
        </p>
      </template>
    </div>

    </template><!-- end loaded -->

    </template><!-- end v-else edit view -->

    <div v-if="loaded" class="text-center py-4">
      <span class="text-[10px] text-zinc-700 font-mono">v{{ appVersion }}</span>
    </div>

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

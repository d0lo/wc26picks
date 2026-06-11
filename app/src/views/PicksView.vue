<script setup>
import { reactive, ref, computed, onMounted } from 'vue'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase.js'
import { GROUP_TEAMS, GROUPS, PROPS, TEAM_FLAG, FIFA_RANKING } from '../data.js'
import CountrySelect from '../components/CountrySelect.vue'
import PlayerSelect from '../components/PlayerSelect.vue'
import ProfileModal from '../components/ProfileModal.vue'

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
const emit = defineEmits(['submitted'])

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

// ── Pre-populate from existing submission ──────────────────────────────
onMounted(async () => {
  let snap
  try {
    snap = await getDoc(doc(db, 'submissions', props.user.uid))
  } catch {
    return
  }
  if (!snap.exists()) return
  isUpdate.value = true
  const data = snap.data()
  if (data.groups) {
    for (const [g, arr] of Object.entries(data.groups)) {
      if (arr && arr.length === 4 && order[g]) order[g] = [...arr]
    }
  }
  if (data.wildcards) wildcards.value = [...data.wildcards]
  if (data.props) Object.assign(propAnswers, data.props)
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
  wildcards.value = wildcards.value.filter(g => g !== group)
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
    await setDoc(doc(db, 'submissions', props.user.uid), {
      name: props.user.displayName,
      uid: props.user.uid,
      photoURL: props.user.photoURL ?? null,
      submittedAt: serverTimestamp(),
      groups: Object.fromEntries(GROUPS.map(g => [g, [...order[g]]])),
      wildcards: wildcards.value,
      props: Object.fromEntries(
        PROPS.map(p => [p.key, p.type === 'number' ? Number(propAnswers[p.key]) : propAnswers[p.key]])
      ),
    })
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
const pinnedGroups = ref([])
const leftPinnedGroups = computed(() => pinnedGroups.value.slice(0, 6))
const rightPinnedGroups = computed(() => pinnedGroups.value.slice(6))
const propsSectionRef = ref(null)

function updatePinned() {
  const threshold = 60
  pinnedGroups.value = GROUPS.filter(g => {
    const el = groupCardRefs[g]
    return el && el.getBoundingClientRect().bottom < threshold
  })
  if (propsSectionRef.value) {
    const shelfBottom = overlayRef.value ? overlayRef.value.getBoundingClientRect().bottom : 60
    if (propsSectionRef.value.getBoundingClientRect().top < shelfBottom) {
      overlayCollapsed.value = true
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
  <div class="max-w-2xl mx-auto px-4 pb-16">

    <ProfileModal v-if="showProfile" :user="user" @close="showProfile = false" />

    <!-- ══════════════════════════════════════════════════
         LOCKED SUMMARY VIEW
    ══════════════════════════════════════════════════ -->
    <template v-if="picksLocked && !isUpdate">
      <header class="sticky top-0 z-50 -mx-4 px-4 py-3 bg-court-950/95 backdrop-blur-md border-b border-court-700">
        <div class="flex items-center justify-between gap-3">
          <button type="button" @click="showProfile = true" class="min-w-0 text-left">
            <div class="text-[10px] font-black tracking-[0.25em] text-zinc-400 uppercase">WC 2026</div>
            <div class="text-sm font-bold text-white truncate">{{ user.providerData?.[0]?.providerId === 'google.com' ? user.displayName?.split(' ')[0] : user.displayName }}'s Picks</div>
          </button>
          <div class="flex items-center gap-1.5 text-zinc-400 shrink-0">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span class="text-[10px] font-black tracking-[0.15em] uppercase">Locked</span>
          </div>
        </div>
      </header>
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
      <!-- Header -->
      <header class="sticky top-0 z-50 -mx-4 px-4 py-3 bg-court-950/95 backdrop-blur-md border-b border-court-700">
        <div class="flex items-center justify-between gap-3">
          <button type="button" @click="showProfile = true" class="min-w-0 text-left">
            <div class="text-[10px] font-black tracking-[0.25em] text-zinc-400 uppercase">WC 2026</div>
            <div class="text-sm font-bold text-white truncate">{{ user.providerData?.[0]?.providerId === 'google.com' ? user.displayName?.split(' ')[0] : user.displayName }}'s Picks</div>
          </button>
          <div class="flex items-center gap-1.5 text-zinc-400 shrink-0">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span class="text-[10px] font-black tracking-[0.15em] uppercase">Locked</span>
          </div>
        </div>
      </header>

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
              <div class="text-[9px] font-black tracking-wider text-emerald-400">GRP {{ group }}</div>
              <div class="text-xs font-semibold text-white truncate">{{ thirdOf(group) }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Props summary -->
      <section class="mb-10">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase mb-5">Tournament Props</h2>
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

    <!-- Sticky progress header -->
    <header class="sticky top-0 z-50 -mx-4 px-4 py-3 bg-court-950/95 backdrop-blur-md border-b border-court-700">
      <div class="flex items-center justify-between gap-3">
        <button type="button" @click="showProfile = true" class="min-w-0 text-left">
          <div class="text-[10px] font-black tracking-[0.25em] text-zinc-400 uppercase">WC 2026</div>
          <div class="text-sm font-bold text-white truncate">{{ user.providerData?.[0]?.providerId === 'google.com' ? user.displayName?.split(' ')[0] : user.displayName }}'s Picks</div>
        </button>
      </div>
    </header>

    <!-- ── Mobile: sticky top rows ── -->
    <div
      ref="overlayRef"
      v-if="pinnedGroups.length"
      class="min-[964px]:hidden fixed top-[56px] left-0 right-0 z-[60] px-4 bg-court-950/97 backdrop-blur-md border-b border-court-700/60"
      @click="overlayCollapsed && pinnedGroups.length > 1 && (overlayCollapsed = false)"
      :class="overlayCollapsed && pinnedGroups.length > 1 ? 'cursor-pointer' : ''"
    >
      <div class="flex items-end gap-1">
        <div
          class="flex-1 grid transition-[grid-template-rows] duration-300 ease-in-out"
          :style="{ gridTemplateRows: overlayCollapsed ? '0fr' : '1fr' }"
        >
          <div class="overflow-hidden">
            <div class="grid gap-x-2 pt-2" style="grid-template-columns: repeat(auto-fill, minmax(calc(4 * 1.25rem + 3 * 0.25rem + 1rem + 1.25rem + 0.5rem), 1fr))">
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
        </div>
        <button
          v-if="pinnedGroups.length > 1"
          type="button"
          @click.stop="overlayCollapsed = !overlayCollapsed"
          class="box-content shrink-0 w-5 h-6 py-1.5 px-1 flex items-center justify-center text-zinc-400 hover:text-zinc-400 transition-colors"
          :aria-label="overlayCollapsed ? 'Expand group preview' : 'Collapse group preview'"
        >
          <svg class="w-3 h-3 transition-transform duration-300" :class="overlayCollapsed ? 'rotate-180' : ''" viewBox="0 0 12 8" fill="none">
            <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- ── Desktop: fixed left panel ── -->
      <!-- wide: single left panel, 2 cols -->
      <div
        v-if="pinnedGroups.length"
        class="hidden min-[1248px]:block fixed top-16 z-[60]"
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
          class="hidden min-[964px]:block min-[1248px]:hidden fixed top-16 z-[60]"
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
          class="hidden min-[964px]:block min-[1248px]:hidden fixed top-16 z-[60]"
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
    <section class="mt-8 mb-10">
      <div class="flex items-baseline justify-between mb-1">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase">Group Standings</h2>
        <span class="text-[10px] text-zinc-400 font-mono tabular-nums">3 · 3 · 1 · 1 pts</span>
      </div>
      <p class="text-[11px] text-zinc-400 mb-5">Drag teams to set your predicted finish order.</p>

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
    <section class="mb-10">
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
          class="relative text-left p-3 rounded-xl border transition-all duration-150"
          :class="[
            wildcards.includes(group)
              ? 'bg-emerald-500/10 border-emerald-400/30 shadow-[0_0_16px_-4px_rgba(56,189,248,0.2)]'
              : wcDisabled(group)
                ? 'bg-court-800 border-court-700 opacity-30 cursor-not-allowed'
                : 'bg-court-800 border-court-700 hover:border-zinc-600 cursor-pointer active:scale-[0.98]',
          ]"
        >
          <div class="flex items-center gap-1.5 mb-0.5">
            <span class="text-sm leading-none">{{ TEAM_FLAG[thirdOf(group)] ?? '🏳️' }}</span>
            <div
              class="text-[10px] font-black tracking-[0.2em]"
              :class="wildcards.includes(group) ? 'text-emerald-400' : 'text-zinc-400'"
            >GRP {{ group }}</div>
          </div>
          <div
            class="text-xs font-semibold truncate"
            :class="wildcards.includes(group) ? 'text-white' : 'text-zinc-300'"
          >{{ thirdOf(group) }}</div>

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

    <!-- ── SECTION 3: Tournament Props ── -->
    <section ref="propsSectionRef" class="mb-10">
      <div class="flex items-baseline justify-between mb-5">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase">Tournament Props</h2>
        <span class="text-[10px] text-zinc-400 font-mono">3–10 pts</span>
      </div>
      <div class="space-y-2">
        <div
          v-for="prop in PROPS" :key="prop.key"
          class="bg-court-800 border border-court-700 rounded-2xl p-4"
        >
          <div class="flex items-start justify-between gap-3 mb-3">
            <div>
              <div class="text-xs font-bold text-white">{{ prop.label }}</div>
              <div class="text-[11px] text-zinc-400 mt-0.5">{{ prop.hint }}</div>
            </div>
            <div class="shrink-0 text-[10px] font-black text-amber-400/60 bg-amber-400/5 border border-amber-400/10 rounded-full px-2 py-0.5 font-mono leading-5">
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
          <span v-else>Submit Picks</span>
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

    </template><!-- end v-else edit view -->

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

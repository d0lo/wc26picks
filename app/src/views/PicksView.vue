<script setup>
import { reactive, ref, computed, inject, watch } from 'vue'
import draggable from 'vuedraggable'
import { useRouter } from 'vue-router'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { GROUP_TEAMS, GROUPS, TEAM_FLAG, FIFA_RANKING, TEAM_ID, TEAM_BY_ID } from '../data.js'
import { ROUNDS, ROUND_LABELS, ROUND_SIZE, ROUND_POINTS, PREV_ROUND, R32_SLOTS, deriveRoundMatchups, isBracketPickComplete } from '../bracket.js'
import { ROSTERS } from '../rosters.js'
import { pickQueryOptions, queryKeys } from '../queries.js'
import { useScoring } from '../composables/useScoring.js'
import CountrySelect from '../components/CountrySelect.vue'
import PlayerSelect from '../components/PlayerSelect.vue'
import GroupOverlayPanel from '../components/GroupOverlayPanel.vue'
import PropPointsBadge from '../components/PropPointsBadge.vue'

const router = useRouter()
const user = inject('user')
const picksLocked = inject('picksLocked')
const picksLockTime = inject('picksLockTime')
const knockoutWindowOpen = inject('knockoutWindowOpen')
const r32Started = inject('r32Started')
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
const knockout = reactive(Object.fromEntries(ROUNDS.map(r => [r, Array(ROUND_SIZE[r]).fill(null)])))
const propAnswers = reactive({})
const submitting = ref(false)
const submitError = ref('')
const isUpdate = ref(false)
const savedSnapshot = ref(null)
const loaded = ref(false)

// ── Scoring config (admin-editable prop catalog + point values) ────────
// Declared before makeSnapshot/pickQuery below — both reference allProps,
// and pickQuery's immediate watch can run synchronously during setup() if
// TanStack Query's persisted cache already has data, which would hit a
// TDZ ReferenceError on allProps if useScoring() were declared later.
const { scoring, props: allProps, propsByCategory, groupExactLabel, isLoading: scoringLoading } = useScoring()

// Prop ids arrive async from Firestore — seed an answer slot for each as
// the catalog loads, without clobbering answers already merged in from a
// saved pick (see the pickQuery watch below).
watch(allProps, (list) => {
  for (const p of list) {
    if (!(p.id in propAnswers)) propAnswers[p.id] = ''
  }
}, { immediate: true })

function makeSnapshot() {
  return JSON.stringify({
    groups: Object.fromEntries(GROUPS.map(g => [g, [...order[g]]])),
    wildcards: [...wildcards.value].sort(),
    knockout: Object.fromEntries(ROUNDS.map(r => [r, [...knockout[r]]])),
    props: Object.fromEntries(allProps.value.map(p => [p.id, propAnswers[p.id]])),
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
    if (data.knockout) {
      for (const round of ROUNDS) {
        if (Array.isArray(data.knockout[round]) && data.knockout[round].length === ROUND_SIZE[round]) {
          knockout[round] = [...data.knockout[round]]
        }
      }
    }
    if (data.props) Object.assign(propAnswers, data.props)
    savedSnapshot.value = makeSnapshot()
  }
  loaded.value = true
}, { immediate: true })

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

// ── Knockout bracket logic (march-madness style) ──────────────────────
// Each round's matchups are derived live from the previous round's picks
// (not from real results — this is the user's own projected bracket), so
// picking a Round of 32 winner immediately determines who that team would
// face in the Round of 16, and so on up to the Final.
function matchupsFor(round) {
  return round === 'r32' ? R32_SLOTS : deriveRoundMatchups(round, knockout[PREV_ROUND[round]])
}

// Changing an earlier-round pick can invalidate picks made further down the
// bracket (the team picked there no longer appears in that matchup) — walk
// forward clearing only the picks that are now invalid, stopping as soon as
// a round's picks didn't need to change (nothing further downstream could
// be affected either).
function cascadeFrom(round) {
  const startIdx = ROUNDS.indexOf(round)
  for (let i = startIdx + 1; i < ROUNDS.length; i++) {
    const r = ROUNDS[i]
    const matchups = matchupsFor(r)
    let changed = false
    matchups.forEach((pair, slotIdx) => {
      if (knockout[r][slotIdx] && !pair.includes(knockout[r][slotIdx])) {
        knockout[r][slotIdx] = null
        changed = true
      }
    })
    if (!changed) break
  }
}

// Knockout-bracket editing is gated on the Round of 32 actually starting,
// not the main picksLocked deadline — the bracket stays editable through
// the window between group-stage completion and r32 kickoff, after the
// main lock (and the rest of the picks doc) has already passed.
function pickWinner(round, slotIdx, teamId) {
  if (r32Started.value) return
  knockout[round][slotIdx] = teamId
  cascadeFrom(round)
}

const knockoutComplete = computed(() => isBracketPickComplete(knockout))

const ready = computed(() => loaded.value && !scoringLoading.value)
const configMissing = computed(() => ready.value && allProps.value.length === 0)

// Once the user has already submitted, the only thing left to fill out
// during the knockout window is the bracket — the rest of the picks doc
// is locked and irrelevant, so the page collapses to bracket-only.
const showKnockoutOnly = computed(() => knockoutWindowOpen.value && isUpdate.value)

// ── Progress ───────────────────────────────────────────────────────────
const doneProps = computed(() => allProps.value.filter(p => propAnswers[p.id] !== '').length)
// Knockout picks are deliberately not required here — a user can submit
// groups/wildcards/props before the lock and fill out their bracket later,
// any time before the Round of 32 starts (see showKnockoutOnly above).
const canSubmit = computed(
  () => !picksLocked.value && allProps.value.length > 0 && wildcards.value.length === 8 && doneProps.value === allProps.value.length
)

// ── Submit ─────────────────────────────────────────────────────────────
async function submit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const changed = picksChanged()
    // Known client-side — patch the cache with these directly below.
    // submittedAt is server-generated, so it's excluded from that patch.
    const knownFields = {
      uid: user.value.uid,
      // Store team UUIDs, not names
      groups: Object.fromEntries(GROUPS.map(g => [g, order[g].map(name => TEAM_ID[name])])),
      wildcards: wildcards.value,
      knockout: Object.fromEntries(ROUNDS.map(r => [r, [...knockout[r]]])),
      // Keyed by prop.id (stable), not prop.key — see seed-scoring-config.mjs.
      // Answers already store UUIDs (from CountrySelect/PlayerSelect); cleanGroupTeam null-safe
      props: Object.fromEntries(
        allProps.value.map(p => [p.id, propAnswers[p.id] === '' ? null : propAnswers[p.id]])
      ),
    }
    await setDoc(doc(db, 'picks', user.value.uid), {
      ...knownFields,
      ...(changed ? { submittedAt: serverTimestamp() } : {}),
    }, { merge: true })
    queryClient.setQueryData(queryKeys.pick(user.value.uid), (old) => ({ ...old, ...knownFields }))
    // picksList sorts by submittedAt, which we don't know the real value of
    // client-side — only refetch it when submittedAt actually changed.
    if (changed) queryClient.invalidateQueries({ queryKey: queryKeys.picksList })
    router.push('/leaderboard')
  } catch {
    submitError.value = 'Save failed — check your connection and try again.'
    submitting.value = false
  }
}

// Independent save path for the knockout-only window: writes just the
// `knockout` field via partial merge, decoupled from the main submit()'s
// !picksLocked gate — by the time this window opens, picksLocked is
// already true (the original deadline has long passed), but the bracket
// itself is still meant to be editable until the Round of 32 starts.
async function submitKnockout() {
  if (!knockoutComplete.value || submitting.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const knockoutField = Object.fromEntries(ROUNDS.map(r => [r, [...knockout[r]]]))
    await setDoc(doc(db, 'picks', user.value.uid), { knockout: knockoutField }, { merge: true })
    queryClient.setQueryData(queryKeys.pick(user.value.uid), (old) => ({ ...old, knockout: knockoutField }))
    savedSnapshot.value = makeSnapshot()
    router.push('/leaderboard')
  } catch {
    submitError.value = 'Save failed — check your connection and try again.'
  } finally {
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
    <div v-if="!ready" class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <p v-else-if="configMissing" class="text-center text-sm text-red-400 py-20">
      Couldn't load prop picks — scoring config is unavailable. Try refreshing.
    </p>

    <template v-if="ready && !configMissing">

    <section v-if="!showKnockoutOnly" class="mt-4 mb-10">
      <div class="flex items-start justify-between mb-5">
        <div>
          <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase">Group Standings</h2>
          <p class="text-[11px] text-zinc-400 mt-1">Drag teams to set your predicted finish order.</p>
        </div>
        <div class="text-right shrink-0">
          <div class="text-[10px] text-zinc-400 font-mono tabular-nums">{{ groupExactLabel }}</div>
          <div class="text-[10px] text-zinc-500">Perfect Group: +{{ scoring?.perfectGroupBonus ?? '–' }} pt</div>
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
          <draggable
            v-model="order[group]"
            :item-key="(team) => team"
            tag="div"
            class="space-y-1"
            :disabled="picksLocked"
            :animation="200"
            :delay="100"
            :delay-on-touch-only="true"
            ghost-class="drag-ghost"
            chosen-class="drag-chosen"
            drag-class="drag-dragging"
          >
            <template #item="{ element: team, index: idx }">
              <div
                class="flex items-center gap-2 px-2 py-1.5 rounded-xl select-none border"
                :class="picksLocked
                  ? 'cursor-default bg-court-750 border-transparent opacity-60'
                  : 'bg-court-750 border-transparent hover:border-court-600 cursor-grab active:cursor-grabbing'"
              >
                <!-- Position badge -->
                <div
                  class="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0"
                  :class="POS_COLORS[idx]"
                >{{ idx + 1 }}</div>

                <!-- Flag -->
                <span class="text-base leading-none shrink-0">{{ TEAM_FLAG[team] ?? '🏳️' }}</span>

                <!-- Team name + FIFA rank -->
                <span class="flex-1 min-w-0 flex items-center gap-1.5">
                  <span class="text-xs font-medium text-white truncate">{{ team }}</span>
                  <span class="text-[10px] text-zinc-400 font-mono shrink-0">#{{ FIFA_RANKING[team] ?? '–' }}</span>
                </span>

                <!-- Drag handle -->
                <svg class="w-3 h-3 text-zinc-400 shrink-0" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
                  <circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/>
                  <circle cx="3" cy="6" r="1.2"/><circle cx="7" cy="6" r="1.2"/>
                  <circle cx="3" cy="10" r="1.2"/><circle cx="7" cy="10" r="1.2"/>
                  <circle cx="3" cy="14" r="1.2"/><circle cx="7" cy="14" r="1.2"/>
                </svg>
              </div>
            </template>
          </draggable>
        </div>
      </div>
    </section>

    <!-- ── SECTION 2: Wildcards ── -->
    <section v-if="!showKnockoutOnly" ref="wildcardsSectionRef" class="mb-10">
      <div class="flex items-baseline justify-between mb-1">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase">Best 3rd-Place Teams</h2>
        <span class="text-[10px] text-zinc-400 font-mono">{{ scoring?.wildcard ?? '–' }} pts each</span>
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

    <!-- ── SECTION 2.5: Knockout Bracket ── -->
    <section class="mb-10">
      <div class="flex items-baseline justify-between mb-1">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase">Knockout Bracket</h2>
        <span
          class="text-[10px] font-mono transition-colors"
          :class="knockoutComplete ? 'text-emerald-400' : 'text-zinc-400'"
        >{{ ROUNDS.reduce((n, r) => n + knockout[r].filter(Boolean).length, 0) }}/{{ ROUNDS.reduce((n, r) => n + ROUND_SIZE[r], 0) }}</span>
      </div>
      <p class="text-[11px] mb-5" :class="showKnockoutOnly ? 'text-emerald-400' : 'text-zinc-400'">
        <template v-if="showKnockoutOnly">Your group/wildcard/prop picks are locked — just the bracket is left.</template>
        <template v-else>Pick a winner for every matchup, round by round.</template>
      </p>

      <div class="overflow-x-auto -mx-4 px-4">
        <div class="flex gap-3 pb-2">
          <div v-for="round in ROUNDS" :key="round" class="shrink-0 w-[180px] flex flex-col gap-2">
            <div class="flex items-baseline justify-between px-0.5">
              <span class="text-[9px] font-black tracking-[0.15em] text-emerald-400 uppercase">{{ ROUND_LABELS[round] }}</span>
              <span class="text-[9px] text-zinc-500 font-mono">{{ ROUND_POINTS[round] }}pt</span>
            </div>

            <div
              v-for="(pair, slotIdx) in matchupsFor(round)" :key="slotIdx"
              class="rounded-xl border bg-court-800 border-court-700 p-1 flex flex-col gap-1"
            >
              <button
                v-for="teamId in pair" :key="teamId ?? `tbd-${slotIdx}`"
                type="button"
                @click="teamId && pickWinner(round, slotIdx, teamId)"
                :disabled="r32Started || !teamId"
                class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-left transition-all duration-150"
                :class="knockout[round][slotIdx] === teamId
                  ? 'bg-emerald-400/10 border-emerald-400/60'
                  : !teamId
                    ? 'border-transparent opacity-30 cursor-not-allowed'
                    : r32Started
                      ? 'border-transparent opacity-60'
                      : 'border-transparent hover:border-court-600 cursor-pointer active:scale-[0.98]'"
              >
                <span class="text-sm leading-none shrink-0">{{ teamId ? (TEAM_BY_ID[teamId]?.flag ?? '🏳️') : '🏳️' }}</span>
                <span
                  class="text-xs font-medium truncate flex-1 min-w-0"
                  :class="knockout[round][slotIdx] === teamId ? 'text-white font-bold' : teamId ? 'text-zinc-300' : 'text-zinc-500'"
                >{{ teamId ? (TEAM_BY_ID[teamId]?.name ?? teamId) : 'TBD' }}</span>
                <div
                  v-if="knockout[round][slotIdx] === teamId"
                  class="w-3.5 h-3.5 bg-emerald-400 rounded-full flex items-center justify-center shrink-0"
                >
                  <svg width="7" height="5" viewBox="0 0 7 5" fill="none" aria-hidden="true">
                    <path d="M1 2.5L2.8 4.3L6 1" stroke="#06101F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── SECTION 3: Props (by category) ── -->
    <template v-if="!showKnockoutOnly">
    <section
      v-for="cat in propsByCategory" :key="cat.key"
      :ref="cat.key === 'group' ? 'propsSectionRef' : undefined"
      class="mb-10"
    >
      <div class="flex items-baseline justify-between mb-5">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase">{{ cat.label }}</h2>
        <span class="text-[10px] text-zinc-400 font-mono">
          <template v-if="cat.props.some(p => p.points != null)">{{ Math.min(...cat.props.filter(p => p.points != null).map(p => p.points)) }}–{{ Math.max(...cat.props.filter(p => p.points != null).map(p => p.points)) }} pts</template>
          <template v-else>– pts</template>
        </span>
      </div>
      <div class="space-y-2">
        <div
          v-for="prop in cat.props" :key="prop.id"
          class="bg-court-800 border border-court-700 rounded-2xl p-4"
        >
          <div class="relative mb-3">
            <div class="pr-14">
              <div class="text-xs font-bold text-white">{{ prop.label }}</div>
              <div class="text-[11px] text-zinc-400 mt-0.5">{{ prop.hint }}</div>
            </div>
            <PropPointsBadge :points="prop.points" class="absolute top-0 right-0" />
          </div>

          <CountrySelect
            v-if="prop.type === 'team'"
            v-model="propAnswers[prop.id]"
            :disabled="picksLocked"
            :allowNone="!!prop.allowNone"
          />
          <PlayerSelect
            v-else-if="prop.type === 'player'"
            v-model="propAnswers[prop.id]"
            :positionFilter="prop.positionFilter ?? null"
            :maxAge="prop.maxAge ?? null"
            :disabled="picksLocked"
          />
          <input
            v-else
            v-model="propAnswers[prop.id]"
            type="number"
            inputmode="numeric"
            min="0"
            placeholder="e.g. 24"
            :disabled="picksLocked"
            class="w-full bg-court-900 border border-court-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>
    </section>
    </template>

    <!-- Submit section -->
    <div class="mt-2 mb-10">
      <!-- Knockout-only window: independent bracket save, decoupled from
           the main picksLocked gate (already true by this point). -->
      <template v-if="showKnockoutOnly">
        <div v-if="r32Started" class="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-court-800 border border-court-700">
          <svg class="w-4 h-4 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span class="text-sm font-black tracking-[0.08em] uppercase text-zinc-400">Bracket Locked</span>
        </div>
        <template v-else>
          <p v-if="submitError" class="text-red-400 text-xs text-center mb-2">{{ submitError }}</p>
          <button
            type="button"
            :disabled="!knockoutComplete || submitting"
            @click="submitKnockout"
            class="w-full py-4 rounded-2xl font-black text-sm tracking-[0.08em] uppercase transition-all duration-150"
            :class="knockoutComplete
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
            <span v-else>Save Bracket</span>
          </button>
          <p v-if="!knockoutComplete && !submitting" class="text-center text-[11px] text-zinc-400 mt-1.5">bracket incomplete</p>
        </template>
      </template>

      <!-- Locked state -->
      <div v-else-if="picksLocked" class="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-court-800 border border-court-700">
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
          <span v-if="wildcards.length < 8 && doneProps < allProps.length"> · </span>
          <span v-if="doneProps < allProps.length">{{ allProps.length - doneProps }} prop{{ allProps.length - doneProps !== 1 ? 's' : '' }} remaining</span>
        </p>
        <!-- Knockout bracket isn't required to submit — it can be filled in
             now or any time before the Round of 32 starts. -->
        <p v-if="canSubmit && !knockoutComplete && !submitting" class="text-center text-[11px] text-amber-400 mt-1.5">
          Tip: fill out your bracket now, or come back before the Round of 32 starts.
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

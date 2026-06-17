<script setup>
import { ref, reactive, computed, inject, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
const appVersion = __APP_VERSION__
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase.js'
import { GROUPS, TEAM_BY_ID } from '../data.js'
import PicksSummary from '../components/PicksSummary.vue'
import PicksModal from '../components/PicksModal.vue'

const router = useRouter()
const user = inject('user')
const picksLocked = inject('picksLocked')

const submission = ref(null)
const scores = ref([])
const submitters = ref([])
const loading = ref(true)
const selectedUser = ref(null)  // { uid, name, photoURL } | null

async function fetchData() {
  try {
    const [subSnap, scoresSnap, submittersSnap] = await Promise.all([
      getDoc(doc(db, 'picks', user.value.uid)),
      getDocs(query(collection(db, 'scores'), orderBy('total', 'desc'), limit(50))),
      getDocs(query(collection(db, 'picks'), orderBy('submittedAt', 'asc'))),
    ])
    if (subSnap.exists()) submission.value = subSnap.data()
    scores.value = scoresSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    submitters.value = submittersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch {
    // Firestore unavailable — show empty state
  } finally {
    loading.value = false
  }
}

onMounted(fetchData)

const hasScores = computed(() => scores.value.length > 0)

const sortedSubmitters = computed(() => {
  const scoreMap = Object.fromEntries(scores.value.map(s => [s.id, s.total]))
  return [...submitters.value].sort((a, b) => {
    const sa = scoreMap[a.uid ?? a.id] ?? null
    const sb = scoreMap[b.uid ?? b.id] ?? null
    if (sa !== null && sb !== null) return sb - sa
    if (sa !== null) return -1
    if (sb !== null) return 1
    const ta = a.submittedAt?.toMillis?.() ?? 0
    const tb = b.submittedAt?.toMillis?.() ?? 0
    return ta - tb
  })
})

const myRank = computed(() => {
  if (!hasScores.value) return null
  const idx = scores.value.findIndex(s => s.id === user.value?.uid)
  return idx >= 0 ? idx + 1 : null
})

const myScore = computed(() => scores.value.find(s => s.id === user.value?.uid))

function fmtName(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1][0]}.`
  return name
}

function fmtDate(ts) {
  if (!ts?.toDate) return ''
  return ts.toDate().toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function openUser(s) {
  const uid = s.uid ?? s.id
  if (uid === user.value?.uid) return
  selectedUser.value = { uid, name: s.name, photoURL: s.photoURL ?? null }
}

// ── Sticky group overlay ───────────────────────────────────────────────
const picksSummaryRef = ref(null)
const overlayRef = ref(null)
const overlayCollapsed = ref(false)
const overlayContentVisible = ref(false)
const overlayGridRef = ref(null)
const overlayTickerRef = ref(null)
const pinnedGroups = ref([])
let lastExpandedOverlayHeight = 0
let cachedRowHeight = 40
let leaveAnimating = false
let leaveTimer = null

watch(() => pinnedGroups.value.length, (n, o) => {
  if (n < o) {
    leaveAnimating = true
    clearTimeout(leaveTimer)
    leaveTimer = setTimeout(() => { leaveAnimating = false }, 150)
  }
})

function getHeaderBottom() {
  return document.querySelector('header')?.getBoundingClientRect().bottom ?? 64
}

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
    const from = el.offsetHeight
    overlayCollapsed.value = true
    animateOverlayHeight(el, from, 36, false, () => { overlayContentVisible.value = true })
  } else {
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

function updatePinned() {
  if (!submission.value) return
  const groupCardRefs = picksSummaryRef.value?.groupCardRefs
  if (!groupCardRefs) return

  const headerBottom = getHeaderBottom()
  const rowCount = Math.ceil(pinnedGroups.value.length / 2)
  if (overlayRef.value && rowCount > 0 && !overlayCollapsed.value && !leaveAnimating) {
    const h = overlayRef.value.getBoundingClientRect().height
    if (h > 0) cachedRowHeight = h / rowCount
  }
  const rowHeight = cachedRowHeight

  const newRows = []
  const PAIR_ROWS = []
  for (let i = 0; i < GROUPS.length; i += 2) PAIR_ROWS.push(GROUPS.slice(i, i + 2))
  for (const row of PAIR_ROWS) {
    const el = groupCardRefs[row[0]]
    if (!el) break
    const r = el.getBoundingClientRect()
    const threshold = headerBottom + (newRows.length + 1) * rowHeight
    if ((r.top + r.bottom) / 2 < threshold) newRows.push(row)
    else break
  }
  pinnedGroups.value = newRows.flat()

  if (!overlayRef.value) return
  const overlayRect = overlayRef.value.getBoundingClientRect()
  if (!overlayCollapsed.value) lastExpandedOverlayHeight = overlayRect.height

  const wildcardsSectionRef = picksSummaryRef.value?.wildcardsSectionRef
  if (!overlayCollapsed.value && wildcardsSectionRef?.value) {
    const r = wildcardsSectionRef.value.getBoundingClientRect()
    if ((r.top + r.bottom) / 2 < overlayRect.bottom) setOverlayCollapsed(true)
  }
  if (overlayCollapsed.value && wildcardsSectionRef?.value && lastExpandedOverlayHeight) {
    const expandedBottom = overlayRect.top + lastExpandedOverlayHeight
    if (wildcardsSectionRef.value.getBoundingClientRect().top > expandedBottom) setOverlayCollapsed(false)
  }
}

onMounted(() => {
  window.addEventListener('scroll', updatePinned, { passive: true })
  window.addEventListener('resize', updatePinned, { passive: true })
})
onUnmounted(() => {
  window.removeEventListener('scroll', updatePinned)
  window.removeEventListener('resize', updatePinned)
})
</script>

<template>
  <div>
    <!-- Zero-height sticky anchor — no layout shift; overlay panel is absolute inside it -->
    <div class="min-[964px]:hidden sticky top-0 z-[60]" style="height: 0; overflow: visible">
      <div
        ref="overlayRef"
        v-if="pinnedGroups.length"
        class="absolute top-0 left-0 right-0 px-4 bg-court-950/97 backdrop-blur-md border-b border-court-700/60 overflow-hidden"
      >
        <div class="relative">
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
                      v-for="(teamId, i) in submission?.groups[group]" :key="teamId"
                      class="text-xl leading-none transition-opacity"
                      :class="(i >= 2 && !submission?.wildcards?.includes(group)) || i >= 3 ? 'opacity-30' : ''"
                    >{{ TEAM_BY_ID[teamId]?.flag ?? '🏳️' }}</span>
                  </div>
                </div>
              </TransitionGroup>
            </div>
          </div>
          <div
            ref="overlayTickerRef"
            class="absolute top-0 overflow-hidden transition-opacity duration-200 flex items-center"
            style="height: 36px; left: -1rem; right: -1rem;"
            :class="overlayContentVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'"
          >
            <div class="shelf-ticker flex gap-5 w-max" :style="{ animationDuration: `${pinnedGroups.length * 2.5}s` }">
              <template v-for="pass in 2" :key="pass">
                <div v-for="group in pinnedGroups" :key="`${pass}-${group}`" class="flex items-center gap-1.5 shrink-0">
                  <span class="text-[11px] font-black tracking-[0.18em] text-emerald-500">{{ group }}</span>
                  <div class="flex gap-0.5 items-center">
                    <span
                      v-for="(teamId, i) in submission?.groups[group]" :key="teamId"
                      class="text-lg leading-none transition-opacity"
                      :class="(i >= 2 && !submission?.wildcards?.includes(group)) || i >= 3 ? 'opacity-30' : ''"
                    >{{ TEAM_BY_ID[teamId]?.flag ?? '🏳️' }}</span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div><!-- end sticky anchor -->

    <div class="max-w-2xl mx-auto px-4 pt-4 pb-10">
      <div v-if="loading" class="flex justify-center py-20">
        <div class="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
      <template v-if="!loading">

      <!-- My score card (only when I have submitted) -->
      <div v-if="submission" class="mt-4 mb-5">
        <!-- No scores yet -->
        <div v-if="!hasScores" class="bg-court-800 border border-court-700 rounded-2xl p-5">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-3xl font-black text-white">0 <span class="text-lg text-zinc-400 font-normal">pts</span></div>
              <div class="text-xs text-zinc-400 mt-1">Scoring begins once the tournament starts</div>
            </div>
            <div class="text-4xl select-none">🏆</div>
          </div>
        </div>

        <!-- Scores live -->
        <div v-else class="bg-court-800 border border-court-700 rounded-2xl p-5">
          <div class="flex items-center gap-4">
            <div v-if="myRank" class="bg-court-700/70 rounded-xl px-4 py-2 text-center min-w-[64px]">
              <div class="text-2xl font-black text-white">#{{ myRank }}</div>
              <div class="text-[9px] text-zinc-400 uppercase tracking-widest">Rank</div>
            </div>
            <div v-if="myScore" class="bg-court-700/70 rounded-xl px-4 py-2 text-center min-w-[64px]">
              <div class="text-2xl font-black text-amber-400">{{ myScore.total }}</div>
              <div class="text-[9px] text-zinc-400 uppercase tracking-widest">Points</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Leaderboard -->
      <section class="mb-8">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase mb-4">
          Leaderboard
          <span class="text-zinc-500 font-normal normal-case tracking-normal text-xs ml-1">({{ sortedSubmitters.length }})</span>
        </h2>

        <!-- Pre-tournament: all submitters -->
        <div v-if="!hasScores" class="bg-court-800 border border-court-700 rounded-2xl overflow-hidden">
          <div v-if="!submitters.length" class="p-10 text-center">
            <div class="text-4xl mb-4 select-none">⏳</div>
            <div class="text-sm font-bold text-white mb-1">No picks yet</div>
          </div>
          <div
            v-for="s in sortedSubmitters"
            :key="s.uid ?? s.id"
            class="flex items-center gap-3 px-4 py-3 border-b border-court-700/40 last:border-0 transition-colors"
            :class="[
              (s.uid ?? s.id) === user?.uid ? 'bg-emerald-500/5' : 'hover:bg-court-700/20 cursor-pointer active:bg-court-700/30',
            ]"
            @click="openUser(s)"
          >
            <div class="flex items-center gap-1.5 flex-1 min-w-0">
              <span
                class="text-xs font-semibold truncate"
                :class="(s.uid ?? s.id) === user?.uid ? 'text-emerald-300' : 'text-white'"
              >{{ fmtName(s.name) }}</span>
            </div>
            <span v-if="(s.uid ?? s.id) === user?.uid" class="text-[9px] text-emerald-500/50 font-bold uppercase tracking-wider shrink-0">you</span>
            <span class="text-sm font-black shrink-0 text-zinc-600">—</span>
          </div>
        </div>

        <!-- Scores table -->
        <div v-else class="bg-court-800 border border-court-700 rounded-2xl overflow-hidden">
          <!-- Table header -->
          <div
            class="grid text-[10px] font-black tracking-[0.15em] text-zinc-400 uppercase border-b border-court-700 px-4 py-2.5"
            style="grid-template-columns: 2rem 1fr 3.5rem 3.5rem 4rem"
          >
            <div>#</div>
            <div>Player</div>
            <div class="text-center">Grps</div>
            <div class="text-center">WCs</div>
            <div class="text-right">Total</div>
          </div>

          <!-- Score rows -->
          <div
            v-for="(s, i) in scores"
            :key="s.id"
            class="grid items-center px-4 py-3 border-b border-court-700/40 last:border-0 transition-colors"
            :class="[
              s.id === user?.uid ? 'bg-emerald-500/5' : 'hover:bg-court-700/20 cursor-pointer active:bg-court-700/30',
            ]"
            style="grid-template-columns: 2rem 1fr 3.5rem 3.5rem 4rem"
            @click="openUser(s)"
          >
            <!-- Rank -->
            <div
              class="text-sm font-black"
              :class="i === 0 ? 'text-amber-400' : i === 1 ? 'text-zinc-300' : i === 2 ? 'text-amber-700' : 'text-zinc-400'"
            >{{ i + 1 }}</div>

            <!-- Name -->
            <div class="flex items-center gap-1.5 min-w-0">
              <span
                class="text-xs font-semibold truncate"
                :class="s.id === user?.uid ? 'text-emerald-300' : 'text-white'"
              >{{ fmtName(s.name) }}</span>
              <span v-if="s.id === user?.uid" class="text-[9px] text-emerald-500/50 font-bold uppercase tracking-wider shrink-0">you</span>
            </div>

            <!-- Breakdown -->
            <div class="text-xs text-center font-mono text-zinc-400">{{ s.breakdown?.groups ?? '—' }}</div>
            <div class="text-xs text-center font-mono text-zinc-400">{{ s.breakdown?.wildcards ?? '—' }}</div>

            <!-- Total -->
            <div
              class="text-sm text-right font-black"
              :class="i === 0 ? 'text-amber-400' : 'text-white'"
            >{{ s.total }}</div>
          </div>
        </div>
      </section>

      <!-- My Picks summary -->
      <section v-if="submission" class="mb-6">
        <div class="w-full pb-3 border-b border-court-700 mb-4">
          <span class="text-sm font-black tracking-[0.2em] text-white uppercase">My Picks</span>
        </div>
        <PicksSummary
          ref="picksSummaryRef"
          :groups="submission.groups"
          :wildcards="submission.wildcards"
          :props="submission.props"
        />
      </section>

      <div class="text-center py-4">
        <span class="text-[10px] text-zinc-700 font-mono">v{{ appVersion }}</span>
      </div>

      </template><!-- end !loading -->

      <PicksModal
        v-if="selectedUser"
        :uid="selectedUser.uid"
        :name="selectedUser.name"
        :photoURL="selectedUser.photoURL"
        @close="selectedUser = null"
      />
    </div><!-- end content wrapper -->
  </div>
</template>

<style scoped>
.pin-enter-active { transition: all 0.15s ease-out; }
.pin-leave-active { transition: all 0.1s ease-in; }
.pin-enter-from  { opacity: 0; transform: translateY(-6px); }
.pin-leave-to    { opacity: 0; transform: translateY(-4px); }
.pin-move        { transition: transform 0.15s ease; }
</style>

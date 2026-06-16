<script setup>
import { ref, computed, inject, onMounted } from 'vue'
import { useRouter } from 'vue-router'
const appVersion = __APP_VERSION__
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase.js'
import { GROUPS, PROPS, TEAM_FLAG, TEAM_BY_ID } from '../data.js'
import { ROSTERS } from '../rosters.js'
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
  // Don't open modal for the current user
  if (uid === user.value?.uid) return
  selectedUser.value = { uid, name: s.name, photoURL: s.photoURL ?? null }
}
</script>

<template>
  <div
    class="max-w-2xl mx-auto px-4"
    style="padding-top: calc(4rem + env(safe-area-inset-top)); padding-bottom: max(6rem, calc(6rem + env(safe-area-inset-bottom)))"
  >
    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <template v-else>

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
          :groups="submission.groups"
          :wildcards="submission.wildcards"
          :props="submission.props"
        />
      </section>

      <div class="text-center py-4">
        <span class="text-[10px] text-zinc-700 font-mono">v{{ appVersion }}</span>
      </div>

    </template>

    <!-- Picks modal for another user -->
    <PicksModal
      v-if="selectedUser"
      :uid="selectedUser.uid"
      :name="selectedUser.name"
      :photoURL="selectedUser.photoURL"
      @close="selectedUser = null"
    />
  </div>
</template>

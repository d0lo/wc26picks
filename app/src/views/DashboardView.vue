<script setup>
import { ref, computed, onMounted } from 'vue'
const appVersion = __APP_VERSION__
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import PicksHeader from '../components/PicksHeader.vue'
import { db } from '../firebase.js'
import { GROUPS, PROPS, TEAM_FLAG } from '../data.js'
import ProfileModal from '../components/ProfileModal.vue'

const showProfile = ref(false)
const editNameMode = ref(false)

const ballTotalDeg = ref(0)
const ballDuration = ref('0ms')
let ballSpinTimer = null
function spinBall() {
  clearTimeout(ballSpinTimer)
  const ms = 700 + Math.floor(Math.random() * 301)
  const deg = 720 + Math.floor(Math.random() * 721)
  ballDuration.value = `${ms}ms`
  ballTotalDeg.value += deg
  ballSpinTimer = setTimeout(() => { ballDuration.value = '0ms' }, ms)
}

const props = defineProps({ user: Object, picksLocked: Boolean })
const emit = defineEmits(['edit-picks'])

const submission = ref(null)
const scores = ref([])
const submitters = ref([])
const loading = ref(true)

function playerName(val) {
  return val ? val.replace(/\s*\(.*\)$/, '') : '—'
}
function playerFlag(val) {
  const m = val?.match(/\((.+)\)$/)
  return m ? m[1] : ''
}

async function fetchData() {
  try {
    const [subSnap, scoresSnap, submittersSnap] = await Promise.all([
      getDoc(doc(db, 'submissions', props.user.uid)),
      getDocs(query(collection(db, 'scores'), orderBy('total', 'desc'), limit(50))),
      getDocs(query(collection(db, 'submissions'), orderBy('submittedAt', 'asc'))),
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

function onNameSaved() {
  showProfile.value = false
  fetchData()
}

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
  const idx = scores.value.findIndex(s => s.id === props.user.uid)
  return idx >= 0 ? idx + 1 : null
})
const myScore = computed(() => scores.value.find(s => s.id === props.user.uid))

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
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 pt-16" style="padding-bottom: max(4rem, calc(4rem + env(safe-area-inset-bottom)))">

    <ProfileModal v-if="showProfile" :user="user" :edit-name="editNameMode" @close="showProfile = false; editNameMode = false" @name-saved="onNameSaved" />

    <PicksHeader :user="user" :locked="false" @profile="showProfile = true" />

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <template v-else>

      <!-- Picks locked hero card -->
      <div class="relative bg-gradient-to-br from-court-800 to-court-900 border border-emerald-500/20 rounded-3xl p-6 mt-4 mb-5 overflow-hidden">
        <div class="absolute -right-10 -top-10 w-48 h-48 bg-emerald-400/5 rounded-full blur-3xl pointer-events-none"></div>
        <div class="flex items-start justify-between gap-4 relative">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
              <span class="text-[10px] font-black tracking-[0.3em] text-emerald-400 uppercase">Picks Submitted</span>
            </div>
            <h1 class="text-2xl font-black text-white leading-tight">You're in.</h1>
            <p class="text-xs text-zinc-400 mt-1">{{ fmtDate(submission?.submittedAt) }}</p>
          </div>
          <div class="relative shrink-0 select-none">
            <div class="absolute inset-0 blur-2xl bg-amber-400/15 rounded-full scale-[2] pointer-events-none"></div>
            <div
              class="absolute inset-x-0 top-0 flex justify-center text-2xl leading-none pointer-events-none"
              :style="{ transform: `translateY(-55%) rotate(${ballTotalDeg}deg)`, transition: `transform ${ballDuration} cubic-bezier(0.22, 1, 0.36, 1)` }"
            >⚽</div>
            <div class="relative text-5xl" style="filter: drop-shadow(0 0 24px rgba(251,191,36,0.45))">🏆</div>
            <div class="absolute inset-x-0 top-0 flex justify-center cursor-pointer" style="transform: translateY(-55%)" @click="spinBall">
              <div style="width:2rem; height:2rem"></div>
            </div>
          </div>
        </div>

        <!-- Rank + score pills (once scoring starts) -->
        <div v-if="myRank || myScore" class="flex items-center gap-3 mt-4 relative">
          <div v-if="myRank" class="bg-court-700/70 rounded-2xl px-4 py-2 text-center min-w-[64px]">
            <div class="text-xl font-black text-white">#{{ myRank }}</div>
            <div class="text-[9px] text-zinc-400 uppercase tracking-widest">Rank</div>
          </div>
          <div v-if="myScore" class="bg-court-700/70 rounded-2xl px-4 py-2 text-center min-w-[64px]">
            <div class="text-xl font-black text-amber-400">{{ myScore.total }}</div>
            <div class="text-[9px] text-zinc-400 uppercase tracking-widest">Points</div>
          </div>
        </div>

        <button
          v-if="!picksLocked"
          @click="emit('edit-picks')"
          class="mt-4 text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium relative"
        >Edit picks →</button>
      </div>

      <!-- Leaderboard -->
      <section class="mb-8">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase mb-4">
          Leaderboard
          <span class="text-zinc-500 font-normal normal-case tracking-normal text-xs ml-1">({{ sortedSubmitters.length }})</span>
        </h2>

        <!-- Pre-tournament: show all submitters -->
        <div v-if="!hasScores" class="bg-court-800 border border-court-700 rounded-2xl overflow-hidden">
          <div v-if="!submitters.length" class="p-10 text-center">
            <div class="text-4xl mb-4 select-none">⏳</div>
            <div class="text-sm font-bold text-white mb-1">No picks yet</div>
          </div>
          <div
            v-for="s in sortedSubmitters" :key="s.uid ?? s.id"
            class="flex items-center gap-3 px-4 py-3 border-b border-court-700/40 last:border-0"
            :class="(s.uid ?? s.id) === user.uid ? 'bg-emerald-500/5' : 'hover:bg-court-700/20'"
          >
            <div class="flex items-center gap-1.5 flex-1 min-w-0">
              <span
                class="text-xs font-semibold truncate"
                :class="(s.uid ?? s.id) === user.uid ? 'text-emerald-300' : 'text-white'"
              >{{ fmtName(s.name) }}</span>
              <button v-if="(s.uid ?? s.id) === user.uid" @click.stop="editNameMode = true; showProfile = true" class="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0" aria-label="Edit display name">
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>
            <span v-if="(s.uid ?? s.id) === user.uid" class="text-[9px] text-emerald-500/50 font-bold uppercase tracking-wider shrink-0">you</span>
            <span class="text-sm font-black shrink-0" :class="hasScores ? 'text-white' : 'text-zinc-600'">
              {{ scores.find(sc => sc.id === (s.uid ?? s.id))?.total ?? '—' }}
            </span>
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
            v-for="(s, i) in scores" :key="s.id"
            class="grid items-center px-4 py-3 border-b border-court-700/40 last:border-0 transition-colors"
            :class="s.id === user.uid ? 'bg-emerald-500/5' : 'hover:bg-court-700/20'"
            style="grid-template-columns: 2rem 1fr 3.5rem 3.5rem 4rem"
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
                :class="s.id === user.uid ? 'text-emerald-300' : 'text-white'"
              >{{ fmtName(s.name) }}</span>
              <button v-if="s.id === user.uid" @click.stop="editNameMode = true; showProfile = true" class="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0" aria-label="Edit display name">
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <span v-if="s.id === user.uid" class="text-[9px] text-emerald-500/50 font-bold uppercase tracking-wider shrink-0">you</span>
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
      <section v-if="submission">
        <div class="w-full flex items-center justify-between pb-3 border-b border-court-700 mb-4">
          <span class="text-sm font-black tracking-[0.2em] text-white uppercase">My Picks</span>
        </div>

        <div class="space-y-3">

          <!-- Groups grid -->
          <div class="bg-court-800 border border-court-700 rounded-2xl p-4">
            <div class="flex items-baseline justify-between mb-4">
              <div class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase">Group Standings</div>
              <span class="text-[10px] text-zinc-400 font-mono tabular-nums">3 · 3 · 1 · 1 pts</span>
            </div>
            <div class="grid grid-cols-2 gap-x-5 gap-y-4">
              <div v-for="g in GROUPS" :key="g">
                <div class="text-[10px] font-black tracking-[0.15em] text-emerald-400 mb-1.5">GROUP {{ g }}</div>
                <div class="space-y-0.5">
                  <div
                    v-for="(team, i) in submission.groups[g]" :key="i"
                    class="flex items-center gap-1.5 text-[11px] transition-opacity"
                    :class="(i === 3 || (i === 2 && !submission.wildcards.includes(g))) ? 'opacity-30' : ''"
                  >
                    <span
                      class="text-[9px] font-black w-4 text-right tabular-nums shrink-0"
                      :class="['text-amber-400','text-zinc-400','text-amber-700','text-zinc-400'][i]"
                    >{{ i + 1 }}</span>
                    <span class="text-base leading-none shrink-0">{{ TEAM_FLAG[team] ?? '🏳️' }}</span>
                    <span
                      class="truncate"
                      :class="i < 2 || (i === 2 && submission.wildcards.includes(g)) ? 'text-white font-bold' : 'text-zinc-300'"
                    >{{ team }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Wildcards -->
          <div class="bg-court-800 border border-court-700 rounded-2xl p-4">
            <div class="flex items-baseline justify-between mb-3">
              <div class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase">Best 3rd-Place Teams</div>
              <span class="text-[10px] text-zinc-400 font-mono">2 pts each</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="g in [...submission.wildcards].sort()" :key="g"
                class="flex items-center gap-1.5 bg-court-700 border border-court-600 rounded-xl px-2.5 py-1.5"
              >
                <span class="text-sm leading-none">{{ TEAM_FLAG[submission.groups[g]?.[2]] ?? '🏳️' }}</span>
                <span class="text-[10px] font-black text-emerald-400">{{ g }}</span>
                <span class="text-xs text-zinc-300">{{ submission.groups[g]?.[2] }}</span>
              </div>
            </div>
          </div>

          <!-- Props -->
          <div class="bg-court-800 border border-court-700 rounded-2xl p-4">
            <div class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase mb-3">Group Stage Props</div>
            <div class="divide-y divide-court-700">
              <div v-for="prop in PROPS" :key="prop.key" class="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <div class="shrink-0">
                  <div class="text-[11px] text-zinc-400">{{ prop.label }}</div>
                  <div class="text-[10px] text-amber-400/60 font-mono">{{ prop.points }}pt{{ prop.points !== 1 ? 's' : '' }}</div>
                </div>
                <div class="text-[11px] text-right text-white font-medium flex items-center gap-1 justify-end">
                  <template v-if="prop.type === 'player'">
                    <span>{{ playerFlag(submission.props[prop.key]) }}</span>
                    <span>{{ playerName(submission.props[prop.key]) }}</span>
                  </template>
                  <template v-else-if="prop.type === 'team' && submission.props[prop.key] && submission.props[prop.key] !== '__none__'">
                    <span>{{ TEAM_FLAG[submission.props[prop.key]] ?? '🏳️' }}</span>
                    <span>{{ submission.props[prop.key] }}</span>
                  </template>
                  <template v-else>
                    <span>{{ submission.props[prop.key] === '__none__' ? '🚫 No Team' : (submission.props[prop.key] || '—') }}</span>
                  </template>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

    </template>

    <div class="text-center py-4">
      <span class="text-[10px] text-zinc-700 font-mono">v{{ appVersion }}</span>
    </div>

  </div>
</template>

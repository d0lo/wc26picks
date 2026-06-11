<script setup>
import { ref, computed, onMounted } from 'vue'
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase.js'
import { GROUPS, PROPS } from '../data.js'
import ProfileModal from '../components/ProfileModal.vue'

const showProfile = ref(false)

const props = defineProps({ user: Object, picksLocked: Boolean })
const emit = defineEmits(['edit-picks'])

const submission = ref(null)
const scores = ref([])
const loading = ref(true)
const showPicks = ref(false)

onMounted(async () => {
  try {
    const [subSnap, scoresSnap] = await Promise.all([
      getDoc(doc(db, 'submissions', props.user.uid)),
      getDocs(query(collection(db, 'scores'), orderBy('total', 'desc'), limit(50))),
    ])
    if (subSnap.exists()) submission.value = subSnap.data()
    scores.value = scoresSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch {
    // Firestore unavailable — show empty state
  } finally {
    loading.value = false
  }
})

const hasScores = computed(() => scores.value.length > 0)
const myRank = computed(() => {
  if (!hasScores.value) return null
  const idx = scores.value.findIndex(s => s.id === props.user.uid)
  return idx >= 0 ? idx + 1 : null
})
const myScore = computed(() => scores.value.find(s => s.id === props.user.uid))

function fmtDate(ts) {
  if (!ts?.toDate) return ''
  return ts.toDate().toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 pb-16">

    <ProfileModal v-if="showProfile" :user="user" @close="showProfile = false" />

    <!-- Nav bar -->
    <header class="flex items-center justify-between py-4 border-b border-court-700 mb-6">
      <button type="button" @click="showProfile = true" class="flex items-center gap-3 text-left">
        <img
          v-if="user.photoURL"
          :src="user.photoURL"
          class="w-8 h-8 rounded-full ring-1 ring-court-600"
          referrerpolicy="no-referrer"
        />
        <div v-else class="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm font-bold">
          {{ user.displayName?.[0] }}
        </div>
        <div>
          <div class="text-[10px] text-zinc-400">Signed in as</div>
          <div class="text-sm font-bold text-white leading-tight">{{ user.displayName }}</div>
        </div>
      </button>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <template v-else>

      <!-- Picks locked hero card -->
      <div class="relative bg-gradient-to-br from-court-800 to-court-900 border border-emerald-500/20 rounded-3xl p-6 mb-5 overflow-hidden">
        <div class="absolute -right-10 -top-10 w-48 h-48 bg-emerald-400/5 rounded-full blur-3xl pointer-events-none"></div>
        <div class="flex items-start justify-between gap-4 relative">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
              <span class="text-[10px] font-black tracking-[0.3em] text-emerald-400 uppercase">Picks Locked</span>
            </div>
            <h1 class="text-2xl font-black text-white leading-tight">You're in.</h1>
            <p class="text-xs text-zinc-400 mt-1">{{ fmtDate(submission?.submittedAt) }}</p>
          </div>
          <div class="text-5xl shrink-0 select-none" style="filter: drop-shadow(0 0 24px rgba(251,191,36,0.35))">🏆</div>
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
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase mb-4">Leaderboard</h2>

        <!-- Empty / pending state -->
        <div v-if="!hasScores" class="bg-court-800 border border-court-700 rounded-2xl p-10 text-center">
          <div class="text-4xl mb-4 select-none">⏳</div>
          <div class="text-sm font-bold text-white mb-1">Scoring Pending</div>
          <p class="text-xs text-zinc-400 max-w-[280px] mx-auto leading-relaxed">
            Rankings appear once the tournament begins and results are entered. Check back after June 12.
          </p>
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

            <!-- Name + avatar -->
            <div class="flex items-center gap-2 min-w-0">
              <img
                v-if="s.photoURL"
                :src="s.photoURL"
                class="w-6 h-6 rounded-full shrink-0"
                referrerpolicy="no-referrer"
              />
              <div v-else class="w-6 h-6 rounded-full bg-court-600 shrink-0 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                {{ s.name?.[0] ?? '?' }}
              </div>
              <span
                class="text-xs font-semibold truncate"
                :class="s.id === user.uid ? 'text-emerald-300' : 'text-white'"
              >{{ s.name }}</span>
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

      <!-- My Picks summary (collapsible) -->
      <section v-if="submission">
        <button
          @click="showPicks = !showPicks"
          class="w-full flex items-center justify-between pb-3 border-b border-court-700 mb-4"
        >
          <span class="text-sm font-black tracking-[0.2em] text-white uppercase">My Picks</span>
          <span class="text-xs text-zinc-400 font-normal">{{ showPicks ? 'hide ↑' : 'show ↓' }}</span>
        </button>

        <div v-if="showPicks" class="space-y-3">

          <!-- Groups grid -->
          <div class="bg-court-800 border border-court-700 rounded-2xl p-4">
            <div class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase mb-4">Group Standings</div>
            <div class="grid grid-cols-2 gap-x-5 gap-y-4">
              <div v-for="g in GROUPS" :key="g">
                <div class="text-[10px] font-black tracking-[0.15em] text-emerald-400 mb-1.5">GROUP {{ g }}</div>
                <div class="space-y-0.5">
                  <div v-for="(team, i) in submission.groups[g]" :key="i" class="flex items-center gap-1.5 text-[11px]">
                    <span
                      class="text-[9px] font-black w-4 text-right tabular-nums shrink-0"
                      :class="['text-amber-400','text-zinc-400','text-amber-700','text-zinc-400'][i]"
                    >{{ i + 1 }}</span>
                    <span class="truncate text-zinc-300">{{ team }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Wildcards -->
          <div class="bg-court-800 border border-court-700 rounded-2xl p-4">
            <div class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase mb-3">Best 3rd-Place Teams</div>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="g in submission.wildcards" :key="g"
                class="bg-court-700 border border-court-600 rounded-xl px-2.5 py-1.5"
              >
                <span class="text-[10px] font-black text-emerald-400">{{ g }}</span>
                <span class="text-xs text-zinc-300 ml-1.5">{{ submission.groups[g]?.[2] }}</span>
              </div>
            </div>
          </div>

          <!-- Props -->
          <div class="bg-court-800 border border-court-700 rounded-2xl p-4">
            <div class="text-[10px] font-black tracking-[0.2em] text-zinc-400 uppercase mb-3">Props</div>
            <div class="divide-y divide-court-700">
              <div v-for="prop in PROPS" :key="prop.key" class="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <span class="text-[11px] text-zinc-400 shrink-0">{{ prop.label }}</span>
                <span class="text-[11px] text-right text-white font-medium">{{ submission.props[prop.key] }}</span>
              </div>
            </div>
          </div>

        </div>
      </section>

    </template>
  </div>
</template>

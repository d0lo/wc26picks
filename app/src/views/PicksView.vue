<script setup>
import { reactive, ref, computed, onMounted } from 'vue'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase.js'
import { GROUP_TEAMS, GROUPS, PROPS, TEAM_FLAG } from '../data.js'
import CountrySelect from '../components/CountrySelect.vue'
import PlayerSelect from '../components/PlayerSelect.vue'

const props = defineProps({ user: Object })
const emit = defineEmits(['submitted'])

// ── State ──────────────────────────────────────────────────────────────
// rankings[group][team] = position 1–4 | null
const rankings = reactive(
  Object.fromEntries(
    GROUPS.map(g => [g, Object.fromEntries(GROUP_TEAMS[g].map(t => [t, null]))])
  )
)
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
      arr.forEach((team, i) => {
        if (team && rankings[g]?.[team] !== undefined) rankings[g][team] = i + 1
      })
    }
  }
  if (data.wildcards) wildcards.value = [...data.wildcards]
  if (data.props) Object.assign(propAnswers, data.props)
})

// ── Group matrix logic ─────────────────────────────────────────────────
function selectPos(group, team, pos) {
  if (rankings[group][team] === pos) {
    rankings[group][team] = null
    if (pos === 3) wildcards.value = wildcards.value.filter(g => g !== group)
    return
  }
  if (GROUP_TEAMS[group].some(t => rankings[group][t] === pos && t !== team)) return
  if (rankings[group][team] === 3) wildcards.value = wildcards.value.filter(g => g !== group)
  rankings[group][team] = pos
}

function isPosTaken(group, pos, team) {
  return GROUP_TEAMS[group].some(t => rankings[group][t] === pos && t !== team)
}

function groupDone(group) {
  return GROUP_TEAMS[group].every(t => rankings[group][t] !== null)
}

function resetGroup(group) {
  GROUP_TEAMS[group].forEach(t => { rankings[group][t] = null })
  wildcards.value = wildcards.value.filter(g => g !== group)
}

// ── Wildcard logic ─────────────────────────────────────────────────────
function thirdOf(group) {
  return GROUP_TEAMS[group].find(t => rankings[group][t] === 3) ?? null
}

function toggleWildcard(group) {
  if (!thirdOf(group)) return
  const i = wildcards.value.indexOf(group)
  if (i >= 0) wildcards.value.splice(i, 1)
  else if (wildcards.value.length < 8) wildcards.value.push(group)
}

function wcDisabled(group) {
  if (!thirdOf(group)) return true
  return wildcards.value.length >= 8 && !wildcards.value.includes(group)
}

// ── Progress ───────────────────────────────────────────────────────────
const doneGroups = computed(() => GROUPS.filter(g => groupDone(g)).length)
const doneProps = computed(() => PROPS.filter(p => propAnswers[p.key] !== '').length)
const canSubmit = computed(
  () => doneGroups.value === 12 && wildcards.value.length === 8 && doneProps.value === PROPS.length
)

// ── Submit ─────────────────────────────────────────────────────────────
async function submit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  submitError.value = ''
  const groupsData = Object.fromEntries(
    GROUPS.map(g => {
      const arr = new Array(4).fill(null)
      Object.entries(rankings[g]).forEach(([team, pos]) => { if (pos) arr[pos - 1] = team })
      return [g, arr]
    })
  )
  try {
    await setDoc(doc(db, 'submissions', props.user.uid), {
      name: props.user.displayName,
      uid: props.user.uid,
      photoURL: props.user.photoURL ?? null,
      submittedAt: serverTimestamp(),
      groups: groupsData,
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

// ── Position button styles ─────────────────────────────────────────────
const POS_ACTIVE = {
  1: 'bg-amber-400 border-amber-400 text-slate-900',
  2: 'bg-slate-200 border-slate-200 text-slate-900',
  3: 'bg-amber-700 border-amber-700 text-amber-100',
  4: 'bg-slate-700 border-slate-600 text-white',
}
const POS_LABEL = ['1st', '2nd', '3rd', '4th']
const POS_LABEL_COLORS = ['text-amber-400', 'text-slate-400', 'text-amber-700', 'text-slate-600']

function btnCls(group, team, pos) {
  const sel = rankings[group][team] === pos
  const taken = isPosTaken(group, pos, team)
  const base = 'w-8 h-8 rounded-full border text-[11px] font-bold transition-all duration-100 flex items-center justify-center shrink-0'
  if (sel) return `${base} ${POS_ACTIVE[pos]}`
  if (taken) return `${base} border-court-600 text-court-600 cursor-not-allowed`
  return `${base} border-slate-700/80 text-slate-600 hover:border-sky-400 hover:text-sky-300 cursor-pointer`
}
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 pb-40">

    <!-- Sticky progress header -->
    <header class="sticky top-0 z-50 -mx-4 px-4 py-3 bg-court-950/95 backdrop-blur-md border-b border-court-700">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[10px] font-black tracking-[0.25em] text-slate-600 uppercase">WC 2026</div>
          <div class="text-sm font-bold text-white truncate">{{ user.displayName?.split(' ')[0] }}'s Picks</div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <div
            class="border rounded-full px-2 py-0.5 text-[11px] font-mono transition-colors"
            :class="doneGroups === 12 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-court-700 text-slate-500 border-court-600'"
          >{{ doneGroups }}/12</div>
          <div
            class="border rounded-full px-2 py-0.5 text-[11px] font-mono transition-colors"
            :class="wildcards.length === 8 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-court-700 text-slate-500 border-court-600'"
          >{{ wildcards.length }}/8</div>
          <div
            class="border rounded-full px-2 py-0.5 text-[11px] font-mono transition-colors"
            :class="doneProps === 10 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-court-700 text-slate-500 border-court-600'"
          >{{ doneProps }}/10</div>
        </div>
      </div>
    </header>

    <!-- ── SECTION 1: Group Standings ── -->
    <section class="mt-8 mb-10">
      <div class="flex items-baseline justify-between mb-1">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase">Group Standings</h2>
        <span class="text-[10px] text-slate-600 font-mono tabular-nums">3 · 3 · 1 · 1 pts</span>
      </div>
      <p class="text-[11px] text-slate-600 mb-5">Rank all 4 teams per group. Taken positions lock automatically.</p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          v-for="group in GROUPS" :key="group"
          class="rounded-2xl border p-4 transition-colors duration-200"
          :class="groupDone(group) ? 'bg-court-800 border-emerald-500/20' : 'bg-court-800 border-court-700'"
        >
          <!-- Group card header -->
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="text-[11px] font-black tracking-[0.2em] text-sky-400">GROUP {{ group }}</span>
              <span v-if="groupDone(group)" class="text-emerald-400 text-sm leading-none">✓</span>
            </div>
            <button
              @click="resetGroup(group)"
              class="text-[10px] text-slate-700 hover:text-red-400 transition-colors font-medium leading-none"
            >clear</button>
          </div>

          <!-- Column position labels -->
          <div class="grid items-center mb-1.5" style="grid-template-columns: 1fr repeat(4, 2rem); gap: 0 4px">
            <div></div>
            <div
              v-for="(label, i) in POS_LABEL" :key="label"
              class="text-center text-[10px] font-bold"
              :class="POS_LABEL_COLORS[i]"
            >{{ label }}</div>
          </div>

          <!-- Team rows -->
          <div
            v-for="team in GROUP_TEAMS[group]" :key="team"
            class="grid items-center py-1.5 border-t border-court-700/50"
            style="grid-template-columns: 1fr repeat(4, 2rem); gap: 0 4px"
          >
            <div
              class="text-xs font-medium truncate pr-2 transition-colors duration-100"
              :class="rankings[group][team] ? 'text-white' : 'text-slate-500'"
            >{{ team }}</div>
            <button
              v-for="pos in [1,2,3,4]" :key="pos"
              type="button"
              :class="btnCls(group, team, pos)"
              :disabled="isPosTaken(group, pos, team)"
              @click="selectPos(group, team, pos)"
            >
              <span v-if="rankings[group][team] === pos">{{ pos }}</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ── SECTION 2: Wildcards ── -->
    <section class="mb-10">
      <div class="flex items-baseline justify-between mb-1">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase">Best 3rd-Place Teams</h2>
        <span class="text-[10px] text-slate-600 font-mono">2 pts each</span>
      </div>
      <p class="text-[11px] text-slate-600 mb-5">
        Pick 8 groups whose 3rd-place team advances. Assign group standings first to unlock.
        <span
          class="font-mono ml-1 transition-colors"
          :class="wildcards.length === 8 ? 'text-emerald-400' : 'text-slate-500'"
        >{{ wildcards.length }}/8</span>
      </p>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <button
          v-for="group in GROUPS" :key="group"
          type="button"
          @click="toggleWildcard(group)"
          :disabled="wcDisabled(group)"
          class="relative text-left p-3 rounded-xl border transition-all duration-150"
          :class="[
            wildcards.includes(group)
              ? 'bg-sky-500/10 border-sky-400/30 shadow-[0_0_16px_-4px_rgba(56,189,248,0.2)]'
              : wcDisabled(group)
                ? 'bg-court-800 border-court-700 opacity-30 cursor-not-allowed'
                : 'bg-court-800 border-court-700 hover:border-slate-600 cursor-pointer active:scale-[0.98]',
          ]"
        >
          <div
            class="text-[10px] font-black tracking-[0.2em] mb-0.5"
            :class="wildcards.includes(group) ? 'text-sky-400' : 'text-slate-600'"
          >GRP {{ group }}</div>
          <div
            class="text-xs font-semibold truncate"
            :class="wildcards.includes(group) ? 'text-white' : thirdOf(group) ? 'text-slate-300' : 'text-slate-600'"
          >{{ thirdOf(group) ?? '3rd TBD' }}</div>

          <!-- Check mark when selected -->
          <div
            v-if="wildcards.includes(group)"
            class="absolute top-2 right-2 w-3.5 h-3.5 bg-sky-400 rounded-full flex items-center justify-center"
          >
            <svg width="7" height="5" viewBox="0 0 7 5" fill="none" aria-hidden="true">
              <path d="M1 2.5L2.8 4.3L6 1" stroke="#06101F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </button>
      </div>
    </section>

    <!-- ── SECTION 3: Tournament Props ── -->
    <section class="mb-10">
      <div class="flex items-baseline justify-between mb-1">
        <h2 class="text-sm font-black tracking-[0.2em] text-white uppercase">Tournament Props</h2>
        <span class="text-[10px] text-slate-600 font-mono">3–10 pts</span>
      </div>
      <p class="text-[11px] text-slate-600 mb-5">Bold calls only. Points for exact matches.</p>

      <div class="space-y-2">
        <div
          v-for="prop in PROPS" :key="prop.key"
          class="bg-court-800 border border-court-700 rounded-2xl p-4"
        >
          <div class="flex items-start justify-between gap-3 mb-3">
            <div>
              <div class="text-xs font-bold text-white">{{ prop.label }}</div>
              <div class="text-[11px] text-slate-600 mt-0.5">{{ prop.hint }}</div>
            </div>
            <div class="shrink-0 text-[10px] font-black text-amber-400/60 bg-amber-400/5 border border-amber-400/10 rounded-full px-2 py-0.5 font-mono leading-5">
              {{ prop.points }}pt{{ prop.points !== 1 ? 's' : '' }}
            </div>
          </div>

          <CountrySelect
            v-if="prop.type === 'team'"
            v-model="propAnswers[prop.key]"
          />

          <PlayerSelect
            v-else-if="prop.type === 'player'"
            v-model="propAnswers[prop.key]"
          />

          <input
            v-else
            v-model="propAnswers[prop.key]"
            type="number"
            min="0"
            placeholder="e.g. 24"
            class="w-full bg-court-900 border border-court-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-700 focus:outline-none focus:border-sky-400 transition-colors"
          />
        </div>
      </div>
    </section>

    <!-- Fixed submit bar -->
    <div class="fixed bottom-0 left-0 right-0 z-50 bg-court-950/95 backdrop-blur-md border-t border-court-700 px-4 py-4">
      <div class="max-w-2xl mx-auto">
        <p v-if="submitError" class="text-red-400 text-xs text-center mb-2">{{ submitError }}</p>
        <button
          type="button"
          :disabled="!canSubmit || submitting"
          @click="submit"
          class="w-full py-4 rounded-2xl font-black text-sm tracking-[0.08em] uppercase transition-all duration-150"
          :class="canSubmit
            ? 'bg-sky-500 hover:bg-sky-400 text-white shadow-[0_0_32px_-4px_rgba(14,165,233,0.45)] active:scale-[0.99]'
            : 'bg-court-700 text-slate-600 cursor-not-allowed'"
        >
          <span v-if="submitting" class="flex items-center justify-center gap-2">
            <svg class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" stroke-dasharray="31.4" class="opacity-30"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
            Saving…
          </span>
          <span v-else>{{ isUpdate ? 'Update My Picks' : 'Lock In My Picks' }}</span>
        </button>
        <p v-if="!canSubmit && !submitting" class="text-center text-[11px] text-slate-700 mt-1.5">
          <span v-if="doneGroups < 12">{{ 12 - doneGroups }} group{{ 12 - doneGroups !== 1 ? 's' : '' }} remaining</span>
          <span v-if="doneGroups < 12 && wildcards.length < 8"> · </span>
          <span v-if="wildcards.length < 8">{{ 8 - wildcards.length }} wildcard{{ 8 - wildcards.length !== 1 ? 's' : '' }} remaining</span>
          <span v-if="(doneGroups < 12 || wildcards.length < 8) && doneProps < 10"> · </span>
          <span v-if="doneProps < 10">{{ 10 - doneProps }} prop{{ 10 - doneProps !== 1 ? 's' : '' }} remaining</span>
        </p>
      </div>
    </div>

  </div>
</template>

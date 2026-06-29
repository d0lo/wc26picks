<script setup>
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import {
  matchesQueryOptions, scoreboardQueryOptions, scheduleQueryOptions,
  groupsQueryOptions, wildcardsQueryOptions,
} from '../queries.js'
import { championStatus } from '../lib/champion.js'

// The home-screen "Your Champion" hero. Shows the user's standing (points +
// place) and follows their picked champion through the tournament: who beat
// them if they're out, or their last result / top scorer / next-or-live match
// if they're still in it.
const props = defineProps({
  championId: { type: String, default: null },   // picks/{uid}.knockout.final[0]
  points: { type: Number, default: null },        // total score (null until scoring begins)
  rank: { type: Number, default: null },          // leaderboard place
  totalPlayers: { type: Number, default: null },  // field size, for "of N"
})

// All read from the shared TanStack caches — the scoreboard listener is owned
// by LeaderboardView; matches/groups/wildcards are already fetched there by
// PicksSummary. scheduleQuery adds the future-fixture skeleton for "next match".
const matchesQuery = useQuery(matchesQueryOptions())
const scoreboardQuery = useQuery(scoreboardQueryOptions())
const scheduleQuery = useQuery(scheduleQueryOptions())
const groupsQuery = useQuery(groupsQueryOptions())
const wildcardsQuery = useQuery(wildcardsQueryOptions())

const status = computed(() => championStatus({
  championId: props.championId,
  matches: matchesQuery.data.value ?? [],
  scoreboardEvents: scoreboardQuery.data.value?.events ?? [],
  scheduleEvents: scheduleQuery.data.value?.events ?? [],
  groups: groupsQuery.data.value ?? {},
  advancingLetters: wildcardsQuery.data.value?.advancingLetters ?? [],
}))

const team = computed(() => status.value?.team ?? null)

function kickoff(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  })
}
const outcomeLabel = { W: 'Won', L: 'Lost', D: 'Drew' }
const outcomeClass = { W: 'text-emerald-400', L: 'text-red-400', D: 'text-zinc-300' }
</script>

<template>
  <!-- No champion picked yet -->
  <div
    v-if="!championId"
    class="relative overflow-hidden rounded-3xl border border-court-700 bg-gradient-to-br from-court-750 via-court-800 to-court-900 p-6"
  >
    <div class="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl"></div>
    <div class="relative flex items-center gap-4">
      <div class="text-5xl select-none">🏆</div>
      <div>
        <div class="text-[10px] font-black tracking-[0.25em] text-emerald-400/80 uppercase">Your Champion</div>
        <div class="text-lg font-black text-white">Not picked yet</div>
        <div class="text-xs text-zinc-400 mt-0.5">Finish your bracket to crown a champion.</div>
      </div>
    </div>
  </div>

  <div
    v-else
    class="relative overflow-hidden rounded-3xl border p-6"
    :class="status?.wonItAll
      ? 'border-amber-400/40 bg-gradient-to-br from-amber-500/10 via-court-800 to-court-900'
      : status?.eliminated
        ? 'border-court-700 bg-gradient-to-br from-court-800 via-court-900 to-court-950'
        : 'border-court-700 bg-gradient-to-br from-court-750 via-court-800 to-court-900'"
  >
    <!-- Ambient glows -->
    <div
      class="pointer-events-none absolute -top-20 -right-12 h-56 w-56 rounded-full blur-3xl"
      :class="status?.wonItAll ? 'bg-amber-400/25' : status?.eliminated ? 'bg-zinc-500/10' : 'bg-emerald-500/20'"
    ></div>
    <div class="pointer-events-none absolute -bottom-24 -left-12 h-56 w-56 rounded-full blur-3xl bg-amber-500/10"></div>

    <!-- ── Identity + standing ─────────────────────────────────────────── -->
    <div class="relative flex items-start justify-between gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <div class="relative shrink-0">
          <div
            class="absolute inset-0 rounded-2xl blur-xl"
            :class="status?.eliminated ? 'bg-zinc-500/10' : 'bg-emerald-400/25'"
          ></div>
          <div
            class="relative text-5xl leading-none select-none transition-all duration-500"
            :class="status?.eliminated ? 'grayscale opacity-60' : ''"
          >{{ team?.flag }}</div>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] font-black tracking-[0.25em] uppercase"
              :class="status?.wonItAll ? 'text-amber-300' : 'text-emerald-400/80'">Your Champion</span>
            <span v-if="status?.wonItAll" class="text-xs">🏆</span>
          </div>
          <div class="text-2xl font-black text-white truncate leading-tight">{{ team?.name }}</div>
        </div>
      </div>

      <!-- Standing -->
      <div class="flex gap-2 shrink-0">
        <div class="rounded-xl bg-court-900/60 border border-court-700/60 px-3 py-2 text-center min-w-[58px]">
          <div class="text-xl font-black leading-none" :class="rank === 1 ? 'text-amber-400' : 'text-white'">
            {{ rank != null ? `#${rank}` : '—' }}
          </div>
          <div class="text-[8px] text-zinc-500 uppercase tracking-[0.15em] mt-1">
            {{ totalPlayers ? `of ${totalPlayers}` : 'Rank' }}
          </div>
        </div>
        <div class="rounded-xl bg-court-900/60 border border-court-700/60 px-3 py-2 text-center min-w-[58px]">
          <div class="text-xl font-black text-amber-400 leading-none tabular-nums">{{ points ?? 0 }}</div>
          <div class="text-[8px] text-zinc-500 uppercase tracking-[0.15em] mt-1">Points</div>
        </div>
      </div>
    </div>

    <!-- ── Champion status strip ───────────────────────────────────────── -->
    <div class="relative mt-5 pt-5 border-t border-court-700/60">

      <!-- Won it all -->
      <div v-if="status?.wonItAll" class="flex items-center gap-3">
        <div class="text-3xl select-none">🏆</div>
        <div>
          <div class="text-base font-black text-amber-300">World Champions!</div>
          <div class="text-xs text-zinc-300">{{ team?.name }} went all the way. Nailed it.</div>
        </div>
      </div>

      <!-- Eliminated -->
      <div v-else-if="status?.eliminated" class="flex items-center gap-3">
        <div class="text-3xl select-none">😢</div>
        <div class="min-w-0">
          <div v-if="status.defeatedBy" class="text-sm font-bold text-white leading-snug">
            Your champion was defeated by
            <span class="text-base">{{ status.defeatedBy.flag }}</span>
            <span class="text-red-300">{{ status.defeatedBy.name }}</span>!
          </div>
          <div v-else class="text-sm font-bold text-white leading-snug">
            Your champion didn't make it out of the group stage.
          </div>
          <div v-if="status.eliminatedRound" class="text-[11px] text-zinc-500 mt-0.5">
            Eliminated · {{ status.eliminatedRound }}
          </div>
        </div>
      </div>

      <!-- Live now -->
      <div v-else-if="status?.live" class="space-y-3">
        <div class="flex items-center gap-2">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <span class="text-[10px] font-black tracking-[0.2em] text-red-400 uppercase">Playing Now</span>
          <span v-if="status.live.fixture.clock" class="text-[10px] font-bold text-amber-400 ml-auto">{{ status.live.fixture.clock }}</span>
        </div>
        <div class="flex items-center justify-center gap-3 rounded-2xl bg-court-900/50 border border-court-700/60 px-4 py-3">
          <div class="flex-1 flex items-center justify-end gap-2 min-w-0">
            <span class="text-sm font-bold text-white truncate text-right">{{ status.live.champ?.name }}</span>
            <span class="text-2xl leading-none shrink-0">{{ status.live.champ?.flag }}</span>
          </div>
          <div class="shrink-0 text-2xl font-black text-white tabular-nums px-1">
            {{ status.live.champ?.score ?? 0 }}<span class="text-zinc-500 mx-1">–</span>{{ status.live.opp?.score ?? 0 }}
          </div>
          <div class="flex-1 flex items-center gap-2 min-w-0">
            <span class="text-2xl leading-none shrink-0">{{ status.live.opp?.flag }}</span>
            <span class="text-sm font-bold text-white truncate">{{ status.live.opp?.name }}</span>
          </div>
        </div>
      </div>

      <!-- Still in it: next match (+ last result / top scorer) -->
      <div v-else class="space-y-4">
        <div v-if="status?.next">
          <div class="text-[10px] font-black tracking-[0.2em] text-emerald-400/80 uppercase mb-2">
            Your Champion's Next Match
          </div>
          <div class="flex items-center justify-center gap-3 rounded-2xl bg-court-900/50 border border-court-700/60 px-4 py-3">
            <div class="flex-1 flex items-center justify-end gap-2 min-w-0">
              <span class="text-sm font-bold text-white truncate text-right">{{ status.next.teams[0]?.name ?? 'TBD' }}</span>
              <span class="text-2xl leading-none shrink-0">{{ status.next.teams[0]?.flag ?? '🏳️' }}</span>
            </div>
            <span class="shrink-0 text-[11px] font-black text-zinc-500 uppercase px-1">vs</span>
            <div class="flex-1 flex items-center gap-2 min-w-0">
              <span class="text-2xl leading-none shrink-0">{{ status.next.teams[1]?.flag ?? '🏳️' }}</span>
              <span class="text-sm font-bold text-white truncate">{{ status.next.teams[1]?.name ?? 'TBD' }}</span>
            </div>
          </div>
          <div class="text-center text-[11px] text-zinc-400 mt-2">
            {{ status.next.label }} · {{ kickoff(status.next.dateISO) }}
          </div>
        </div>
        <div v-else class="text-xs text-zinc-400">
          Still alive — awaiting their next fixture. 🔥
        </div>

        <!-- Last result + top scorer -->
        <div v-if="status?.lastResult || status?.topScorer" class="grid grid-cols-2 gap-2">
          <div v-if="status?.lastResult" class="rounded-xl bg-court-900/40 border border-court-700/50 px-3 py-2">
            <div class="text-[9px] font-black tracking-[0.15em] text-zinc-500 uppercase mb-1">Last Result</div>
            <div class="flex items-center gap-1.5 text-xs">
              <span v-if="status.lastResult.outcome" class="font-black" :class="outcomeClass[status.lastResult.outcome]">
                {{ outcomeLabel[status.lastResult.outcome] }}
              </span>
              <span class="font-bold text-white tabular-nums">
                {{ status.lastResult.champ?.score ?? 0 }}–{{ status.lastResult.opp?.score ?? 0 }}
              </span>
              <span class="text-zinc-500">vs</span>
              <span class="text-base leading-none">{{ status.lastResult.opp?.flag }}</span>
              <span class="text-zinc-300 truncate">{{ status.lastResult.opp?.name }}</span>
            </div>
          </div>
          <div v-if="status?.topScorer" class="rounded-xl bg-court-900/40 border border-court-700/50 px-3 py-2">
            <div class="text-[9px] font-black tracking-[0.15em] text-zinc-500 uppercase mb-1">Top Scorer</div>
            <div class="flex items-center gap-1.5 text-xs">
              <span class="text-amber-400">⚽</span>
              <span class="font-bold text-white truncate">{{ status.topScorer.name }}</span>
              <span class="text-zinc-400 ml-auto tabular-nums shrink-0">{{ status.topScorer.goals }}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

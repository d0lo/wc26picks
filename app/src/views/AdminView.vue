<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { picksListQueryOptions, usersListQueryOptions } from '../queries.js'

const router = useRouter()

const picksListQuery = useQuery(picksListQueryOptions())
const usersListQuery = useQuery(usersListQueryOptions())

const loading = computed(() => picksListQuery.isLoading.value || usersListQuery.isLoading.value)

const rows = computed(() => {
  const users = usersListQuery.data.value ?? {}
  const submitted = new Set((picksListQuery.data.value ?? []).map(p => p.id))
  return Object.entries(users)
    .map(([uid, u]) => ({
      uid,
      displayName: u.displayName ?? '(no name)',
      isAdmin: !!u.isAdmin,
      submitted: submitted.has(uid),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
})
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
      <h1 class="text-sm font-black tracking-[0.2em] text-white uppercase">Admin</h1>
    </div>

    <div v-if="loading" class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <div v-else class="bg-court-800 border border-court-700 rounded-2xl overflow-hidden">
      <div
        class="grid text-[10px] font-black tracking-[0.15em] text-zinc-400 uppercase border-b border-court-700 px-4 py-2.5"
        style="grid-template-columns: 1fr 5rem 4rem"
      >
        <div>User</div>
        <div class="text-center">Submitted</div>
        <div class="text-right">Admin</div>
      </div>

      <div v-if="!rows.length" class="p-10 text-center text-sm text-zinc-400">No users yet</div>

      <div
        v-for="r in rows"
        :key="r.uid"
        class="grid items-center px-4 py-3 border-b border-court-700/40 last:border-0"
        style="grid-template-columns: 1fr 5rem 4rem"
      >
        <div class="min-w-0">
          <div class="text-xs font-semibold text-white truncate">{{ r.displayName }}</div>
          <div class="text-[10px] text-zinc-500 truncate">{{ r.uid }}</div>
        </div>
        <div class="text-center">
          <span v-if="r.submitted" class="text-emerald-400">✓</span>
          <span v-else class="text-zinc-600">—</span>
        </div>
        <div class="text-right">
          <span v-if="r.isAdmin" class="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Yes</span>
          <span v-else class="text-zinc-600">—</span>
        </div>
      </div>
    </div>
  </div>
</template>

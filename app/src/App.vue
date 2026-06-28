<script setup>
import { ref, computed, provide, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, setDoc, onSnapshot } from 'firebase/firestore'
import { auth, db } from './firebase.js'
import { configQueryOptions, pickQueryOptions, userQueryOptions, matchesQueryOptions, queryKeys } from './queries.js'
import { isBracketPickComplete } from './bracket.js'
import AppHeader from './components/AppHeader.vue'
import TabBar from './components/TabBar.vue'
import ProfileModal from './components/ProfileModal.vue'
import KnockoutPromptModal from './components/KnockoutPromptModal.vue'

const router = useRouter()
const route = useRoute()
const queryClient = useQueryClient()
const loading = ref(true)
const user = ref(null)
const picksLockTime = ref(null)
const hasSubmitted = ref(false)
const dataReady = ref(false)
const showProfile = ref(false)
const editNameMode = ref(false)
const isAdmin = ref(false)

const picksLocked = computed(() => {
  if (!picksLockTime.value) return false
  const lockMs = picksLockTime.value?.toDate?.().getTime() ?? picksLockTime.value
  return Date.now() >= lockMs
})

// Knockout window: between the group stage finishing (all 12 groups
// decided) and the Round of 32 actually kicking off, users who deferred
// their bracket at the original picksLockAt deadline get a chance to fill
// it in. r32Started is the only available client-side signal for "has the
// Round of 32 started" — matches/{eventId} docs are only created reactively
// once a match flips to "in"/"post" (see CLAUDE.md), so there's no
// pre-emptive kickoff-date check; the window simply closes the instant the
// first Round of 32 match doc appears.
const matchesQuery = useQuery(matchesQueryOptions())
const pickQuery = useQuery(computed(() => pickQueryOptions(user.value?.uid)))

// Group-stage completeness can't be derived from groupLetter — production
// matches/{eventId} docs were found to be missing groupLetter (and round/
// slot) entirely, not just on legacy data but across the whole group stage,
// so per-group counts built on that field always undercount. status.state
// is reliably correct on every doc regardless, so instead: a group-stage
// match is just any match with no round set (knockout matches always carry
// one, derived fresh from a fixed eventId->round/slot table, unaffected by
// this gap) — the group stage is complete once all 72 of those are "post".
const GROUP_STAGE_MATCH_COUNT = 72
const groupStageComplete = computed(() => {
  const groupMatches = (matchesQuery.data.value ?? []).filter((m) => m.round == null)
  return groupMatches.length === GROUP_STAGE_MATCH_COUNT && groupMatches.every((m) => m.status?.state === 'post')
})
const r32Started = computed(() => (matchesQuery.data.value ?? []).some((m) => m.round === 'r32'))
const knockoutWindowOpen = computed(() => groupStageComplete.value && !r32Started.value)

// TEMPORARY — diagnostic overlay, gated on ?debug=1, to be removed once
// groupStageComplete is confirmed correct against production data.
const debugMode = new URLSearchParams(window.location.search).has('debug')
const debugInfo = computed(() => {
  const matches = matchesQuery.data.value ?? []
  const notPost = matches.filter((m) => m.status?.state !== 'post')
  return {
    isFetched: matchesQuery.isFetched.value,
    isError: matchesQuery.isError.value,
    error: matchesQuery.error.value?.message ?? null,
    totalCount: matches.length,
    postCount: matches.filter((m) => m.status?.state === 'post').length,
    notPostIds: notPost.map((m) => ({ id: m.id, state: m.status?.state, round: m.round })),
    roundCounts: matches.reduce((acc, m) => {
      const key = m.round == null ? 'null' : String(m.round)
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {}),
    groupStageComplete: groupStageComplete.value,
  }
})
const knockoutComplete = computed(() => !!pickQuery.data.value?.knockout && isBracketPickComplete(pickQuery.data.value.knockout))
const needsKnockoutPicks = computed(() => hasSubmitted.value && knockoutWindowOpen.value && pickQuery.isFetched.value && !knockoutComplete.value)

provide('user', user)
provide('picksLocked', picksLocked)
provide('picksLockTime', picksLockTime)
provide('hasSubmitted', hasSubmitted)
provide('isAdmin', isAdmin)
provide('knockoutWindowOpen', knockoutWindowOpen)
provide('r32Started', r32Started)

// Show the "fill out your bracket" dialog once per page load (i.e. on
// refresh), the first time the window/incompleteness conditions are met —
// not on every reactive recompute, so dismissing it ("I'll do it later")
// doesn't make it reappear later in the same session.
const showKnockoutDialog = ref(false)
const knockoutDialogShown = ref(false)
watch(needsKnockoutPicks, (needed) => {
  if (needed && !knockoutDialogShown.value) {
    showKnockoutDialog.value = true
    knockoutDialogShown.value = true
  }
})

function goToKnockoutPicks() {
  showKnockoutDialog.value = false
  router.push('/bracket')
}

// Lets any view open the global ProfileModal directly into edit-name mode
// (e.g. the inline pencil button next to "you" on the leaderboard).
function openProfile(editMode = false) {
  editNameMode.value = editMode
  showProfile.value = true
}
provide('openProfile', openProfile)

// Show header + tab bar on all authenticated pages except login/username
const showChrome = computed(() =>
  !!user.value && !['/login', '/username'].includes(route.path)
)

// Derive active tab from route path
const activeTab = computed(() => {
  if (route.path === '/picks') return 'picks'
  if (route.path === '/bracket') return 'bracket'
  if (route.path === '/leaderboard') return 'leaderboard'
  if (route.path === '/live') return 'live'
  if (route.path === '/admin') return 'admin'
  return null
})

// showPicksTab: show Picks tab when picks not locked, or user has already
// submitted — but once the group stage ends, the Picks tab disappears
// entirely in favor of the Bracket tab below (the rest of the picks doc is
// long since locked by then, so there's nothing left to do on /picks).
const showPicksTab = computed(() => (!picksLocked.value || hasSubmitted.value) && !groupStageComplete.value)
// showBracketTab: replaces the Picks tab once the group stage ends, and
// stays visible for the rest of the tournament (so the bracket remains
// viewable/scoreable through the knockout rounds, not just during the
// fill-it-out window).
const showBracketTab = computed(() => groupStageComplete.value)

function onTabNavigate(tab) {
  router.push('/' + tab)
}

router.beforeEach((to) => {
  if (!dataReady.value) return
  // If picks are locked and user has no submission, redirect /picks to /leaderboard
  if (to.path === '/picks' && picksLocked.value && !hasSubmitted.value) return '/leaderboard'
  // /picks no longer exists as a destination once the group stage ends
  if (to.path === '/picks' && groupStageComplete.value) return '/bracket'
  // /bracket isn't reachable until the group stage actually ends
  if (to.path === '/bracket' && !groupStageComplete.value) return '/leaderboard'
})

watch(picksLocked, (locked) => {
  // If picks just locked and user is on /picks with no submission, send to leaderboard
  if (locked && !hasSubmitted.value && router.currentRoute.value.path === '/picks') {
    router.push('/leaderboard')
  }
})

watch(groupStageComplete, (complete) => {
  // Picks tab just disappeared — anyone sitting on it gets bounced to the
  // Bracket tab that replaced it.
  if (complete && router.currentRoute.value.path === '/picks') {
    router.push('/bracket')
  }
})

// Keeps isAdmin (and the cached profile) live for the rest of the session.
// isAdmin is only ever granted out-of-band via the Admin SDK with no
// client-visible trigger, so a one-shot fetch would otherwise require a
// full reload to pick up a newly granted admin.
let profileUnsub = null

onMounted(async () => {
  // Config is public — fetch before auth so splash page shows lock time immediately.
  // Routing below depends on picksLocked, so the auth callback must await this
  // same promise rather than racing it — otherwise a fast auth resolution reads
  // picksLocked as false (lock time not loaded yet) and routes a locked-out user
  // straight to /picks.
  const configReady = queryClient.ensureQueryData(configQueryOptions()).then(data => {
    picksLockTime.value = data?.picksLockAt ?? null
  }).catch(() => {})

  onAuthStateChanged(auth, async (u) => {
    const prevUid = user.value?.uid
    if (u) {
      loading.value = true
      dataReady.value = false
    } else {
      // Reset modal state left open from the previous session (e.g. account
      // deletion or logout via ProfileModal) so it doesn't reappear on the
      // next sign-in, when `user` becomes truthy again.
      showProfile.value = false
      editNameMode.value = false
      profileUnsub?.()
      profileUnsub = null
      // Drop the previous user's pick/profile from cache (and from the next
      // localStorage persist) — on a shared device the next sign-in
      // shouldn't briefly paint the prior user's cached data before its own
      // fetch resolves.
      if (prevUid) {
        queryClient.removeQueries({ queryKey: queryKeys.pick(prevUid) })
        queryClient.removeQueries({ queryKey: queryKeys.user(prevUid) })
      }
    }
    user.value = u
    if (u) {
      // Keep the queryable users/{uid} mirror in sync with Auth profile data.
      // Never include isAdmin here — rules block client writes from setting it.
      setDoc(doc(db, 'users', u.uid), {
        displayName: u.displayName ?? null,
        photoURL: u.photoURL ?? null,
      }, { merge: true }).catch(() => {})

      // pick and profile are independent reads — fetch them in parallel.
      // Each is caught individually so a permissions error on either one is
      // best-effort and must never skip the username flow below.
      try {
        const [pickData, profile] = await Promise.all([
          queryClient.ensureQueryData(pickQueryOptions(u.uid)).catch(() => null),
          queryClient.ensureQueryData(userQueryOptions(u.uid)).catch(() => null),
          configReady,
        ])
        const pickExists = !!pickData
        isAdmin.value = !!profile?.isAdmin
        hasSubmitted.value = pickExists
        const isGoogle = u.providerData?.[0]?.providerId === 'google.com'
        const nameConfirmed = localStorage.getItem(`name_confirmed_${u.uid}`) === '1'
        if (!u.displayName) {
          await router.push('/username')
        } else if (isGoogle && !pickExists && !nameConfirmed) {
          await router.push('/username')
        } else if (picksLocked.value && !pickExists) {
          await router.push('/leaderboard')
        } else {
          await router.push(pickExists ? '/leaderboard' : '/picks')
        }
      } finally {
        dataReady.value = true
      }

      profileUnsub = onSnapshot(doc(db, 'users', u.uid), (snap) => {
        const profile = snap.exists() ? snap.data() : null
        queryClient.setQueryData(userQueryOptions(u.uid).queryKey, profile)
        isAdmin.value = !!profile?.isAdmin
      })
    } else {
      hasSubmitted.value = false
      isAdmin.value = false
      dataReady.value = false
      await router.push('/login')
    }
    loading.value = false
  })
})

function onUsernameDone() {
  localStorage.setItem(`name_confirmed_${user.value.uid}`, '1')
  router.push('/picks')
}

function onNameSaved() {
  showProfile.value = false
  editNameMode.value = false
}
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-court-950 text-zinc-100 font-sans antialiased">
    <!-- Global loading spinner -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <div class="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <template v-else>
      <!-- TEMPORARY debug overlay, ?debug=1 -->
      <pre v-if="debugMode" class="fixed top-0 left-0 z-[9999] bg-black text-emerald-300 text-[10px] p-2 max-h-[60vh] overflow-auto w-full">{{ JSON.stringify(debugInfo, null, 2) }}</pre>

      <!-- Persistent header (authenticated non-auth pages) -->
      <AppHeader v-if="showChrome" :user="user" @profile="openProfile(false)" />

      <!-- Profile modal (global) -->
      <ProfileModal
        v-if="showProfile && user"
        :user="user"
        :edit-name="editNameMode"
        @close="showProfile = false; editNameMode = false"
        @name-saved="onNameSaved"
      />

      <!-- Knockout-picks reminder dialog (global, shown once per page load) -->
      <KnockoutPromptModal
        v-if="showKnockoutDialog"
        @confirm="goToKnockoutPicks"
        @close="showKnockoutDialog = false"
      />

      <!-- Knockout-picks reminder banner — visible for the whole window
           between group-stage completion and Round of 32 kickoff, for
           anyone who hasn't filled out their bracket yet. -->
      <div
        v-if="needsKnockoutPicks && route.path !== '/bracket'"
        class="flex items-center gap-3 px-4 py-2.5 bg-emerald-500/15 border-b border-emerald-400/30"
      >
        <span class="text-sm leading-none shrink-0">🏆</span>
        <span class="text-xs font-bold text-emerald-300 flex-1 min-w-0 truncate">Make your knockout picks!</span>
        <button
          type="button"
          @click="router.push('/bracket')"
          class="shrink-0 text-[11px] font-black tracking-[0.08em] uppercase px-3 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white transition-colors"
        >Pick Now</button>
      </div>

      <!-- flex-1 so short pages still push the sticky tab bar to the
           viewport bottom instead of leaving it floating mid-page. -->
      <main class="flex-1" :style="{ paddingBottom: showChrome ? 'calc(6rem + env(safe-area-inset-bottom))' : 0 }">
        <RouterView v-slot="{ Component }">
          <component :is="Component" @done="onUsernameDone" />
        </RouterView>
      </main>

      <!-- Tab bar (sticky + negative margin, floats over scrollable content
           while staying in-flow so Safari renders it under the toolbar) -->
      <TabBar
        v-if="showChrome"
        :activeTab="activeTab"
        :showPicksTab="showPicksTab"
        :showBracketTab="showBracketTab"
        :showAdminTab="isAdmin"
        @navigate="onTabNavigate"
      />
    </template>
  </div>
</template>

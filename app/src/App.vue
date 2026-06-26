<script setup>
import { ref, computed, provide, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, setDoc, onSnapshot } from 'firebase/firestore'
import { auth, db } from './firebase.js'
import { configQueryOptions, pickQueryOptions, userQueryOptions, queryKeys } from './queries.js'
import AppHeader from './components/AppHeader.vue'
import TabBar from './components/TabBar.vue'
import ProfileModal from './components/ProfileModal.vue'

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

provide('user', user)
provide('picksLocked', picksLocked)
provide('picksLockTime', picksLockTime)
provide('hasSubmitted', hasSubmitted)
provide('isAdmin', isAdmin)

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
  if (route.path === '/leaderboard') return 'leaderboard'
  if (route.path === '/live') return 'live'
  return null
})

// showPicksTab: show Picks tab when picks not locked, or user has already submitted
const showPicksTab = computed(() => !picksLocked.value || hasSubmitted.value)

function onTabNavigate(tab) {
  router.push('/' + tab)
}

router.beforeEach((to) => {
  if (!dataReady.value) return
  // If picks are locked and user has no submission, redirect /picks to /leaderboard
  if (to.path === '/picks' && picksLocked.value && !hasSubmitted.value) return '/leaderboard'
})

watch(picksLocked, (locked) => {
  // If picks just locked and user is on /picks with no submission, send to leaderboard
  if (locked && !hasSubmitted.value && router.currentRoute.value.path === '/picks') {
    router.push('/leaderboard')
  }
})

// Keeps isAdmin (and the cached profile) live for the rest of the session.
// isAdmin is only ever granted out-of-band via the Admin SDK with no
// client-visible trigger, so a one-shot fetch would otherwise require a
// full reload to pick up a newly granted admin.
let profileUnsub = null

onMounted(async () => {
  // Config is public — fetch before auth so splash page shows lock time immediately
  queryClient.ensureQueryData(configQueryOptions()).then(data => {
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
        @navigate="onTabNavigate"
      />
    </template>
  </div>
</template>

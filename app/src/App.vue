<script setup>
import { ref, computed, provide, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase.js'
import AppHeader from './components/AppHeader.vue'
import TabBar from './components/TabBar.vue'
import ProfileModal from './components/ProfileModal.vue'

const router = useRouter()
const route = useRoute()
const loading = ref(true)
const user = ref(null)
const picksLockTime = ref(null)
const hasSubmitted = ref(false)
const dataReady = ref(false)
const showProfile = ref(false)
const editNameMode = ref(false)

const picksLocked = computed(() => {
  if (!picksLockTime.value) return false
  const lockMs = picksLockTime.value?.toDate?.().getTime() ?? picksLockTime.value
  return Date.now() >= lockMs
})

provide('user', user)
provide('picksLocked', picksLocked)
provide('picksLockTime', picksLockTime)
provide('hasSubmitted', hasSubmitted)

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

onMounted(async () => {
  // Config is public — fetch before auth so splash page shows lock time immediately
  getDoc(doc(db, 'config', 'public')).then(snap => {
    if (snap.exists()) picksLockTime.value = snap.data().picksLockAt ?? null
  }).catch(() => {})

  onAuthStateChanged(auth, async (u) => {
    if (u) {
      loading.value = true
      dataReady.value = false
    }
    user.value = u
    if (u) {
      // Firestore read is best-effort — a permissions error must never skip the username flow
      let pickExists = false
      try {
        const snap = await getDoc(doc(db, 'picks', u.uid))
        pickExists = snap.exists()
      } catch {
        // picks/ not yet accessible — treat as no pick
      }
      try {
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
    } else {
      hasSubmitted.value = false
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
  <div class="h-full flex flex-col bg-court-950 text-zinc-100 font-sans antialiased overflow-hidden">
    <!-- Global loading spinner -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <div class="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <template v-else>
      <!-- Persistent header (authenticated non-auth pages) -->
      <AppHeader v-if="showChrome" :user="user" @profile="showProfile = true" />

      <!-- Profile modal (uses position:fixed internally, unaffected by layout) -->
      <ProfileModal
        v-if="showProfile && user"
        :user="user"
        :edit-name="editNameMode"
        @close="showProfile = false; editNameMode = false"
        @name-saved="onNameSaved"
      />

      <!-- Scrollable content area -->
      <main id="main-scroll" class="flex-1 overflow-y-auto" style="-webkit-overflow-scrolling: touch">
        <RouterView v-slot="{ Component }">
          <component :is="Component" @done="onUsernameDone" />
        </RouterView>
      </main>

      <!-- Tab bar -->
      <TabBar
        v-if="showChrome"
        :activeTab="activeTab"
        :showPicksTab="showPicksTab"
        @navigate="onTabNavigate"
      />
    </template>
  </div>
</template>

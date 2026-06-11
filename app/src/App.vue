<script setup>
import { ref, computed, onMounted } from 'vue'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase.js'
import LoginView from './views/LoginView.vue'
import SetUsernameView from './views/SetUsernameView.vue'
import PicksView from './views/PicksView.vue'
import DashboardView from './views/DashboardView.vue'

const loading = ref(true)
const user = ref(null)
const view = ref('picks')
const picksLockTime = ref(null)

const picksLocked = computed(() => {
  if (!picksLockTime.value) return false
  const lockMs = picksLockTime.value?.toDate?.().getTime() ?? picksLockTime.value
  return Date.now() >= lockMs
})

onMounted(async () => {
  // Config is public — fetch before auth so splash page shows lock time immediately
  getDoc(doc(db, 'config', 'public')).then(snap => {
    if (snap.exists()) picksLockTime.value = snap.data().picksLockAt ?? null
  }).catch(() => {})

  onAuthStateChanged(auth, async (u) => {
    user.value = u
    if (u && u.displayName) {
      try {
        const snap = await getDoc(doc(db, 'submissions', u.uid))
        view.value = snap.exists() ? 'dashboard' : 'picks'
      } catch {
        view.value = 'picks'
      }
    }
    loading.value = false
  })
})
</script>

<template>
  <div class="min-h-screen bg-court-950 text-zinc-100 font-sans antialiased">
    <div v-if="loading" class="flex items-center justify-center min-h-screen">
      <div class="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
    </div>
    <template v-else>
      <LoginView v-if="!user" :picksLockTime="picksLockTime" />
      <SetUsernameView v-else-if="!user.displayName" :user="user" @done="view = 'picks'" />
      <PicksView
        v-else-if="view === 'picks'"
        :user="user"
        :picksLocked="picksLocked"
        :picksLockTime="picksLockTime"
        @submitted="view = 'dashboard'"
      />
      <DashboardView
        v-else
        :user="user"
        :picksLocked="picksLocked"
        @edit-picks="view = 'picks'"
      />
    </template>
  </div>
</template>

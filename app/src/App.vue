<script setup>
import { ref, onMounted } from 'vue'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase.js'
import LoginView from './views/LoginView.vue'
import PicksView from './views/PicksView.vue'
import DashboardView from './views/DashboardView.vue'

const loading = ref(true)
const user = ref(null)
const view = ref('picks')

onMounted(() => {
  onAuthStateChanged(auth, async (u) => {
    user.value = u
    if (u) {
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
  <div class="min-h-screen bg-court-950 text-slate-100 font-sans antialiased">
    <div v-if="loading" class="flex items-center justify-center min-h-screen">
      <div class="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"></div>
    </div>
    <template v-else>
      <LoginView v-if="!user" />
      <PicksView
        v-else-if="view === 'picks'"
        :user="user"
        @submitted="view = 'dashboard'"
      />
      <DashboardView
        v-else
        :user="user"
        @edit-picks="view = 'picks'"
      />
    </template>
  </div>
</template>

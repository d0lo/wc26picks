<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase.js'
import LiveScoreboard from '../components/LiveScoreboard.vue'

const events = ref([])
const hasMatches = ref(null)
let unsubscribe = null

onMounted(() => {
  unsubscribe = onSnapshot(doc(db, 'liveData/scoreboard'), (snap) => {
    const data = snap.data()
    events.value = data?.events ?? []
    hasMatches.value = data?.hasMatches ?? null
  })
})

onUnmounted(() => unsubscribe?.())
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 pt-8 pb-8">
    <div v-if="hasMatches === false" class="text-center pt-8">
      <div class="text-4xl mb-4">⚡</div>
      <h1 class="text-xl font-black text-white mb-2">Live Results</h1>
      <p class="text-sm text-zinc-400">No matches today. Check back during the next match window.</p>
    </div>
    <LiveScoreboard v-else :events="events" />
  </div>
</template>

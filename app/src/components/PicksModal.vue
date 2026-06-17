<script setup>
import { ref, onMounted } from 'vue'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import PicksSummary from './PicksSummary.vue'

const props = defineProps({
  uid: String,
  name: String,
  photoURL: String,
})
const emit = defineEmits(['close'])

const data = ref(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const snap = await getDoc(doc(db, 'picks', props.uid))
    if (snap.exists()) {
      data.value = snap.data()
    }
  } catch {
    // Firestore unavailable — show no picks state
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="fixed inset-0 z-[100] flex items-end">
    <!-- Glass backdrop lives on an absolute child, not the fixed element
         itself — Safari samples background/backdrop-filter set directly on
         position:fixed elements at the viewport edge to tint its own
         translucent toolbar. Same fix as AppHeader (see 80e673a). -->
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')"></div>

    <div
      class="relative w-full overflow-y-auto rounded-t-3xl bg-court-900 border-t border-court-700"
      style="max-height: calc(90dvh - env(safe-area-inset-top)); padding-bottom: env(safe-area-inset-bottom)"
    >

      <!-- Sheet header -->
      <div class="sticky top-0 z-10 bg-court-900 border-b border-court-700 px-4 py-4 flex items-center gap-3">
        <!-- Avatar -->
        <div class="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-court-700">
          <img
            v-if="photoURL"
            :src="photoURL"
            class="w-full h-full object-cover"
            referrerpolicy="no-referrer"
          />
          <span v-else class="text-sm font-bold text-white">{{ name?.[0] ?? '?' }}</span>
        </div>
        <!-- Name -->
        <span class="flex-1 text-sm font-bold text-white truncate">{{ name }}</span>
        <!-- Close -->
        <button
          type="button"
          @click="emit('close')"
          class="text-zinc-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <svg class="w-5 h-5" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="px-4 py-5">
        <!-- Loading -->
        <div v-if="loading" class="flex justify-center py-16">
          <div class="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
        </div>

        <!-- No picks -->
        <div v-else-if="!data" class="py-16 text-center">
          <div class="text-4xl mb-3">📋</div>
          <div class="text-sm font-bold text-white mb-1">No picks submitted</div>
          <div class="text-xs text-zinc-400">This user hasn't made their picks yet.</div>
        </div>

        <!-- Picks summary -->
        <PicksSummary
          v-else
          :groups="data.groups"
          :wildcards="data.wildcards"
          :props="data.props"
        />
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
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

// Starts false so the sheet paints off-screen, then flips true a frame
// later to trigger the CSS transition into view (a smooth slide-up
// instead of an instant pop-in).
const open = ref(false)
const closing = ref(false)

// True modal behaviour — the page behind can't scroll while this is open,
// which also stops the sheet's own scroll from rubber-banding into it.
// Locking via <html>'s overflow (not body's position) so body never moves
// and keeps the safe-area padding override in style.css intact — that
// override only holds while body stays the document's actual scroll root.
function lockBodyScroll() {
  document.documentElement.style.overflow = 'hidden'
}
function unlockBodyScroll() {
  document.documentElement.style.overflow = ''
}

onMounted(async () => {
  lockBodyScroll()
  requestAnimationFrame(() => { open.value = true })
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

onUnmounted(() => {
  unlockBodyScroll()
})

// Play the close transition before telling the parent to unmount us —
// the parent's v-if would otherwise tear us down instantly.
function requestClose() {
  if (closing.value) return
  closing.value = true
  open.value = false
  setTimeout(() => emit('close'), 300)
}
</script>

<template>
  <div class="fixed inset-0 z-[100]">
    <!-- Glass backdrop lives on an absolute child, not the fixed element
         itself — Safari samples background/backdrop-filter set directly on
         position:fixed elements at the viewport edge to tint its own
         translucent toolbar. Same fix as AppHeader (see 80e673a). -->
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
      :class="open ? 'opacity-100' : 'opacity-0'"
      @click="requestClose"
    ></div>

    <div
      class="fixed bottom-0 left-0 right-0 overflow-y-auto overscroll-contain rounded-t-3xl bg-court-900 border-t border-court-700 transition-transform duration-300"
      :class="open ? 'translate-y-0' : 'translate-y-full'"
      :style="{
        maxHeight: 'calc(90dvh - env(safe-area-inset-top))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
      }"
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
          @click="requestClose"
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

      <!-- Fades the cut edge of scrollable content into the sheet's own
           background, so a mid-list cutoff reads as "scroll for more"
           instead of a flat dead zone at the bottom. -->
      <div class="pointer-events-none sticky bottom-0 inset-x-0 h-10 bg-gradient-to-t from-court-900 to-transparent"></div>

    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  activeTab: String,   // 'picks' | 'leaderboard' | 'live'
  showPicksTab: Boolean,
})
const emit = defineEmits(['navigate'])

const tabs = [
  { id: 'picks', label: 'Picks' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'live', label: 'Live' },
]

const visibleTabs = computed(() => tabs.filter(t => t.id !== 'picks' || props.showPicksTab))
const activeIndex = computed(() => Math.max(0, visibleTabs.value.findIndex(t => t.id === props.activeTab)))

const bouncingTab = ref(null)
function onTap(id) {
  bouncingTab.value = id
  emit('navigate', id)
}
</script>

<template>
  <nav class="fixed inset-x-0 bottom-0 z-50 px-4" style="padding-bottom: max(1rem, calc(0.75rem + env(safe-area-inset-bottom)))">
    <div
      class="relative flex items-stretch h-16 mx-auto max-w-[10rem] rounded-full bg-court-900/25 backdrop-blur-3xl backdrop-saturate-150 border border-white/15 shadow-2xl shadow-black/50 px-1.5"
    >
      <!-- Sliding active pill -->
      <div
        class="absolute top-1.5 bottom-1.5 rounded-full bg-white/10 border border-white/10 transition-[left] duration-300"
        style="transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1)"
        :style="{ width: `calc(${100 / visibleTabs.length}% - 6px)`, left: `calc(${activeIndex * (100 / visibleTabs.length)}% + 3px)` }"
      ></div>

      <button
        v-for="tab in visibleTabs"
        :key="tab.id"
        type="button"
        @click="onTap(tab.id)"
        class="relative z-10 flex-1 flex items-center justify-center active:scale-90 transition-transform"
        :class="activeTab === tab.id ? 'text-emerald-400' : 'text-zinc-500'"
        :aria-current="activeTab === tab.id ? 'page' : undefined"
        :aria-label="tab.label"
      >
        <span
          class="flex items-center justify-center transition-colors"
          :class="{ 'tab-bounce': bouncingTab === tab.id }"
          @animationend="bouncingTab = null"
        >
          <!-- Picks icon (clipboard) -->
          <svg v-if="tab.id === 'picks'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1z"/>
            <rect x="4" y="4" width="16" height="17" rx="2"/>
            <path d="M9 10h6M9 14h4"/>
          </svg>

          <!-- Leaderboard icon (home) -->
          <svg v-else-if="tab.id === 'leaderboard'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 11l9-8 9 8"/>
            <path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10"/>
            <path d="M9 21v-6h6v6"/>
          </svg>

          <!-- Live icon (stadium) -->
          <svg v-else-if="tab.id === 'live'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <ellipse cx="12" cy="12" rx="9" ry="6"/>
            <rect x="6" y="9" width="12" height="6" rx="2"/>
          </svg>
        </span>
      </button>
    </div>
  </nav>
</template>

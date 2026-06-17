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
      class="relative flex items-stretch h-16 mx-auto max-w-xs rounded-full bg-court-900/55 backdrop-blur-2xl backdrop-saturate-150 border border-white/10 shadow-2xl shadow-black/50 px-1.5"
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
        class="relative z-10 flex-1 flex flex-col items-center justify-center gap-0.5 active:scale-90 transition-transform"
        :class="activeTab === tab.id ? 'text-emerald-400' : 'text-zinc-500'"
        :aria-current="activeTab === tab.id ? 'page' : undefined"
      >
        <span
          class="flex flex-col items-center gap-0.5 transition-colors"
          :class="{ 'tab-bounce': bouncingTab === tab.id }"
          @animationend="bouncingTab = null"
        >
          <!-- Picks icon (clipboard) -->
          <svg v-if="tab.id === 'picks'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1z"/>
            <rect x="4" y="4" width="16" height="17" rx="2"/>
            <path d="M9 10h6M9 14h4"/>
          </svg>

          <!-- Leaderboard icon (trophy) -->
          <svg v-else-if="tab.id === 'leaderboard'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M6 2h12v8a6 6 0 0 1-12 0V2z"/>
            <path d="M6 5H3a2 2 0 0 0 0 4h3"/>
            <path d="M18 5h3a2 2 0 0 1 0 4h-3"/>
            <path d="M12 16v4"/>
            <path d="M8 20h8"/>
          </svg>

          <!-- Live icon (lightning bolt) -->
          <svg v-else-if="tab.id === 'live'" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M13 2L4.5 13H12L11 22L19.5 11H12L13 2z"
              :fill="activeTab === 'live' ? 'currentColor' : 'none'"
              :stroke="activeTab === 'live' ? 'none' : 'currentColor'"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>

          <span class="text-[10px] font-semibold leading-none">{{ tab.label }}</span>
        </span>
      </button>
    </div>
  </nav>
</template>

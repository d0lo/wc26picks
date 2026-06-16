<script setup>
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

function visibleTabs() {
  return tabs.filter(t => t.id !== 'picks' || props.showPicksTab)
}
</script>

<template>
  <nav
    class="shrink-0 z-50 bg-court-900/80 backdrop-blur-xl border-t border-white/5"
    style="padding-bottom: max(0.5rem, env(safe-area-inset-bottom))"
  >
    <div class="flex items-stretch h-14">
      <button
        v-for="tab in visibleTabs()"
        :key="tab.id"
        type="button"
        @click="emit('navigate', tab.id)"
        class="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
        :class="activeTab === tab.id ? 'text-emerald-400' : 'text-zinc-500'"
        :aria-current="activeTab === tab.id ? 'page' : undefined"
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
      </button>
    </div>
  </nav>
</template>

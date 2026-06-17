<script setup>
defineProps({ user: Object })
defineEmits(['profile'])
</script>

<template>
  <header
    class="sticky top-0 z-50 px-4"
    style="padding-top: max(1rem, calc(1rem + env(safe-area-inset-top))); padding-bottom: 1rem;"
  >
    <!-- Glass backdrop lives on an absolute child, not the sticky element
         itself — Safari samples background/backdrop-filter set directly on
         position:fixed/sticky elements at the viewport edge to tint its own
         translucent toolbar. Same fix as TabBar's pill (see 80e673a). -->
    <div class="absolute inset-0 border-b border-court-700 bg-court-950/95 backdrop-blur-md"></div>

    <div class="relative z-10 flex items-center justify-between">
      <!-- Logo -->
      <span class="text-lg font-black tracking-tight">
        <span class="text-emerald-400">WC26</span>
        <span class="text-white"> Picks</span>
      </span>

      <!-- Avatar button -->
      <button
        type="button"
        @click="$emit('profile')"
        class="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
        aria-label="Open profile"
      >
        <img
          v-if="user?.photoURL"
          :src="user.photoURL"
          class="w-full h-full object-cover"
          referrerpolicy="no-referrer"
        />
        <div
          v-else
          class="w-full h-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm font-bold"
        >
          {{ user?.displayName?.[0] ?? '?' }}
        </div>
      </button>
    </div>
  </header>
</template>

<script setup>
defineProps({ user: Object })
defineEmits(['profile'])
</script>

<template>
  <header
    class="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 border-b border-court-700 bg-court-950/95 backdrop-blur-md"
    style="padding-top: max(1rem, calc(1rem + env(safe-area-inset-top))); padding-bottom: 1rem;"
  >
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
  </header>
</template>

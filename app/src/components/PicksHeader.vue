<script setup>
import { ref } from 'vue'

defineProps({ user: Object, locked: Boolean })
defineEmits(['profile'])

const headerEl = ref(null)
defineExpose({ headerEl })
</script>

<template>
  <header ref="headerEl" class="fixed top-0 left-0 right-0 z-50 flex items-center justify-between py-4 border-b border-court-700 bg-court-950/95 backdrop-blur-md px-4" style="padding-top: max(1rem, calc(1rem + env(safe-area-inset-top)))">
    <button type="button" @click="$emit('profile')" class="flex items-center gap-3 text-left">
      <img
        v-if="user.photoURL"
        :src="user.photoURL"
        class="w-8 h-8 rounded-full ring-1 ring-court-600"
        referrerpolicy="no-referrer"
      />
      <div v-else class="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm font-bold">
        {{ user.displayName?.[0] }}
      </div>
      <div>
        <div class="text-[10px] text-zinc-400">Signed in as</div>
        <div class="text-sm font-bold text-white leading-tight">{{ user.displayName }}</div>
      </div>
    </button>
    <div v-if="locked" class="flex items-center gap-1.5 text-zinc-400 shrink-0">
      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <span class="text-[10px] font-black tracking-[0.15em] uppercase">Locked</span>
    </div>
  </header>
</template>

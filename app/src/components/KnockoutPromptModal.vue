<script setup>
const emit = defineEmits(['confirm', 'close'])
</script>

<template>
  <div class="fixed inset-0 z-[200] flex items-center justify-center p-4" @mousedown.self="emit('close')">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')"></div>

    <div class="relative w-full max-w-xs mx-auto bg-court-800 border border-court-700 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
      <div class="px-5 py-5 text-center">
        <div class="text-2xl mb-2">🏆</div>
        <h2 class="text-sm font-black tracking-[0.05em] text-white uppercase mb-1.5">Make Your Knockout Picks!</h2>
        <p class="text-xs text-zinc-400">
          The group stage is done — fill out your bracket before the Round of 32 kicks off.
        </p>
      </div>
      <div class="p-4 pt-0 space-y-2">
        <button
          type="button"
          @click="emit('confirm')"
          class="w-full py-3 rounded-xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-white transition-colors"
        >Pick Now</button>
        <button
          type="button"
          @click="emit('close')"
          class="w-full text-xs text-zinc-500 hover:text-zinc-400 transition-colors py-1"
        >I'll do it later</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({ points: { type: Number, default: null } })
</script>

<template>
  <div v-if="points != null" class="text-[10px] font-black text-amber-400/60 bg-amber-400/5 border border-amber-400/10 rounded-full px-2 py-0.5 font-mono leading-5">
    {{ points }}pt{{ points !== 1 ? 's' : '' }}
  </div>
</template>

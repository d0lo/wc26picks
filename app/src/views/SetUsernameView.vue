<script setup>
import { ref } from 'vue'
import { updateProfile } from 'firebase/auth'
import { auth } from '../firebase.js'

const props = defineProps({ user: Object })
const emit = defineEmits(['done'])

const username = ref('')
const saving = ref(false)
const error = ref('')

async function save() {
  const name = username.value.trim()
  if (!name) return
  saving.value = true
  error.value = ''
  try {
    await updateProfile(props.user, { displayName: name })
    emit('done')
  } catch {
    error.value = 'Could not save username. Please try again.'
    saving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,#0d2040,transparent)]"></div>
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_110%,#0a1a30,transparent)]"></div>
    <div
      class="absolute inset-0 opacity-[0.025]"
      style="background-image: linear-gradient(#38bdf8 1px, transparent 1px), linear-gradient(90deg, #38bdf8 1px, transparent 1px); background-size: 64px 64px;"
    ></div>

    <div class="relative z-10 flex flex-col items-center max-w-xs w-full text-center">
      <div class="relative mb-8 select-none">
        <div class="absolute inset-0 blur-3xl bg-amber-400/15 rounded-full scale-[2]"></div>
        <div class="relative text-7xl" style="filter: drop-shadow(0 0 48px rgba(251,191,36,0.45))">🏆</div>
      </div>

      <h2 class="text-2xl font-black tracking-tight text-white mb-1">One last thing</h2>
      <p class="text-sm text-slate-500 mb-8">Choose a username for the leaderboard.</p>

      <form @submit.prevent="save" class="w-full space-y-3">
        <input
          v-model="username"
          type="text"
          placeholder="Username"
          maxlength="30"
          required
          autofocus
          class="w-full bg-court-800 border border-court-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-400 transition-colors"
        />
        <button
          type="submit"
          :disabled="saving || !username.trim()"
          class="w-full py-3.5 rounded-xl font-bold text-sm bg-sky-500 hover:bg-sky-400 text-white transition-all duration-100 active:scale-[0.98] disabled:opacity-60 shadow-lg shadow-sky-500/20"
        >
          <span v-if="saving" class="flex items-center justify-center gap-2">
            <svg class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4" class="opacity-30"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
            </svg>
            Saving…
          </span>
          <span v-else>Let's go</span>
        </button>
      </form>

      <p v-if="error" class="mt-4 text-red-400 text-xs">{{ error }}</p>
    </div>
  </div>
</template>

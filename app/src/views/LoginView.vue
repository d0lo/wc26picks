<script setup>
import { ref } from 'vue'
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase.js'

const props = defineProps({ picksLockTime: Object })

const splashes = [
  // Minecraft-style
  "Also try Terraria!",
  "Notch approved!",
  "It's a feature, not a bug!",
  "Creeper? Aw man!",
  "Made from recycled pixels!",
  "Punch trees to win!",
  "Diamonds!",
  "Now with achievements!",
  "The chicken is a lie!",
  "Don't touch the cactus!",
  "Needs more cowbell!",
  "Explodes on contact!",
  "This text is yellow!",
  "Play responsibly!",
  "Getting over it!",
  "Open source!",
  "That's no moon!",
  "420% more fun!",
  "Seecret update!",
  "The end is never the end!",
  // Soccer / WC26
  "It's coming home!",
  "Not a handball!",
  "VAR checked!",
  "Offside by a toe!",
  "On the woodwork!",
  "He meant that!",
  "Group of death!",
  "Dark horse incoming!",
  "Penalty shootout!",
  "Extra time!",
  "Bicycle kick certified!",
  "Clean sheet guaranteed!",
  "Based on vibes!",
  "Trust the process!",
  "Gut feeling only!",
  "Your picks, your fault!",
  "Scientifically accurate!",
  "No refunds!",
  "Totally not biased!",
  "Predictions may vary!",
  "Pick Brazil!",
  "Argentina again?",
  "Germany to disappoint!",
  "England to choke!",
  "Made with passion!",
  "Stats are for nerds!",
  "Now with more drama!",
  "Cinderella story!",
  "Ref was bribed!",
  "120 minutes of agony!",
  "Own goal incoming!",
  "Beautiful game!",
  "Messi who?",
  "Where's Ronaldo?",
  "Spain always wins!",
  "France has depth!",
  "Brazil in 90!",
  "Morocco rising!",
  "USA host advantage!",
  "Canada's year!",
  "Mexico past the group!",
  "Japan to shock everyone!",
  "Saudi Arabia lol!",
  "Australia, and why not!",
  "6-2 in the group stage!",
  "0-0 thriller!",
  "Hat trick incoming!",
  "Free kick top bins!",
  "Worldie incoming!",
  "Keeper was rooted!",
  "Unbelievable, Jeff!",
  "Never in doubt!",
  "Absolute scenes!",
  "That's a red card!",
  "Check the monitor!",
  "10 minutes of stoppage!",
  "Nil-nil at the break!",
  "We go again!",
  "Park the bus!",
  "Tiki-taka!",
  "High press activated!",
  "Gegenpressing!",
  "False nine spotted!",
  "He'll be gutted!",
  "It's a sitter!",
  "Squandered!",
  "Football is pain!",
  "Worth the wait!",
  "Only one winner now!",
  "What a time to be alive!",
  "Counter attack!",
  "Set piece merchant!",
  "Route one football!",
  "Into the mixer!",
  "Overlap! Overlap!",
  "Commentator bingo!",
  "Ghana comeback!",
  "Keeper has it!",
  "He's only gone and done it!",
  "Catch me outside!",
  "Tactical foul!",
  "Wall not jumping!",
  "It just went flat!",
  "Aggregate score drama!",
  "Golden boot race!",
  "Last 16 upset!",
]
const splash = splashes[Math.floor(Math.random() * splashes.length)]

function fmtLockTime(ts) {
  if (!ts) return null
  const d = ts?.toDate?.() ?? new Date(ts)
  const time = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  const isToday = new Date().toDateString() === d.toDateString()
  if (isToday) return `at ${time}`
  const date = d.toLocaleString('en-US', { month: 'short', day: 'numeric' })
  return `on ${date} at ${time}`
}

const signing = ref(false)
const error = ref('')
const email = ref('')
const password = ref('')


async function googleSignIn() {
  signing.value = true
  error.value = ''
  try {
    await signInWithPopup(auth, googleProvider)
  } catch {
    error.value = 'Sign-in failed. Please try again.'
    signing.value = false
  }
}

async function emailSubmit() {
  if (!email.value || !password.value) return
  signing.value = true
  error.value = ''
  try {
    await signInWithEmailAndPassword(auth, email.value, password.value)
  } catch (e) {
    if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
      try {
        await createUserWithEmailAndPassword(auth, email.value, password.value)
      } catch (e2) {
        const msg = {
          'auth/email-already-in-use': 'Wrong password.',
          'auth/weak-password':        'Password must be at least 6 characters.',
          'auth/invalid-email':        'Invalid email address.',
        }
        error.value = msg[e2.code] ?? 'Something went wrong. Try again.'
        signing.value = false
      }
    } else {
      const msg = {
        'auth/wrong-password':     'Wrong password.',
        'auth/invalid-credential': 'Wrong email or password.',
        'auth/invalid-email':      'Invalid email address.',
      }
      error.value = msg[e.code] ?? 'Something went wrong. Try again.'
      signing.value = false
    }
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,#0d2918,transparent)]"></div>
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_110%,#0a1f12,transparent)]"></div>
    <div
      class="absolute inset-0 opacity-[0.025]"
      style="background-image: linear-gradient(#4ade80 1px, transparent 1px), linear-gradient(90deg, #4ade80 1px, transparent 1px); background-size: 64px 64px;"
    ></div>

    <div class="relative z-10 flex flex-col items-center max-w-xs w-full text-center">
      <!-- Trophy -->
      <div class="relative mb-8 select-none">
        <div class="absolute inset-0 blur-3xl bg-amber-400/15 rounded-full scale-[2]"></div>
        <div class="relative text-7xl" style="filter: drop-shadow(0 0 48px rgba(251,191,36,0.45))">🏆</div>
      </div>

      <!-- Wordmark -->
      <div class="mb-2 relative">
        <h1 class="text-5xl font-black tracking-tighter text-white leading-none">WORLD CUP</h1>
        <div class="text-[2.5rem] font-black tracking-[0.12em] text-amber-400 leading-none mt-1">2026</div>
        <span
          class="mc-version absolute text-[11px] font-black text-yellow-300 select-none pointer-events-none text-right leading-tight"
          style="font-family: 'Courier New', Courier, monospace; bottom: 50%; right: 0; max-width: 160px; transform: rotate(-20deg); transform-origin: right center; text-shadow: 1px 1px 0 #7c5000, -1px -1px 0 #7c5000, 1px -1px 0 #7c5000, -1px 1px 0 #7c5000;"
        >{{ splash }}</span>
        <div class="text-[11px] font-bold tracking-[0.35em] text-zinc-400 uppercase mt-2">Predictor</div>
      </div>

      <div class="my-8 w-24 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent"></div>

      <form @submit.prevent="emailSubmit" class="w-full space-y-2 mb-3">
        <input
          v-model="email"
          type="email"
          placeholder="Email"
          required
          class="w-full bg-court-800 border border-court-600 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-400 transition-colors"
        />
        <input
          v-model="password"
          type="password"
          placeholder="Password"
          required
          class="w-full bg-court-800 border border-court-600 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-400 transition-colors"
        />
        <button
          type="submit"
          :disabled="signing"
          class="w-full py-3.5 rounded-xl font-bold text-sm transition-all duration-100 active:scale-[0.98] disabled:opacity-60 bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20"
        >
          <span v-if="signing" class="flex items-center justify-center gap-2">
            <svg class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4" class="opacity-30"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
            </svg>
            Signing in…
          </span>
          <span v-else>Continue</span>
        </button>
      </form>

      <div class="w-full flex items-center gap-3 mb-4">
        <div class="flex-1 h-px bg-court-700"></div>
        <span class="text-[11px] text-zinc-400 font-medium">or</span>
        <div class="flex-1 h-px bg-court-700"></div>
      </div>

      <button
        @click="googleSignIn"
        :disabled="signing"
        class="w-full flex items-center justify-center gap-3 bg-white text-zinc-900 font-semibold py-3.5 px-6 rounded-xl text-sm transition-all duration-100 active:scale-[0.98] disabled:opacity-60 shadow-2xl shadow-black/60 hover:bg-zinc-50"
      >
        <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18"/>
          <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17"/>
          <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z"/>
          <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.31"/>
        </svg>
        Continue with Google
      </button>

      <p v-if="error" class="mt-4 text-red-400 text-xs">{{ error }}</p>

      <p class="mt-6 text-zinc-400 text-xs leading-relaxed">
        <span class="text-zinc-400">{{ picksLockTime ? `Picks lock ${fmtLockTime(picksLockTime)}` : '—' }}</span>
      </p>
    </div>
    <div class="absolute bottom-6 left-0 right-0 text-center">
      <span class="text-[10px] text-zinc-600 font-mono">v1.2.1</span>
    </div>
  </div>
</template>

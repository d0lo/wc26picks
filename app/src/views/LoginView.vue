<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
const appVersion = __APP_VERSION__

import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
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
function randomSplash(current) {
  if (Math.random() < 0.2 && current !== 'DYKB?') return 'DYKB?'
  const pool = splashes.filter(s => s !== current)
  return pool[Math.floor(Math.random() * pool.length)]
}
const splash = ref(randomSplash())
const wordmarkRef = ref(null)
const ballTotalDeg = ref(0)
const ballDuration = ref('0ms')
let ballSpinTimer = null
function spinBall() {
  clearTimeout(ballSpinTimer)
  const ms = 700 + Math.floor(Math.random() * 301)
  const deg = 720 + Math.floor(Math.random() * 721)
  ballDuration.value = `${ms}ms`
  ballTotalDeg.value += deg
  ballSpinTimer = setTimeout(() => { ballDuration.value = '0ms' }, ms)
}
const splashMaxWidth = ref('160px')

function updateSplashWidth() {
  if (!wordmarkRef.value) return
  const rect = wordmarkRef.value.getBoundingClientRect()
  // span center x = rect.right + 30 (right edge of span, since right:-30px places right edge 30px past wordmark)
  // but center is rect.right + 30 - splashMaxWidth/2 — approximate with rect.right + 30 as anchor
  const distToScreenRight = window.innerWidth - (rect.right + 30)
  splashMaxWidth.value = `${Math.max(40, distToScreenRight * 2 - 20)}px`
}

onMounted(() => {
  updateSplashWidth()
  window.addEventListener('resize', updateSplashWidth)
})
onUnmounted(() => window.removeEventListener('resize', updateSplashWidth))

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

const forgotMode = ref(false)
const resetSent = ref(false)
const resetError = ref('')
const resetEmail = ref('')

function openForgot() {
  resetEmail.value = email.value
  resetSent.value = false
  resetError.value = ''
  forgotMode.value = true
}

function closeForgot() {
  forgotMode.value = false
  resetSent.value = false
  resetError.value = ''
}

async function sendReset() {
  if (!resetEmail.value) return
  signing.value = true
  resetError.value = ''
  try {
    const methods = await fetchSignInMethodsForEmail(auth, resetEmail.value)
    if (methods.length === 0) {
      resetError.value = 'No account found with that email.'
      return
    }
    if (!methods.includes('password')) {
      resetError.value = 'This account uses Google Sign-in. Use the "Continue with Google" button instead.'
      return
    }
    await sendPasswordResetEmail(auth, resetEmail.value)
    resetSent.value = true
  } catch (e) {
    const msg = {
      'auth/invalid-email': 'Invalid email address.',
    }
    resetError.value = msg[e.code] ?? 'Something went wrong. Try again.'
  } finally {
    signing.value = false
  }
}


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
  <div class="h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,#0d2918,transparent)]"></div>
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_110%,#0a1f12,transparent)]"></div>
    <div
      class="absolute inset-0 opacity-[0.025]"
      style="background-image: linear-gradient(#4ade80 1px, transparent 1px), linear-gradient(90deg, #4ade80 1px, transparent 1px); background-size: 64px 64px;"
    ></div>

    <div class="relative z-10 flex flex-col items-center max-w-xs w-full text-center py-6">
      <!-- Trophy -->
      <div class="relative mb-4 select-none">
        <div class="absolute inset-0 blur-3xl bg-amber-400/15 rounded-full scale-[2]"></div>
        <div class="absolute inset-x-0 top-0 flex justify-center text-[2.25rem] leading-none select-none pointer-events-none -translate-y-1/2" style="z-index:1" :style="{ transform: `translateY(-50%) rotate(${ballTotalDeg}deg)`, transition: `transform ${ballDuration} cubic-bezier(0.22, 1, 0.36, 1)` }">⚽</div>
        <div class="relative text-7xl pointer-events-none" style="filter: drop-shadow(0 0 48px rgba(251,191,36,0.45)); z-index:2">🏆</div>
        <div class="absolute inset-x-0 top-0 flex justify-center -translate-y-1/2" style="z-index:3; cursor:pointer" @click="spinBall"><div style="width:2.25rem; height:2.25rem"></div></div>
      </div>

      <!-- Wordmark -->
      <div ref="wordmarkRef" class="mb-2 relative">
        <h1 class="text-5xl font-black tracking-tighter leading-none">
          <span class="text-white">WC</span><span class="text-amber-400"> 2026</span>
        </h1>
        <div
          class="absolute"
          style="top: 50%; left: 88%; transform: translate(-50%, -50%); cursor: pointer;"
          @click="splash = randomSplash(splash)"
        >
          <span
            class="splash-text text-[13px] font-black text-yellow-300 select-none text-left leading-tight whitespace-nowrap"
            :style="{ fontFamily: '\'Courier New\', Courier, monospace', textShadow: '1px 1px 0 #7c5000, -1px -1px 0 #7c5000, 1px -1px 0 #7c5000, -1px 1px 0 #7c5000' }"
          >{{ splash }}</span>
        </div>
        <div class="text-[11px] font-bold tracking-[0.35em] text-zinc-400 uppercase mt-2">Predictor</div>
      </div>

      <div class="my-5 w-24 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent"></div>

      <!-- Forgot password panel -->
      <template v-if="forgotMode">
        <div class="w-full space-y-3">
          <template v-if="resetSent">
            <div class="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-4 text-center space-y-1">
              <p class="text-emerald-400 text-sm font-semibold">Check your inbox</p>
              <p class="text-zinc-400 text-xs">A reset link was sent to <span class="text-zinc-200">{{ resetEmail }}</span></p>
            </div>
          </template>
          <template v-else>
            <p class="text-zinc-400 text-xs text-left">Enter your email and we'll send you a link to reset your password.</p>
            <form @submit.prevent="sendReset" class="space-y-2">
              <input
                v-model="resetEmail"
                type="email"
                placeholder="Email"
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
                  Sending…
                </span>
                <span v-else>Send reset link</span>
              </button>
            </form>
            <p v-if="resetError" class="text-red-400 text-xs">{{ resetError }}</p>
          </template>
          <button @click="closeForgot" class="w-full text-xs text-zinc-400 hover:text-zinc-200 transition-colors py-1">← Back to sign in</button>
        </div>
      </template>

      <!-- Normal sign-in form -->
      <template v-else>
        <form @submit.prevent="emailSubmit" class="w-full space-y-2 mb-3">
          <input
            v-model="email"
            type="email"
            placeholder="Email"
            required
            class="w-full bg-court-800 border border-court-600 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-400 transition-colors"
          />
          <div class="relative">
            <input
              v-model="password"
              type="password"
              placeholder="Password"
              required
              class="w-full bg-court-800 border border-court-600 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-400 transition-colors"
            />
          </div>
          <div class="flex justify-end">
            <button type="button" @click="openForgot" class="text-[11px] text-zinc-400 hover:text-emerald-400 transition-colors">Forgot password?</button>
          </div>
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
      </template>

      <p class="mt-6 text-zinc-400 text-xs leading-relaxed">
        <span class="text-zinc-400">{{ picksLockTime ? `Picks lock ${fmtLockTime(picksLockTime)}` : '—' }}</span>
      </p>
    </div>
    <div class="text-center py-4">
      <span class="text-[10px] text-zinc-700 font-mono">v{{ appVersion }}</span>
    </div>
  </div>
</template>

<style scoped>
</style>

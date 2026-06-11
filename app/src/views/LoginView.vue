<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase.js'

const signing = ref(false)
const error = ref('')
const showPhone = ref(false)

const email = ref('')
const password = ref('')
const displayName = ref('')
const needsName = ref(false)

// Phone auth state
const phone = ref('')
const otp = ref('')
const otpSent = ref(false)
const confirmationResult = ref(null)
let recaptchaVerifier = null

onMounted(() => {
  recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' })
})

onUnmounted(() => {
  recaptchaVerifier?.clear()
})

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


async function sendOtp() {
  if (!phone.value) return
  signing.value = true
  error.value = ''
  try {
    confirmationResult.value = await signInWithPhoneNumber(auth, phone.value, recaptchaVerifier)
    otpSent.value = true
  } catch (e) {
    error.value = e.message ?? 'Failed to send code. Check the number and try again.'
    recaptchaVerifier?.clear()
    recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' })
  } finally {
    signing.value = false
  }
}

async function verifyOtp() {
  if (!otp.value) return
  signing.value = true
  error.value = ''
  try {
    await confirmationResult.value.confirm(otp.value)
  } catch {
    error.value = 'Invalid code. Please try again.'
    signing.value = false
  }
}

async function emailSubmit() {
  if (!email.value || !password.value) return
  if (needsName.value && !displayName.value) return
  signing.value = true
  error.value = ''
  try {
    if (needsName.value) {
      const cred = await createUserWithEmailAndPassword(auth, email.value, password.value)
      await updateProfile(cred.user, { displayName: displayName.value.trim() })
    } else {
      await signInWithEmailAndPassword(auth, email.value, password.value)
    }
  } catch (e) {
    if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
      needsName.value = true
      error.value = ''
    } else {
      const msg = {
        'auth/email-already-in-use': 'That email is already registered.',
        'auth/weak-password':        'Password must be at least 6 characters.',
        'auth/invalid-email':        'Invalid email address.',
        'auth/wrong-password':       'Wrong password.',
      }
      error.value = msg[e.code] ?? 'Something went wrong. Try again.'
    }
    signing.value = false
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
      <!-- Trophy -->
      <div class="relative mb-8 select-none">
        <div class="absolute inset-0 blur-3xl bg-amber-400/15 rounded-full scale-[2]"></div>
        <div class="relative text-7xl" style="filter: drop-shadow(0 0 48px rgba(251,191,36,0.45))">🏆</div>
      </div>

      <!-- Wordmark -->
      <div class="mb-2">
        <div class="text-[10px] font-black tracking-[0.5em] text-slate-600 uppercase mb-1">FIFA</div>
        <h1 class="text-5xl font-black tracking-tighter text-white leading-none">WORLD CUP</h1>
        <div class="text-[2.5rem] font-black tracking-[0.12em] text-amber-400 leading-none mt-1">2026</div>
        <div class="text-[11px] font-bold tracking-[0.35em] text-slate-500 uppercase mt-2">Predictor</div>
      </div>

      <div class="my-8 w-24 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent"></div>

      <!-- Phone flow -->
      <template v-if="showPhone">
        <form @submit.prevent="otpSent ? verifyOtp() : sendOtp()" class="w-full space-y-2 mb-3">
          <input
            v-if="!otpSent"
            v-model="phone"
            type="tel"
            placeholder="+1 (555) 000-0000"
            required
            class="w-full bg-court-800 border border-court-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-400 transition-colors"
          />
          <p v-if="!otpSent" class="text-[11px] text-slate-600">Include country code, e.g. +1 for US</p>
          <input
            v-if="otpSent"
            v-model="otp"
            type="text"
            inputmode="numeric"
            placeholder="Enter 6-digit code"
            maxlength="6"
            required
            class="w-full bg-court-800 border border-court-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-400 transition-colors tracking-[0.3em] text-center"
          />
          <p v-if="otpSent" class="text-[11px] text-slate-500">Code sent to {{ phone }}</p>
          <button type="submit" :disabled="signing"
            class="w-full py-3.5 rounded-xl font-bold text-sm bg-sky-500 hover:bg-sky-400 text-white transition-all active:scale-[0.98] disabled:opacity-60">
            <span v-if="signing">…</span>
            <span v-else-if="otpSent">Verify Code</span>
            <span v-else>Send Code</span>
          </button>
          <button v-if="otpSent" type="button" @click="otpSent = false; otp = ''"
            class="w-full text-xs text-slate-600 hover:text-slate-400 transition-colors py-1">
            ← Use a different number
          </button>
        </form>
        <button type="button" @click="showPhone = false; error = ''"
          class="text-xs text-slate-600 hover:text-slate-400 transition-colors mt-1">
          ← Back
        </button>
      </template>

      <!-- Email flow -->
      <template v-else>
        <form @submit.prevent="emailSubmit" class="w-full space-y-2 mb-3">
          <!-- Name field appears only when account doesn't exist -->
          <div v-if="needsName" class="text-left">
            <p class="text-xs text-sky-400 mb-2 font-medium">New here! Just need your name.</p>
            <input
              v-model="displayName"
              type="text"
              placeholder="Your name"
              required
              autofocus
              class="w-full bg-court-800 border border-court-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-400 transition-colors"
            />
          </div>
          <input
            v-model="email"
            type="email"
            placeholder="Email"
            required
            class="w-full bg-court-800 border border-court-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-400 transition-colors"
          />
          <input
            v-model="password"
            type="password"
            placeholder="Password"
            required
            class="w-full bg-court-800 border border-court-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-400 transition-colors"
          />
          <button
            type="submit"
            :disabled="signing"
            class="w-full py-3.5 rounded-xl font-bold text-sm transition-all duration-100 active:scale-[0.98] disabled:opacity-60 bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/20"
          >
            <span v-if="signing" class="flex items-center justify-center gap-2">
              <svg class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4" class="opacity-30"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
              </svg>
              Signing in…
            </span>
            <span v-else>{{ needsName ? 'Create Account' : 'Continue' }}</span>
          </button>
        </form>

        <div class="w-full flex items-center gap-3 mb-4">
          <div class="flex-1 h-px bg-court-700"></div>
          <span class="text-[11px] text-slate-700 font-medium">or</span>
          <div class="flex-1 h-px bg-court-700"></div>
        </div>

        <!-- Google button -->
        <button
          @click="googleSignIn"
          :disabled="signing"
          class="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-semibold py-3.5 px-6 rounded-xl text-sm transition-all duration-100 active:scale-[0.98] disabled:opacity-60 shadow-2xl shadow-black/60 hover:bg-slate-50"
        >
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18"/>
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17"/>
            <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z"/>
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.31"/>
          </svg>
          Continue with Google
        </button>


<button type="button" @click="showPhone = true; error = ''"
          class="mt-4 text-xs text-slate-600 hover:text-slate-400 transition-colors">
          Use phone number instead
        </button>
      </template>

      <div id="recaptcha-container"></div>
      <p v-if="error" class="mt-4 text-red-400 text-xs">{{ error }}</p>

      <p class="mt-6 text-slate-700 text-xs leading-relaxed">
        Picks close before the opening match<br>
        <span class="text-slate-600">Jun 11, 2026 · 11:59 PM</span>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { signOut, deleteUser, reauthenticateWithPopup, reauthenticateWithCredential, EmailAuthProvider, updateProfile } from 'firebase/auth'
import { doc, deleteDoc, updateDoc } from 'firebase/firestore'
import { auth, db, googleProvider } from '../firebase.js'

const props = defineProps({ user: Object, editName: Boolean })
const emit = defineEmits(['close', 'name-saved'])

const busy = ref(false)
const error = ref('')
const confirmingDelete = ref(false)
const reauthPassword = ref('')

const defaultDisplayName = computed(() => {
  const n = props.user.displayName ?? ''
  const parts = n.trim().split(/\s+/)
  return parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : n
})

const editingName = ref(props.editName)
const newName = ref(props.editName ? defaultDisplayName.value : '')

async function saveName() {
  const name = newName.value.trim()
  if (!name) return
  busy.value = true
  error.value = ''
  try {
    await updateProfile(props.user, { displayName: name })
    // Keep submission doc in sync so leaderboard reflects the new name
    const subRef = doc(db, 'submissions', props.user.uid)
    await updateDoc(subRef, { name }).catch(() => {})
    emit('name-saved')
    emit('close')
  } catch {
    error.value = 'Could not update name. Please try again.'
  }
  busy.value = false
}

async function logout() {
  busy.value = true
  await signOut(auth)
}


async function reauthAndDelete() {
  busy.value = true
  error.value = ''
  try {
    const providerId = props.user.providerData[0]?.providerId
    if (providerId === 'google.com') {
      await reauthenticateWithPopup(props.user, googleProvider)
    } else {
      const cred = EmailAuthProvider.credential(props.user.email, reauthPassword.value)
      await reauthenticateWithCredential(props.user, cred)
    }
    await deleteDoc(doc(db, 'submissions', props.user.uid))
    await deleteUser(props.user)
  } catch {
    error.value = 'Re-authentication failed. Please try again.'
    busy.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[200] flex items-center justify-center p-4" @mousedown.self="emit('close')">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')"></div>

    <div class="relative w-full max-w-xs mx-auto bg-court-800 border border-court-700 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
      <!-- Header -->
      <div class="flex items-center gap-3 px-5 py-4 border-b border-court-700">
        <div class="w-9 h-9 rounded-full bg-court-700 border border-court-600 overflow-hidden shrink-0 flex items-center justify-center text-sm font-bold text-white">
          <img v-if="user.photoURL" :src="user.photoURL" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
          <span v-else>{{ user.displayName?.[0] }}</span>
        </div>
        <div class="min-w-0">
          <div class="text-sm font-bold text-white truncate">{{ user.displayName }}</div>
          <div class="text-[11px] text-slate-500 truncate">{{ user.email ?? user.phoneNumber }}</div>
        </div>
        <button type="button" @click="emit('close')" class="ml-auto text-slate-600 hover:text-slate-400 transition-colors">
          <svg class="w-4 h-4" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <!-- Actions -->
      <div class="p-4 space-y-2">
        <template v-if="!confirmingDelete && !editingName">
          <button
            type="button"
            @click="editingName = true; newName = defaultDisplayName"
            :disabled="busy"
            class="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-court-700 hover:bg-court-600 text-sm text-white font-medium transition-colors disabled:opacity-50"
          >
            <svg class="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 20 20" fill="none">
              <path d="M13 3l4 4-9 9H4v-4l9-9z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Edit display name
          </button>
          <button
            type="button"
            @click="logout"
            :disabled="busy"
            class="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-court-700 hover:bg-court-600 text-sm text-white font-medium transition-colors disabled:opacity-50"
          >
            <svg class="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 20 20" fill="none">
              <path d="M7 3H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3M13 14l3-4-3-4M16 10H7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Sign out
          </button>
          <button
            type="button"
            @click="confirmingDelete = true"
            :disabled="busy"
            class="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-sm text-red-400 font-medium transition-colors disabled:opacity-50"
          >
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="none">
              <path d="M6 2h8M3 5h14M8 8v6M12 8v6M4 5l1 11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1L16 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Delete account
          </button>
        </template>

        <!-- Edit name -->
        <template v-else-if="editingName">
          <p class="text-xs text-zinc-400 mb-3">Choose a new display name.</p>
          <input
            v-model="newName"
            type="text"
            placeholder="Display name"
            maxlength="30"
            autofocus
            class="w-full bg-court-900 border border-court-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-400 transition-colors mb-2"
          />
          <button
            type="button"
            @click="saveName"
            :disabled="busy || !newName.trim()"
            class="w-full py-3 rounded-xl font-bold text-sm bg-emerald-500 hover:bg-emerald-400 text-white transition-colors disabled:opacity-50"
          >Save</button>
          <button type="button" @click="editingName = false" class="w-full text-xs text-zinc-500 hover:text-zinc-400 transition-colors py-1">Cancel</button>
        </template>

        <!-- Re-auth for delete -->
        <template v-else>
          <p class="text-xs text-slate-400 mb-3">Are you sure you want to delete your account? All of your picks will be lost.</p>
          <input
            v-if="user.providerData[0]?.providerId !== 'google.com'"
            v-model="reauthPassword"
            type="password"
            placeholder="Your password"
            class="w-full bg-court-900 border border-court-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-400 transition-colors mb-2"
          />
          <button
            type="button"
            @click="reauthAndDelete"
            :disabled="busy"
            class="w-full py-3 rounded-xl font-bold text-sm bg-red-500 hover:bg-red-400 text-white transition-colors disabled:opacity-50"
          >
            {{ user.providerData[0]?.providerId === 'google.com' ? 'Sign in with Google to confirm' : 'Confirm delete' }}
          </button>
          <button type="button" @click="confirmingDelete = false" class="w-full text-xs text-slate-600 hover:text-slate-400 transition-colors py-1">
            Cancel
          </button>
        </template>

        <p v-if="error" class="text-red-400 text-xs text-center pt-1">{{ error }}</p>
      </div>
    </div>
  </div>
</template>

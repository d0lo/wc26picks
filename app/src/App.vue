<script setup>
import { ref, computed, provide, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase.js'

const router = useRouter()
const loading = ref(true)
const user = ref(null)
const picksLockTime = ref(null)
const hasSubmitted = ref(false)
const dataReady = ref(false)

const picksLocked = computed(() => {
  if (!picksLockTime.value) return false
  const lockMs = picksLockTime.value?.toDate?.().getTime() ?? picksLockTime.value
  return Date.now() >= lockMs
})

provide('user', user)
provide('picksLocked', picksLocked)
provide('picksLockTime', picksLockTime)
provide('hasSubmitted', hasSubmitted)

router.beforeEach((to) => {
  if (!dataReady.value) return
  if (to.path === '/picks' && picksLocked.value && hasSubmitted.value) return '/dashboard'
  if (to.path === '/dashboard' && !hasSubmitted.value) return '/picks'
})

watch(picksLocked, (locked) => {
  if (locked && hasSubmitted.value && router.currentRoute.value.path === '/picks') {
    router.push('/dashboard')
  }
})

// iOS Safari only composites real page content behind the status bar/toolbar
// chrome once scrollY > 0 — at the true top it shows a flat fallback color.
function nudgeScroll() {
  nextTick(() => {
    requestAnimationFrame(() => {
      if (window.scrollY === 0 && document.documentElement.scrollHeight > window.innerHeight) {
        window.scrollTo(0, 1)
      }
    })
  })
}

router.afterEach(nudgeScroll)

onMounted(async () => {
  nudgeScroll()
  // Config is public — fetch before auth so splash page shows lock time immediately
  getDoc(doc(db, 'config', 'public')).then(snap => {
    if (snap.exists()) picksLockTime.value = snap.data().picksLockAt ?? null
  }).catch(() => {})

  onAuthStateChanged(auth, async (u) => {
    if (u) {
      loading.value = true
      dataReady.value = false
    }
    user.value = u
    if (u) {
      try {
        const snap = await getDoc(doc(db, 'submissions', u.uid))
        hasSubmitted.value = snap.exists()
        const isGoogle = u.providerData?.[0]?.providerId === 'google.com'
        const nameConfirmed = localStorage.getItem(`name_confirmed_${u.uid}`) === '1'
        if (!u.displayName) {
          await router.push('/username')
        } else if (isGoogle && !snap.exists() && !nameConfirmed) {
          await router.push('/username')
        } else {
          await router.push(snap.exists() ? '/dashboard' : '/picks')
        }
      } catch {
        await router.push('/picks')
      } finally {
        dataReady.value = true
      }
    } else {
      hasSubmitted.value = false
      dataReady.value = false
      await router.push('/login')
    }
    loading.value = false
  })
})

function onUsernameDone() {
  localStorage.setItem(`name_confirmed_${user.value.uid}`, '1')
  router.push('/picks')
}
</script>

<template>
  <div class="min-h-screen bg-court-950 text-zinc-100 font-sans antialiased">
    <div v-if="loading" class="flex items-center justify-center min-h-screen">
      <div class="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
    </div>
    <RouterView v-else v-slot="{ Component }">
      <component :is="Component" @done="onUsernameDone" />
    </RouterView>
  </div>
</template>

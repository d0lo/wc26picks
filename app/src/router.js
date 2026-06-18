import { createRouter, createMemoryHistory } from 'vue-router'
import { auth } from './firebase.js'
import LoginView from './views/LoginView.vue'
import SetUsernameView from './views/SetUsernameView.vue'
import PicksView from './views/PicksView.vue'
import LeaderboardView from './views/LeaderboardView.vue'
import LiveView from './views/LiveView.vue'

// Resolves once Firebase has determined the initial auth state
let authResolve
const authReady = new Promise(resolve => { authResolve = resolve })
auth.onAuthStateChanged(() => authResolve())

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', redirect: '/leaderboard' },
    { path: '/login', component: LoginView },
    { path: '/username', component: SetUsernameView },
    { path: '/picks', component: PicksView },
    { path: '/leaderboard', component: LeaderboardView },
    { path: '/live', component: LiveView },
  ],
})

router.beforeEach(async (to) => {
  await authReady
  const user = auth.currentUser
  if (!user && to.path !== '/login') return '/login'
  if (user && to.path === '/login') return '/leaderboard'
  if (user && to.path === '/username' && user.displayName) {
    const isGoogle = user.providerData?.[0]?.providerId === 'google.com'
    const nameConfirmed = localStorage.getItem(`name_confirmed_${user.uid}`) === '1'
    if (!isGoogle || nameConfirmed) return '/leaderboard'
  }
})

// Memory history never touches window scroll — without this, a scroll
// position picked up on one page (e.g. an autofocused input pushing the
// page up) carries straight into the next route, leaving content start
// scrolled out from under the sticky header.
router.afterEach(() => {
  window.scrollTo(0, 0)
})

export default router

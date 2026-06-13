import { createRouter, createMemoryHistory } from 'vue-router'
import { auth } from './firebase.js'
import LoginView from './views/LoginView.vue'
import SetUsernameView from './views/SetUsernameView.vue'
import PicksView from './views/PicksView.vue'
import DashboardView from './views/DashboardView.vue'

// Resolves once Firebase has determined the initial auth state
let authResolve
const authReady = new Promise(resolve => { authResolve = resolve })
auth.onAuthStateChanged(() => authResolve())

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', redirect: '/picks' },
    { path: '/login', component: LoginView },
    { path: '/username', component: SetUsernameView },
    { path: '/picks', component: PicksView },
    { path: '/dashboard', component: DashboardView },
  ],
})

router.beforeEach(async (to) => {
  await authReady
  const user = auth.currentUser
  if (!user && to.path !== '/login') return '/login'
  if (user && to.path === '/login') return '/picks'
  if (user && to.path === '/username' && user.displayName) {
    const isGoogle = user.providerData?.[0]?.providerId === 'google.com'
    const nameConfirmed = localStorage.getItem(`name_confirmed_${user.uid}`) === '1'
    if (!isGoogle || nameConfirmed) return '/picks'
  }
})

export default router

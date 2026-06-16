import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import './style.css'

// iOS reports inconsistent values for the dvh unit and -webkit-fill-available
// between Safari browser tabs and standalone "Add to Home Screen" mode. Track
// the real viewport height in JS instead so both modes render full-screen.
function setAppHeight() {
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
}
setAppHeight()
window.addEventListener('resize', setAppHeight)
window.addEventListener('orientationchange', setAppHeight)

createApp(App).use(router).mount('#app')

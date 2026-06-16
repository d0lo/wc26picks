import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import './style.css'

// iOS reports inconsistent values for the dvh unit and -webkit-fill-available
// between Safari browser tabs and standalone "Add to Home Screen" mode. Track
// the real viewport height in JS instead so both modes render full-screen.
// visualViewport is preferred over window.innerHeight because iOS doesn't
// always finish settling the chrome (URL bar / toolbar) before the initial
// innerHeight read, and only window.resize fires (rather than firing
// on its own) once the user scrolls — visualViewport's own resize event
// tracks the chrome settling in real time instead of waiting for that.
function setAppHeight() {
  const height = window.visualViewport?.height ?? window.innerHeight
  document.documentElement.style.setProperty('--app-height', `${height}px`)
}
setAppHeight()
requestAnimationFrame(setAppHeight)
window.addEventListener('resize', setAppHeight)
window.addEventListener('orientationchange', setAppHeight)
window.addEventListener('pageshow', setAppHeight)
window.visualViewport?.addEventListener('resize', setAppHeight)

createApp(App).use(router).mount('#app')

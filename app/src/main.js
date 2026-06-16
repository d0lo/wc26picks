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
  const vv = window.visualViewport
  // The on-screen keyboard shrinks visualViewport.height (but not
  // innerHeight) by a large amount — much more than a chrome show/hide
  // ever does. Skip those so the whole app doesn't squeeze into the
  // sliver above the keyboard; let the keyboard overlap normally instead.
  if (vv && window.innerHeight - vv.height > 100) return
  const height = vv?.height ?? window.innerHeight
  document.documentElement.style.setProperty('--app-height', `${height}px`)
}
setAppHeight()
requestAnimationFrame(setAppHeight)
window.addEventListener('resize', setAppHeight)
window.addEventListener('orientationchange', setAppHeight)
window.addEventListener('pageshow', setAppHeight)
window.visualViewport?.addEventListener('resize', setAppHeight)

// On a cold standalone launch, iOS can report a too-short visualViewport
// height for a brief window before settling the real safe-area geometry,
// with no resize/visualViewport event firing to correct it until the user
// happens to interact. Re-measure a few times early on to catch that settle
// without waiting on an event that may not come.
;[50, 150, 300, 600, 1000].forEach((ms) => setTimeout(setAppHeight, ms))

createApp(App).use(router).mount('#app')

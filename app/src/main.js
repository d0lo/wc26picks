import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import './style.css'

// Standalone "Add to Home Screen" mode has no browser chrome (URL bar /
// toolbar) to show or hide, so the dvh CSS unit is stable there and needs
// no help. Browser-tab mode is where dvh's chrome show/hide quirks are
// real, so only there do we track the real viewport height in JS and
// override dvh via --app-height (see style.css).
const isStandalone =
  window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches

if (!isStandalone) {
  document.documentElement.classList.add('browser-chrome')

  // visualViewport is preferred over window.innerHeight because iOS doesn't
  // always finish settling the chrome (URL bar / toolbar) before the initial
  // innerHeight read, and only window.resize fires (rather than firing
  // on its own) once the user scrolls — visualViewport's own resize event
  // tracks the chrome settling in real time instead of waiting for that.
  const setAppHeight = () => {
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
}

createApp(App).use(router).mount('#app')

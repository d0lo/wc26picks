import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import './style.css'

createApp(App).use(router).mount('#app')

// iOS Safari only composites real page pixels behind its translucent
// status bar / home indicator chrome once the document has a non-zero
// scroll position — a page permanently pinned at scrollY 0 (which
// `overflow: hidden` on <html> otherwise keeps us at) gets flat default
// chrome instead. `body` is 1px taller than `html` (see style.css) so
// there's exactly 1px of real scroll room: briefly allow scrolling,
// nudge to that 1px offset once, then lock it back to non-scrollable so
// the page still can't be dragged/bounced by the user.
requestAnimationFrame(() => {
  document.documentElement.style.overflow = 'scroll'
  window.scrollTo(0, 1)
  requestAnimationFrame(() => {
    document.documentElement.style.overflow = 'hidden'
  })
})

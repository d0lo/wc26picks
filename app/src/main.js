import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import './style.css'

createApp(App).use(router).mount('#app')

// WebKit bug 191872: on cold launch of a standalone iOS web app,
// env(safe-area-inset-*) / dvh metrics are sometimes resolved against a
// stale viewport snapshot and only correct themselves after a scroll
// gesture. Nudging the scroll position (a no-op, since the page doesn't
// scroll) forces WebKit to recompute real viewport metrics immediately
// instead of waiting for the user to touch the screen. No measuring or
// caching — just a reflow trigger.
requestAnimationFrame(() => {
  window.scrollTo(0, 1)
  window.scrollTo(0, 0)
})

import { createApp } from 'vue'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import App from './App.vue'
import router from './router.js'
import './style.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

createApp(App).use(router).use(VueQueryPlugin, { queryClient }).mount('#app')

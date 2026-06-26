import { QueryClient } from '@tanstack/vue-query'

// Shared instance so non-component modules (e.g. router.js guards) can read
// the same cache the app populates, instead of issuing their own Firestore reads.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

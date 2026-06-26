import { QueryClient } from '@tanstack/vue-query'
import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { Timestamp } from 'firebase/firestore'

// Firestore Timestamps serialize to plain { seconds, nanoseconds } via
// toJSON — round-tripping through localStorage loses the prototype (and
// with it .toDate()/.toMillis()) unless we reconstruct it on the way back.
function reviveTimestamps(_key, value) {
  if (value && typeof value === 'object' && Object.keys(value).length === 2
    && typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
    return new Timestamp(value.seconds, value.nanoseconds)
  }
  return value
}

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

// Hydrate from localStorage before any network round-trip, so a cold load
// (e.g. everyone opening the app right at kickoff) paints from cache
// immediately instead of waiting on Firestore — queries still revalidate
// per their own staleTime once mounted.
persistQueryClient({
  queryClient,
  persister: createSyncStoragePersister({
    storage: window.localStorage,
    deserialize: (cached) => JSON.parse(cached, reviveTimestamps),
  }),
  maxAge: 24 * 60 * 60 * 1000,
})

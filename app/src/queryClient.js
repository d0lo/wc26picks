import { QueryClient } from '@tanstack/vue-query'
import { defaultShouldDehydrateQuery } from '@tanstack/query-core'
import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { Timestamp } from 'firebase/firestore'
import { version } from '../package.json'

// Query keys (see queryKeys in queries.js) whose first segment identifies
// data worth painting instantly from localStorage on a cold load. Excludes
// full-collection scans (usersList, picksList) and realtime-only data
// (scores, liveData/scoreboard) — those are cheap to refetch/resubscribe
// and would otherwise bloat localStorage with data most sessions never use.
const PERSISTED_QUERY_KEY_PREFIXES = new Set(['config', 'pick', 'user'])

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
      // Stadium wifi is unreliable — render cached data immediately and
      // retry in the background instead of surfacing an error state when a
      // fetch fails but a perfectly good cached value already exists.
      networkMode: 'offlineFirst',
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
  // Scope the persisted blob to the app version — a deploy that changes a
  // cached document's shape should start from an empty cache, not rehydrate
  // a stale shape into code that expects the new one.
  buster: version,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      defaultShouldDehydrateQuery(query) && PERSISTED_QUERY_KEY_PREFIXES.has(query.queryKey[0]),
  },
})

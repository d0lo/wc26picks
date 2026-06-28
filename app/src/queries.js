import { doc, getDoc, getDocs, onSnapshot, collection, query, orderBy, limit, where, documentId } from 'firebase/firestore'
import { db } from './firebase.js'

const FIVE_MINUTES = 5 * 60 * 1000
// Firestore's `in` operator accepts at most 30 values per query.
const IN_QUERY_CHUNK_SIZE = 30

export const queryKeys = {
  config: ['config', 'public'],
  pick: (uid) => ['pick', uid],
  scores: ['scores'],
  picksList: ['picks', 'list'],
  user: (uid) => ['user', uid],
  usersList: ['users', 'list'],
  usersByIds: (sortedUids) => ['users', 'byIds', sortedUids],
  scoreboard: ['liveData', 'scoreboard'],
  groups: ['groups'],
  wildcards: ['liveData', 'wildcards'],
  matches: ['matches'],
  score: (uid) => ['score', uid],
}

// config/public shape:
//   picksLockAt: Timestamp
//   scoring: {
//     groupExact: { 1: number, 2: number, 3: number, 4: number }  // pts per exact predicted position
//     perfectGroupBonus: number                                   // bonus when all 4 positions are exact
//     wildcard: number                                            // pts per correct 3rd-place-advances pick
//     props: Array<{ key, label, hint, type, points, positionFilter?, maxAge?, allowNone?, category }>
//       // full prop catalog — not just point values, see composables/useScoring.js
//   }
export function configQueryOptions() {
  return {
    queryKey: queryKeys.config,
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'config', 'public'))
      return snap.exists() ? snap.data() : null
    },
    staleTime: FIVE_MINUTES,
  }
}

// Single user's pick doc — same shape whether it's the signed-in user
// (LeaderboardView, PicksView) or another user viewed via PicksModal, so
// they all share one cache entry keyed by uid.
export function pickQueryOptions(uid) {
  return {
    queryKey: queryKeys.pick(uid),
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'picks', uid))
      return snap.exists() ? snap.data() : null
    },
    enabled: !!uid,
    staleTime: FIVE_MINUTES,
  }
}

export function scoresQueryOptions() {
  return {
    queryKey: queryKeys.scores,
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'scores'), orderBy('total', 'desc'), limit(50)))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    staleTime: 0,
    // Override the app-wide refetchOnWindowFocus:false default — scores are
    // the one query meant to stay maximally fresh, so returning to a
    // backgrounded tab should trigger a refetch.
    refetchOnWindowFocus: true,
  }
}

export function picksListQueryOptions() {
  return {
    queryKey: queryKeys.picksList,
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'picks'), orderBy('submittedAt', 'asc')))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    staleTime: FIVE_MINUTES,
  }
}

// Single user profile doc — { displayName, photoURL, isAdmin? }, keyed by uid.
export function userQueryOptions(uid) {
  return {
    queryKey: queryKeys.user(uid),
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'users', uid))
      return snap.exists() ? snap.data() : null
    },
    enabled: !!uid,
    staleTime: FIVE_MINUTES,
  }
}

// All user profiles, keyed by uid. Pulls the whole collection — only use
// where the full roster is actually needed (e.g. AdminView, which must show
// users who haven't submitted picks and so don't appear in any other list).
export function usersListQueryOptions() {
  return {
    queryKey: queryKeys.usersList,
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'users'))
      return Object.fromEntries(snap.docs.map(d => [d.id, d.data()]))
    },
    staleTime: FIVE_MINUTES,
  }
}

// Resolves only the user profiles referenced by a known set of uids — used
// to display names for picks/scores rows (which store only a uid, see
// CLAUDE.md data model) without pulling the entire users collection just to
// look up a handful of names. Chunked by IN_QUERY_CHUNK_SIZE since Firestore
// caps `in` queries at 30 values.
export function usersByIdsQueryOptions(uids) {
  const sortedUids = [...new Set(uids)].sort()
  return {
    queryKey: queryKeys.usersByIds(sortedUids),
    queryFn: async () => {
      const chunks = []
      for (let i = 0; i < sortedUids.length; i += IN_QUERY_CHUNK_SIZE) {
        chunks.push(sortedUids.slice(i, i + IN_QUERY_CHUNK_SIZE))
      }
      const snaps = await Promise.all(
        chunks.map(chunk => getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk))))
      )
      return Object.fromEntries(snaps.flatMap(snap => snap.docs.map(d => [d.id, d.data()])))
    },
    enabled: sortedUids.length > 0,
    staleTime: FIVE_MINUTES,
  }
}

// Patches users/{uid} in every cache entry that might hold it — the single
// profile, the full list, and any users/byIds subset — so a known mutation
// (e.g. a display-name change) shows up everywhere instantly instead of
// invalidating and waiting on a refetch.
export function patchUserInCache(queryClient, uid, updater) {
  queryClient.setQueryData(queryKeys.user(uid), (old) => old && updater(old))
  queryClient.setQueryData(queryKeys.usersList, (old) => old?.[uid] ? { ...old, [uid]: updater(old[uid]) } : old)
  queryClient.setQueriesData({ queryKey: ['users', 'byIds'] }, (old) => old?.[uid] ? { ...old, [uid]: updater(old[uid]) } : old)
}

// Removes users/{uid} from every cache entry above, for account deletion.
export function removeUserFromCache(queryClient, uid) {
  queryClient.removeQueries({ queryKey: queryKeys.user(uid) })
  queryClient.setQueryData(queryKeys.usersList, (old) => {
    if (!old) return old
    const { [uid]: _, ...rest } = old
    return rest
  })
  queryClient.setQueriesData({ queryKey: ['users', 'byIds'] }, (old) => {
    if (!old) return old
    const { [uid]: _, ...rest } = old
    return rest
  })
}

// Removes picks/{uid} from the picks-list cache, for account deletion.
export function removePickFromCache(queryClient, uid) {
  queryClient.removeQueries({ queryKey: queryKeys.pick(uid) })
  queryClient.setQueryData(queryKeys.picksList, (old) => old?.filter(p => p.id !== uid))
}

// liveData/scoreboard is realtime-only — there's no plain getDoc fetch for
// it, it's always populated by startScoreboardListener() below. enabled:
// false keeps useQuery from trying to run this queryFn itself; the active
// query observer still reflects every setQueryData call the listener makes.
export function scoreboardQueryOptions() {
  return {
    queryKey: queryKeys.scoreboard,
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
  }
}

let scoreboardUnsub = null
let scoreboardRefCount = 0

// LiveView and LeaderboardView both need liveData/scoreboard live — refcount
// so they share one Firestore listener instead of opening a second one for
// the same document, and write into the shared cache entry above so either
// (or both) can read it via scoreboardQueryOptions().
export function startScoreboardListener(queryClient) {
  scoreboardRefCount++
  if (scoreboardUnsub) return
  scoreboardUnsub = onSnapshot(doc(db, 'liveData/scoreboard'), (snap) => {
    queryClient.setQueryData(queryKeys.scoreboard, snap.data() ?? null)
  })
}

export function stopScoreboardListener() {
  scoreboardRefCount = Math.max(0, scoreboardRefCount - 1)
  if (scoreboardRefCount === 0) {
    scoreboardUnsub?.()
    scoreboardUnsub = null
  }
}

// All 12 groups' actual standings, keyed by letter — written by the
// onScoreboardWrite/processMatchUpdate trigger as each group-stage match
// completes. A letter is absent from the result until its group's first
// match finishes (see groups/{letter} in firebase/functions/index.js).
export function groupsQueryOptions() {
  return {
    queryKey: queryKeys.groups,
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'groups'))
      return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  }
}

// liveData/wildcards.advancingLetters — the current "best 3rd-place" ranking,
// recomputed by onGroupsWrite after every group-stage match. null until the
// first group-stage match completes.
export function wildcardsQueryOptions() {
  return {
    queryKey: queryKeys.wildcards,
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'liveData/wildcards'))
      return snap.exists() ? snap.data() : null
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  }
}

// Every matches/{eventId} doc — used to derive best-effort "current state"
// prop leaderboards (see lib/propLeaders.js) from scoringPlays/competitors
// already replicated client-side, without a dedicated Cloud Function.
export function matchesQueryOptions() {
  return {
    queryKey: queryKeys.matches,
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'matches'))
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  }
}

// One user's scores/{uid} doc — breakdown.groups/wildcards/props, used to
// show points-earned/possible alongside their picks. null until their first
// group-stage match completes (see onMatchComplete).
export function scoreQueryOptions(uid) {
  return {
    queryKey: queryKeys.score(uid),
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'scores', uid))
      return snap.exists() ? snap.data() : null
    },
    enabled: !!uid,
    staleTime: 0,
    refetchOnWindowFocus: true,
  }
}

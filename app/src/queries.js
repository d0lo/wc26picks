import { doc, getDoc, getDocs, collection, query, orderBy, limit } from 'firebase/firestore'
import { db } from './firebase.js'

const FIVE_MINUTES = 5 * 60 * 1000

export const queryKeys = {
  config: ['config', 'public'],
  pick: (uid) => ['pick', uid],
  scores: ['scores'],
  picksList: ['picks', 'list'],
  user: (uid) => ['user', uid],
  usersList: ['users', 'list'],
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

// All user profiles, keyed by uid — used to resolve display names for
// picks/scores rows, which store only a uid (see CLAUDE.md data model).
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

// Firestore glue for writing scores/{uid} — kept out of scoring.js so that
// module stays pure/Firestore-free and unit-testable in isolation.
import { FieldValue } from 'firebase-admin/firestore'
import { sumGroupPoints, sumKnockoutPoints } from './scoring.js'

// Reads scores/{uid}.breakdown, lets patchFn produce the next breakdown,
// recomputes total, and writes both back in one transaction. Shared by every
// trigger that updates a single pick's score so each only supplies what it
// changed (one group's points, the wildcard total, or a full rescore)
// instead of repeating the same read-merge-write-transaction boilerplate.
// The transaction (not a plain batch) is what protects against the
// lost-update race between two trigger invocations racing on the same
// scores/{uid} doc — keep it even though most callers patch a single field.
export async function applyBreakdownPatch(db, uid, patchFn) {
  const scoreRef = db.doc(`scores/${uid}`)
  await db.runTransaction(async (tx) => {
    const existing = (await tx.get(scoreRef)).data()?.breakdown ?? {}
    const breakdown = patchFn(existing)
    const total =
      (sumGroupPoints(breakdown.groups) ?? 0) +
      (breakdown.wildcards ?? 0) +
      (breakdown.props ?? 0) +
      (sumKnockoutPoints(breakdown.knockout) ?? 0)
    tx.set(scoreRef, { uid, breakdown, total, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  })
}

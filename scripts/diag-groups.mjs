/** diag-groups.mjs — read-only: inspects what groupStageComplete depends on. */
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID ?? 'wc26picks' })
const db = getFirestore()

const all = (await db.collection('matches').get()).docs.map((d) => ({ id: d.id, ...d.data() }))
const byRound = {}
for (const m of all) { const k = m.round ?? 'null'; byRound[k] = (byRound[k] || 0) + 1 }
const groupM = all.filter((m) => m.round == null)
console.log('matches total:', all.length)
console.log('byRound:', JSON.stringify(byRound))
console.log('round==null count:', groupM.length, '| all post:', groupM.every((m) => m.status?.state === 'post'))
console.log('round==null NOT post:', groupM.filter((m) => m.status?.state !== 'post').map((m) => `${m.id}:${m.status?.state}`))
console.log('knockout docs:', all.filter((m) => m.round).map((m) => `${m.id} ${m.round}/${m.slot} ${m.status?.state}`))
const m = all.find((x) => x.id === '760486')
console.log('760486:', m ? { round: m.round, slot: m.slot, state: m.status?.state } : 'MISSING')
process.exit(0)

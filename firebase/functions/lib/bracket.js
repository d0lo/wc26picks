// Static knockout-bracket structure — duplicated from app/src/bracket.js
// rather than imported, for the same reason lib/teams.js duplicates
// app/src/data.js's TEAM_ID: Firebase only deploys the contents of this
// functions/ directory, so a relative import reaching into app/src would
// resolve locally but break at deploy time. Keep this file's exports in
// sync with app/src/bracket.js if the bracket structure ever changes.
//
// R32_SLOTS (the 16 actual Round of 32 matchups) and ADJACENCY (which two
// slots in round N feed a given slot in round N+1) are both derived straight
// from ESPN's own fetched schedule, not from outside research:
//   - R32_SLOTS: the 16 real round-of-32 events from GET /scoreboard, sorted
//     by kickoff date (matches the standard FIFA convention of numbering
//     matches in chronological order, and slot 1 here corresponds to FIFA's
//     official Match 73).
//   - ADJACENCY: ESPN's own R16/QF/SF/Final placeholder events spell the
//     tree out directly in their names before the prerequisite round
//     finishes, e.g. event 760502 is literally named
//     "Round of 32 3 Winner at Round of 32 1 Winner" — so r16[0] = [1, 3].
// Slot numbers below are 1-indexed to match those ESPN placeholder labels
// exactly; code should subtract 1 when indexing into a 0-indexed picks array.

export const ROUNDS = ['r32', 'r16', 'qf', 'sf', 'final']

export const ROUND_LABELS = {
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarterfinals',
  sf: 'Semifinals',
  third: '3rd Place Match',
  final: 'Final',
}

// ESPN event.season.slug value for each round — used to bucket fetched
// schedule events by round without re-deriving it from dates/names.
export const ROUND_SLUGS = {
  r32: 'round-of-32',
  r16: 'round-of-16',
  qf: 'quarterfinals',
  sf: 'semifinals',
  third: '3rd-place-match',
  final: 'final',
}

export const ROUND_SIZE = { r32: 16, r16: 8, qf: 4, sf: 2, third: 1, final: 1 }

// Points awarded per correct pick in that round. The 3rd place match isn't
// part of the "pick winners until a champion is crowned" chain, so it's
// never picked and never scored — left out of this map deliberately.
export const ROUND_POINTS = { r32: 1, r16: 2, qf: 4, sf: 8, final: 16 }

export const PREV_ROUND = { r16: 'r32', qf: 'r16', sf: 'qf', final: 'sf', third: 'sf' }

// ADJACENCY[round] is an array of [prevSlotA, prevSlotB] pairs (1-indexed,
// matching ESPN's own placeholder slot numbering) — round's slot i is fed by
// the winners of prevRound's slots ADJACENCY[round][i].
export const ADJACENCY = {
  r16: [[1, 3], [2, 5], [4, 6], [7, 8], [11, 12], [9, 10], [14, 16], [13, 15]],
  qf: [[1, 2], [5, 6], [3, 4], [7, 8]],
  sf: [[1, 2], [3, 4]],
  final: [[1, 2]],
  // 3rd place match takes the *losers* of semifinal slots 1 and 2, not winners.
  third: [[1, 2]],
}

// The 16 real Round of 32 matchups, as fetched — slot N (1-indexed) holds
// the two team UUIDs playing in that match (same UUIDs as app/src/data.js
// TEAM_ID — see file header for why they're duplicated rather than
// imported). teams[0]/teams[1] order has no bracket meaning (home/away
// only).
export const R32_SLOTS = [
  ['a001c536-5f32-5d3a-9524-2625768e2db6', 'ea507eb3-7ffc-5b89-b218-bdf77bdd5e3c'], // South Africa, Canada
  ['319d6076-6a6a-5de2-a3a0-c004534ab271', '9c073283-4bbc-575b-b242-66457f265171'], // Brazil, Japan
  ['2bc26ff0-285f-51c7-ac24-a244cac0487d', '8e4c3b45-cafc-5069-bdc0-562e13759c81'], // Germany, Paraguay
  ['2c0a9766-b0f5-5b58-9d69-8ed41d0afdc6', '811717a9-ae7c-5bb7-859b-7bd0d31b73c1'], // Netherlands, Morocco
  ['ee803858-f87b-56bc-afc2-7bc22d73f88f', '6cdeac8c-2994-55e1-9556-f1a2446719bf'], // Ivory Coast, Norway
  ['ef3a7683-fdc9-55a7-8f5a-1f398ba8b19b', 'c7638393-de0e-5c81-aef6-d1cc2a235bc9'], // France, Sweden
  ['be3833eb-87cb-5da0-8e4c-443001ea513e', '4b9e6a2c-652a-56c5-860f-b43f62532a0f'], // Mexico, Ecuador
  ['ad64f1bc-05fd-579a-bf7e-beca095ff819', '56043e4c-8bbf-5ba3-9d1f-625b1ff387c0'], // England, DR Congo
  ['88b74173-8fb4-51bb-ba20-6b5c50b48b53', '28f75665-e569-5933-8d38-60deaef402be'], // Belgium, Senegal
  ['192ff8ed-ee5e-5883-972c-a73457bb6561', 'a11c97bc-6795-51b2-b4b8-2d92badc03bf'], // USA, Bosnia-Herzegovina
  ['004750b3-7e2c-5a82-9617-04005d6c0455', 'a115a8a6-917c-515c-a150-c4f32a8f0d64'], // Spain, Austria
  ['ffb9f9ca-2c16-531f-bd23-3bba0e2ae1d6', '798acc19-b47f-5cb6-a6d1-012c452c0327'], // Portugal, Croatia
  ['234a158e-477a-5c2c-a04c-041cc7d1f1cf', 'a6d30860-04c6-5fac-aa75-2834082dc9b3'], // Switzerland, Algeria
  ['880e95ce-8947-5198-b3de-84631abbe3cb', '60a0170d-d508-5f72-8d71-556a5417a9f9'], // Australia, Egypt
  ['08642760-194d-5d1b-a074-811c298d6822', '4317f28f-c456-5b80-854d-a7689f61996b'], // Argentina, Cape Verde
  ['8e00af10-e1f2-5f2f-afec-ad9705d38dc1', '1548ac7b-f676-5ba7-9722-e8cb63599f86'], // Colombia, Ghana
]

// ESPN event id → { round, slot } for all 32 real knockout-stage events.
// Event ids are stable for the life of the tournament — ESPN keeps the same
// id for a fixture as it goes from a "Round of 32 N Winner" placeholder to
// real teams to a final score, so this map (built once from our own fetched
// schedule, sorted by kickoff date per slot) is a direct, unambiguous way to
// assign every match to its round/slot without re-deriving it from team
// names or re-matching against ADJACENCY at runtime.
export const EVENT_SLOT_MAP = {
  760486: { round: 'r32', slot: 1 },
  760487: { round: 'r32', slot: 2 },
  760489: { round: 'r32', slot: 3 },
  760488: { round: 'r32', slot: 4 },
  760490: { round: 'r32', slot: 5 },
  760492: { round: 'r32', slot: 6 },
  760491: { round: 'r32', slot: 7 },
  760495: { round: 'r32', slot: 8 },
  760493: { round: 'r32', slot: 9 },
  760494: { round: 'r32', slot: 10 },
  760497: { round: 'r32', slot: 11 },
  760496: { round: 'r32', slot: 12 },
  760498: { round: 'r32', slot: 13 },
  760499: { round: 'r32', slot: 14 },
  760500: { round: 'r32', slot: 15 },
  760501: { round: 'r32', slot: 16 },
  760502: { round: 'r16', slot: 1 },
  760503: { round: 'r16', slot: 2 },
  760504: { round: 'r16', slot: 3 },
  760505: { round: 'r16', slot: 4 },
  760506: { round: 'r16', slot: 5 },
  760507: { round: 'r16', slot: 6 },
  760509: { round: 'r16', slot: 7 },
  760508: { round: 'r16', slot: 8 },
  760510: { round: 'qf', slot: 1 },
  760511: { round: 'qf', slot: 2 },
  760512: { round: 'qf', slot: 3 },
  760513: { round: 'qf', slot: 4 },
  760514: { round: 'sf', slot: 1 },
  760515: { round: 'sf', slot: 2 },
  760516: { round: 'third', slot: 1 },
  760517: { round: 'final', slot: 1 },
}

// Given the previous round's winners (array of team UUIDs, 0-indexed by
// slot — prevWinners[i] is the winner of prevRound slot i+1), returns this
// round's matchups as an array of [teamA, teamB] pairs, 0-indexed by slot.
export function deriveRoundMatchups(round, prevWinners) {
  const pairs = ADJACENCY[round]
  if (!pairs) return round === 'r32' ? R32_SLOTS : []
  return pairs.map(([a, b]) => [prevWinners?.[a - 1] ?? null, prevWinners?.[b - 1] ?? null])
}

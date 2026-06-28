// Static knockout-bracket structure — duplicated from app/src/bracket.js
// rather than imported, for the same reason lib/teams.js duplicates
// app/src/data.js's TEAM_ID: Firebase only deploys the contents of this
// functions/ directory, so a relative import reaching into app/src would
// resolve locally but break at deploy time. Keep this file's exports in
// sync with app/src/bracket.js if the bracket structure ever changes.
//
// Slot N (1-indexed) within a round equals the official FIFA match number
// minus a fixed per-round offset (R32: match-72, R16: match-88, QF:
// match-96, SF: match-100) — confirmed against FIFA's official bracket
// (https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage) cross-
// checked with ESPN's own placeholder event names. This is NOT chronological
// kickoff order; see app/src/bracket.js header for the full explanation.
// Slot numbers below are 1-indexed; code should subtract 1 when indexing
// into a 0-indexed picks array.

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

// The 16 real Round of 32 matchups — slot N (1-indexed) = FIFA Match (72+N).
// UUIDs same as app/src/data.js TEAM_ID (duplicated; see file header).
// teams[0]/teams[1] order has no bracket meaning (home/away only).
export const R32_SLOTS = [
  ['a001c536-5f32-5d3a-9524-2625768e2db6', 'ea507eb3-7ffc-5b89-b218-bdf77bdd5e3c'], // slot 1  = Match 73: South Africa, Canada
  ['2bc26ff0-285f-51c7-ac24-a244cac0487d', '8e4c3b45-cafc-5069-bdc0-562e13759c81'], // slot 2  = Match 74: Germany, Paraguay
  ['2c0a9766-b0f5-5b58-9d69-8ed41d0afdc6', '811717a9-ae7c-5bb7-859b-7bd0d31b73c1'], // slot 3  = Match 75: Netherlands, Morocco
  ['319d6076-6a6a-5de2-a3a0-c004534ab271', '9c073283-4bbc-575b-b242-66457f265171'], // slot 4  = Match 76: Brazil, Japan
  ['ef3a7683-fdc9-55a7-8f5a-1f398ba8b19b', 'c7638393-de0e-5c81-aef6-d1cc2a235bc9'], // slot 5  = Match 77: France, Sweden
  ['ee803858-f87b-56bc-afc2-7bc22d73f88f', '6cdeac8c-2994-55e1-9556-f1a2446719bf'], // slot 6  = Match 78: Ivory Coast, Norway
  ['be3833eb-87cb-5da0-8e4c-443001ea513e', '4b9e6a2c-652a-56c5-860f-b43f62532a0f'], // slot 7  = Match 79: Mexico, Ecuador
  ['ad64f1bc-05fd-579a-bf7e-beca095ff819', '56043e4c-8bbf-5ba3-9d1f-625b1ff387c0'], // slot 8  = Match 80: England, DR Congo
  ['192ff8ed-ee5e-5883-972c-a73457bb6561', 'a11c97bc-6795-51b2-b4b8-2d92badc03bf'], // slot 9  = Match 81: USA, Bosnia-Herzegovina
  ['88b74173-8fb4-51bb-ba20-6b5c50b48b53', '28f75665-e569-5933-8d38-60deaef402be'], // slot 10 = Match 82: Belgium, Senegal
  ['ffb9f9ca-2c16-531f-bd23-3bba0e2ae1d6', '798acc19-b47f-5cb6-a6d1-012c452c0327'], // slot 11 = Match 83: Portugal, Croatia
  ['004750b3-7e2c-5a82-9617-04005d6c0455', 'a115a8a6-917c-515c-a150-c4f32a8f0d64'], // slot 12 = Match 84: Spain, Austria
  ['234a158e-477a-5c2c-a04c-041cc7d1f1cf', 'a6d30860-04c6-5fac-aa75-2834082dc9b3'], // slot 13 = Match 85: Switzerland, Algeria
  ['08642760-194d-5d1b-a074-811c298d6822', '4317f28f-c456-5b80-854d-a7689f61996b'], // slot 14 = Match 86: Argentina, Cape Verde
  ['8e00af10-e1f2-5f2f-afec-ad9705d38dc1', '1548ac7b-f676-5ba7-9722-e8cb63599f86'], // slot 15 = Match 87: Colombia, Ghana
  ['880e95ce-8947-5198-b3de-84631abbe3cb', '60a0170d-d508-5f72-8d71-556a5417a9f9'], // slot 16 = Match 88: Australia, Egypt
]

// ESPN event id → { round, slot } for all 32 real knockout-stage events.
// Slot = official FIFA match number minus per-round offset (see file header).
export const EVENT_SLOT_MAP = {
  // R32: slot = match - 72
  760486: { round: 'r32', slot: 1 },   // Match 73: South Africa vs Canada
  760489: { round: 'r32', slot: 2 },   // Match 74: Germany vs Paraguay
  760488: { round: 'r32', slot: 3 },   // Match 75: Netherlands vs Morocco
  760487: { round: 'r32', slot: 4 },   // Match 76: Brazil vs Japan
  760492: { round: 'r32', slot: 5 },   // Match 77: France vs Sweden
  760490: { round: 'r32', slot: 6 },   // Match 78: Ivory Coast vs Norway
  760491: { round: 'r32', slot: 7 },   // Match 79: Mexico vs Ecuador
  760495: { round: 'r32', slot: 8 },   // Match 80: England vs DR Congo
  760494: { round: 'r32', slot: 9 },   // Match 81: USA vs Bosnia-Herzegovina
  760493: { round: 'r32', slot: 10 },  // Match 82: Belgium vs Senegal
  760496: { round: 'r32', slot: 11 },  // Match 83: Portugal vs Croatia
  760497: { round: 'r32', slot: 12 },  // Match 84: Spain vs Austria
  760498: { round: 'r32', slot: 13 },  // Match 85: Switzerland vs Algeria
  760500: { round: 'r32', slot: 14 },  // Match 86: Argentina vs Cape Verde
  760501: { round: 'r32', slot: 15 },  // Match 87: Colombia vs Ghana
  760499: { round: 'r32', slot: 16 },  // Match 88: Australia vs Egypt
  // R16: slot = match - 88
  760503: { round: 'r16', slot: 1 },   // Match 89: W74 vs W77
  760502: { round: 'r16', slot: 2 },   // Match 90: W73 vs W75
  760504: { round: 'r16', slot: 3 },   // Match 91: W76 vs W78
  760505: { round: 'r16', slot: 4 },   // Match 92: W79 vs W80
  760506: { round: 'r16', slot: 5 },   // Match 93: W83 vs W84
  760507: { round: 'r16', slot: 6 },   // Match 94: W81 vs W82
  760509: { round: 'r16', slot: 7 },   // Match 95: W86 vs W88
  760508: { round: 'r16', slot: 8 },   // Match 96: W85 vs W87
  // QF: slot = match - 96
  760510: { round: 'qf', slot: 1 },    // Match 97: W89 vs W90
  760511: { round: 'qf', slot: 2 },    // Match 98: W93 vs W94
  760512: { round: 'qf', slot: 3 },    // Match 99: W91 vs W92
  760513: { round: 'qf', slot: 4 },    // Match 100: W95 vs W96
  // SF: slot = match - 100
  760514: { round: 'sf', slot: 1 },    // Match 101: W97 vs W98
  760515: { round: 'sf', slot: 2 },    // Match 102: W99 vs W100
  760516: { round: 'third', slot: 1 }, // Match 103: L101 vs L102
  760517: { round: 'final', slot: 1 }, // Match 104: W101 vs W102
}

// Given the previous round's winners (array of team UUIDs, 0-indexed by
// slot — prevWinners[i] is the winner of prevRound slot i+1), returns this
// round's matchups as an array of [teamA, teamB] pairs, 0-indexed by slot.
export function deriveRoundMatchups(round, prevWinners) {
  const pairs = ADJACENCY[round]
  if (!pairs) return round === 'r32' ? R32_SLOTS : []
  return pairs.map(([a, b]) => [prevWinners?.[a - 1] ?? null, prevWinners?.[b - 1] ?? null])
}

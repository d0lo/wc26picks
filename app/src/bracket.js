// Static knockout-bracket structure for the 2026 World Cup (48-team format,
// single Round of 32 play-in before the familiar 16-team knockout tree).
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
import { TEAM_ID } from './data.js'

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
// the two team UUIDs playing in that match. teams[0]/teams[1] order has no
// bracket meaning (home/away only); pick UI should just show "winner of".
export const R32_SLOTS = [
  [TEAM_ID['South Africa'], TEAM_ID.Canada],
  [TEAM_ID.Brazil, TEAM_ID.Japan],
  [TEAM_ID.Germany, TEAM_ID.Paraguay],
  [TEAM_ID.Netherlands, TEAM_ID.Morocco],
  [TEAM_ID['Ivory Coast'], TEAM_ID.Norway],
  [TEAM_ID.France, TEAM_ID.Sweden],
  [TEAM_ID.Mexico, TEAM_ID.Ecuador],
  [TEAM_ID.England, TEAM_ID['DR Congo']],
  [TEAM_ID.Belgium, TEAM_ID.Senegal],
  [TEAM_ID.USA, TEAM_ID['Bosnia-Herzegovina']],
  [TEAM_ID.Spain, TEAM_ID.Austria],
  [TEAM_ID.Portugal, TEAM_ID.Croatia],
  [TEAM_ID.Switzerland, TEAM_ID.Algeria],
  [TEAM_ID.Australia, TEAM_ID.Egypt],
  [TEAM_ID.Argentina, TEAM_ID['Cape Verde']],
  [TEAM_ID.Colombia, TEAM_ID.Ghana],
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
// A slot whose feeder winner isn't decided yet comes back as
// [null-ish, null-ish] (undefined) rather than throwing, so the UI can
// render "TBD" until both feeder matches finish.
export function deriveRoundMatchups(round, prevWinners) {
  const pairs = ADJACENCY[round]
  if (!pairs) return round === 'r32' ? R32_SLOTS : []
  return pairs.map(([a, b]) => [prevWinners?.[a - 1] ?? null, prevWinners?.[b - 1] ?? null])
}

// True once every slot in `picks[round]` has a non-null team UUID picked.
export function isRoundPickComplete(round, picks) {
  const slots = picks?.[round]
  return Array.isArray(slots) && slots.length === ROUND_SIZE[round] && slots.every(Boolean)
}

// True once every round through `final` has a complete set of picks —
// i.e. the user has picked a champion.
export function isBracketPickComplete(picks) {
  return ROUNDS.every((round) => isRoundPickComplete(round, picks))
}

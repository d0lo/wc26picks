// Static knockout-bracket structure for the 2026 World Cup (48-team format,
// single Round of 32 play-in before the familiar 16-team knockout tree).
//
// Slot N (1-indexed) within a round equals the official FIFA match number
// minus a fixed per-round offset (R32: match-72, R16: match-88, QF:
// match-96, SF: match-100) — confirmed against FIFA's official bracket
// (https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage) cross-
// checked with ESPN's own placeholder event names, e.g. event 760502 is
// named "Round of 32 1 Winner vs Round of 32 3 Winner" and is officially
// Match 90 = Winner Match 73 vs Winner Match 75, confirming relative-N =
// match-72. This is NOT chronological kickoff order: two R32 matches can
// (and do) kick off out of official-number order — e.g. Match 76
// (Brazil-Japan) kicks off before Match 74 (Germany-Paraguay) — so an
// earlier version of R32_SLOTS/EVENT_SLOT_MAP, built by sorting kickoffs
// chronologically, silently misassigned slots and routed R32 winners into
// the wrong Round of 16 matchup. ADJACENCY was unaffected by that bug (it's
// built straight from ESPN's relative-N labels, already match-number-based);
// only the R32_SLOTS/EVENT_SLOT_MAP slot assignment needed fixing.
// Slot numbers below are 1-indexed; code should subtract 1 when indexing
// into a 0-indexed picks array.
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

// The 16 real Round of 32 matchups — slot N (1-indexed) = FIFA Match (72+N).
// teams[0]/teams[1] order has no bracket meaning (home/away only).
export const R32_SLOTS = [
  [TEAM_ID['South Africa'], TEAM_ID.Canada],        // slot 1  = Match 73
  [TEAM_ID.Germany, TEAM_ID.Paraguay],              // slot 2  = Match 74
  [TEAM_ID.Netherlands, TEAM_ID.Morocco],           // slot 3  = Match 75
  [TEAM_ID.Brazil, TEAM_ID.Japan],                  // slot 4  = Match 76
  [TEAM_ID.France, TEAM_ID.Sweden],                 // slot 5  = Match 77
  [TEAM_ID['Ivory Coast'], TEAM_ID.Norway],         // slot 6  = Match 78
  [TEAM_ID.Mexico, TEAM_ID.Ecuador],                // slot 7  = Match 79
  [TEAM_ID.England, TEAM_ID['DR Congo']],           // slot 8  = Match 80
  [TEAM_ID.USA, TEAM_ID['Bosnia-Herzegovina']],     // slot 9  = Match 81
  [TEAM_ID.Belgium, TEAM_ID.Senegal],               // slot 10 = Match 82
  [TEAM_ID.Portugal, TEAM_ID.Croatia],              // slot 11 = Match 83
  [TEAM_ID.Spain, TEAM_ID.Austria],                 // slot 12 = Match 84
  [TEAM_ID.Switzerland, TEAM_ID.Algeria],           // slot 13 = Match 85
  [TEAM_ID.Argentina, TEAM_ID['Cape Verde']],       // slot 14 = Match 86
  [TEAM_ID.Colombia, TEAM_ID.Ghana],                // slot 15 = Match 87
  [TEAM_ID.Australia, TEAM_ID.Egypt],               // slot 16 = Match 88
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

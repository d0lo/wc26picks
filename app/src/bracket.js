// Static knockout-bracket structure for the 2026 World Cup (48-team format,
// single Round of 32 play-in before the familiar 16-team knockout tree).
//
// Slot N (1-indexed) follows the official FIFA bracket's visual top-to-bottom
// ordering, confirmed against the Wikipedia bracket view for the 2026 World
// Cup (https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage).
// This is neither chronological kickoff order nor sequential FIFA match
// number order — e.g. slot 1 is Match 74 (Germany/Paraguay, Jun 29) and
// slot 3 is Match 73 (South Africa/Canada, Jun 28), because Germany appears
// above South Africa in the visual bracket. Using visual bracket order means
// ADJACENCY is perfectly sequential: adjacent slot pairs always feed the
// same next-round matchup ([1,2]→r16 slot1, [3,4]→r16 slot2, etc.), which
// is the natural way to reason about a bracket and what the UI renders.
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

// ADJACENCY[round] is an array of [prevSlotA, prevSlotB] pairs (1-indexed).
// Round's slot i is fed by the winners of prevRound slots ADJACENCY[round][i].
// With visual-bracket slot ordering, adjacent pairs are always sequential.
export const ADJACENCY = {
  r16: [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16]],
  qf:  [[1, 2], [3, 4], [5, 6], [7, 8]],
  sf:  [[1, 2], [3, 4]],
  final: [[1, 2]],
  // 3rd place match takes the *losers* of semifinal slots 1 and 2, not winners.
  third: [[1, 2]],
}

// The 16 real Round of 32 matchups in visual bracket order (top to bottom).
// teams[0]/teams[1] order has no bracket meaning (home/away only).
export const R32_SLOTS = [
  [TEAM_ID.Germany, TEAM_ID.Paraguay],              // slot 1  = Match 74
  [TEAM_ID.France, TEAM_ID.Sweden],                 // slot 2  = Match 77
  [TEAM_ID['South Africa'], TEAM_ID.Canada],        // slot 3  = Match 73
  [TEAM_ID.Netherlands, TEAM_ID.Morocco],           // slot 4  = Match 75
  [TEAM_ID.Portugal, TEAM_ID.Croatia],              // slot 5  = Match 83
  [TEAM_ID.Spain, TEAM_ID.Austria],                 // slot 6  = Match 84
  [TEAM_ID.USA, TEAM_ID['Bosnia-Herzegovina']],     // slot 7  = Match 81
  [TEAM_ID.Belgium, TEAM_ID.Senegal],               // slot 8  = Match 82
  [TEAM_ID.Brazil, TEAM_ID.Japan],                  // slot 9  = Match 76
  [TEAM_ID['Ivory Coast'], TEAM_ID.Norway],         // slot 10 = Match 78
  [TEAM_ID.Mexico, TEAM_ID.Ecuador],                // slot 11 = Match 79
  [TEAM_ID.England, TEAM_ID['DR Congo']],           // slot 12 = Match 80
  [TEAM_ID.Argentina, TEAM_ID['Cape Verde']],       // slot 13 = Match 86
  [TEAM_ID.Australia, TEAM_ID.Egypt],               // slot 14 = Match 88
  [TEAM_ID.Switzerland, TEAM_ID.Algeria],           // slot 15 = Match 85
  [TEAM_ID.Colombia, TEAM_ID.Ghana],                // slot 16 = Match 87
]

// ESPN event id → { round, slot } for all 32 real knockout-stage events.
// Slot = visual bracket position (top to bottom); see file header.
export const EVENT_SLOT_MAP = {
  // R32 (visual bracket order, top to bottom)
  760489: { round: 'r32', slot: 1 },   // Match 74:  Germany vs Paraguay
  760492: { round: 'r32', slot: 2 },   // Match 77:  France vs Sweden
  760486: { round: 'r32', slot: 3 },   // Match 73:  South Africa vs Canada
  760488: { round: 'r32', slot: 4 },   // Match 75:  Netherlands vs Morocco
  760496: { round: 'r32', slot: 5 },   // Match 83:  Portugal vs Croatia
  760497: { round: 'r32', slot: 6 },   // Match 84:  Spain vs Austria
  760494: { round: 'r32', slot: 7 },   // Match 81:  USA vs Bosnia-Herzegovina
  760493: { round: 'r32', slot: 8 },   // Match 82:  Belgium vs Senegal
  760487: { round: 'r32', slot: 9 },   // Match 76:  Brazil vs Japan
  760490: { round: 'r32', slot: 10 },  // Match 78:  Ivory Coast vs Norway
  760491: { round: 'r32', slot: 11 },  // Match 79:  Mexico vs Ecuador
  760495: { round: 'r32', slot: 12 },  // Match 80:  England vs DR Congo
  760500: { round: 'r32', slot: 13 },  // Match 86:  Argentina vs Cape Verde
  760499: { round: 'r32', slot: 14 },  // Match 88:  Australia vs Egypt
  760498: { round: 'r32', slot: 15 },  // Match 85:  Switzerland vs Algeria
  760501: { round: 'r32', slot: 16 },  // Match 87:  Colombia vs Ghana
  // R16 (visual bracket order — upper half before lower half)
  760503: { round: 'r16', slot: 1 },   // Match 89:  W74 vs W77  → QF slot 1
  760502: { round: 'r16', slot: 2 },   // Match 90:  W73 vs W75  → QF slot 1
  760506: { round: 'r16', slot: 3 },   // Match 93:  W83 vs W84  → QF slot 2
  760507: { round: 'r16', slot: 4 },   // Match 94:  W81 vs W82  → QF slot 2
  760504: { round: 'r16', slot: 5 },   // Match 91:  W76 vs W78  → QF slot 3
  760505: { round: 'r16', slot: 6 },   // Match 92:  W79 vs W80  → QF slot 3
  760509: { round: 'r16', slot: 7 },   // Match 95:  W86 vs W88  → QF slot 4
  760508: { round: 'r16', slot: 8 },   // Match 96:  W85 vs W87  → QF slot 4
  // QF (visual bracket order = match number order)
  760510: { round: 'qf', slot: 1 },    // Match 97:  W89 vs W90
  760511: { round: 'qf', slot: 2 },    // Match 98:  W93 vs W94
  760512: { round: 'qf', slot: 3 },    // Match 99:  W91 vs W92
  760513: { round: 'qf', slot: 4 },    // Match 100: W95 vs W96
  // SF
  760514: { round: 'sf', slot: 1 },    // Match 101: W97 vs W98
  760515: { round: 'sf', slot: 2 },    // Match 102: W99 vs W100
  760516: { round: 'third', slot: 1 }, // Match 103: L101 vs L102
  760517: { round: 'final', slot: 1 }, // Match 104: W101 vs W102
}

// Official 2026 World Cup knockout schedule, keyed by FIFA match number
// (73–104). These date/venue assignments are fixed by FIFA regardless of
// which teams advance, so the picker can show kickoff date/time and venue
// before any live `matches/*` doc exists (live ESPN data overrides this when
// present). `date` is the kickoff in UTC (ISO); the UI formats it to ET.
// `venue` is the host city. Source: Wikipedia 2026 WC knockout stage schedule.
export const MATCH_SCHEDULE = {
  73:  { date: '2026-06-28T19:00:00Z', venue: 'Inglewood' },
  74:  { date: '2026-06-29T20:30:00Z', venue: 'Foxborough' },
  75:  { date: '2026-06-30T01:00:00Z', venue: 'Monterrey' },
  76:  { date: '2026-06-29T17:00:00Z', venue: 'Houston' },
  77:  { date: '2026-06-30T21:00:00Z', venue: 'East Rutherford' },
  78:  { date: '2026-06-30T17:00:00Z', venue: 'Arlington' },
  79:  { date: '2026-07-01T01:00:00Z', venue: 'Mexico City' },
  80:  { date: '2026-07-01T16:00:00Z', venue: 'Atlanta' },
  81:  { date: '2026-07-02T00:00:00Z', venue: 'Santa Clara' },
  82:  { date: '2026-07-01T20:00:00Z', venue: 'Seattle' },
  83:  { date: '2026-07-02T23:00:00Z', venue: 'Toronto' },
  84:  { date: '2026-07-02T19:00:00Z', venue: 'Inglewood' },
  85:  { date: '2026-07-03T03:00:00Z', venue: 'Vancouver' },
  86:  { date: '2026-07-03T22:00:00Z', venue: 'Miami Gardens' },
  87:  { date: '2026-07-04T01:30:00Z', venue: 'Kansas City' },
  88:  { date: '2026-07-03T18:00:00Z', venue: 'Arlington' },
  89:  { date: '2026-07-04T21:00:00Z', venue: 'Philadelphia' },
  90:  { date: '2026-07-04T17:00:00Z', venue: 'Houston' },
  91:  { date: '2026-07-05T20:00:00Z', venue: 'East Rutherford' },
  92:  { date: '2026-07-06T00:00:00Z', venue: 'Mexico City' },
  93:  { date: '2026-07-06T19:00:00Z', venue: 'Arlington' },
  94:  { date: '2026-07-07T00:00:00Z', venue: 'Seattle' },
  95:  { date: '2026-07-07T16:00:00Z', venue: 'Atlanta' },
  96:  { date: '2026-07-07T20:00:00Z', venue: 'Vancouver' },
  97:  { date: '2026-07-09T20:00:00Z', venue: 'Foxborough' },
  98:  { date: '2026-07-10T19:00:00Z', venue: 'Inglewood' },
  99:  { date: '2026-07-11T21:00:00Z', venue: 'Miami Gardens' },
  100: { date: '2026-07-12T01:00:00Z', venue: 'Kansas City' },
  101: { date: '2026-07-14T19:00:00Z', venue: 'Arlington' },
  102: { date: '2026-07-15T19:00:00Z', venue: 'Atlanta' },
  103: { date: '2026-07-18T21:00:00Z', venue: 'Miami Gardens' },
  104: { date: '2026-07-19T19:00:00Z', venue: 'East Rutherford' },
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

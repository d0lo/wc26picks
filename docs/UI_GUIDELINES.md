# WC26 Picks — UI Readability Playbook

A concrete, mechanical playbook for making every screen readable and consistent.
Written for an implementing agent: apply these rules to **any component you
touch**. Every rule is grounded in this codebase's existing tokens (Tailwind +
the `court-*` palette) so it can be applied and verified directly — no taste
required.

> The reference example of "done right" is the **Score Splits** card
> (`app/src/components/ScoreSplitsCard.vue`): an aligned grid, one focal number,
> color used only to signal a result. When in doubt, match it.

---

## Rule 0 — The one question

Every card/section exists to answer exactly **one** question. Before adding any
element, ask: *does this help answer that question faster?* If not, cut it or
de-emphasize it. (Concrete example: a fixtures/results list answers "what was
the result, and when" — a FIFA rank does not serve that, so it was removed from
that list even though ranks belong on leaderboards.)

## Rule 1 — Align everything to a grid

Any list whose rows share fields (scores, counts, dates, ranks) **must** use CSS
grid with shared column tracks so those fields line up vertically down the list.
Never build comparison rows from independent flex + `ml-auto` — the columns
drift row to row and the list becomes unscannable.

- "A vs B" row pattern: `grid-template-columns: auto auto auto minmax(0,1fr) auto`
  with the **left** entity `justify-self-end` (right-aligned against a centered
  metric) and the **right** entity left-aligned and allowed to truncate.
- Right-align numeric columns.
- Put `tabular-nums` on every number that sits in a column or animates, so
  digits don't jitter or misalign.

## Rule 2 — Reuse the type scale; never invent sizes

The app has a fixed scale. Reuse it exactly; do not add new sizes/weights ad hoc.

| Role | Classes |
|---|---|
| Section label (above a card) | `text-[10px] font-black tracking-[0.2em] uppercase text-zinc-400` |
| Card title / row label | `text-[11px] text-zinc-400` |
| Primary entity name | `text-[11px] text-white font-bold` |
| Secondary / meta (rank, date, sub-stat) | `text-[9px]`–`text-[10px] text-zinc-500` |
| One focal number per card | `text-3xl font-black tabular-nums` |

## Rule 3 — Color means something

- `emerald-400` = good / correct / hit / active. Use it **only** to signal that.
- `amber-400` = caution / podium-gold / provisional ("*Unofficial").
  `red-400` = error / negative.
- Everything neutral stays in the zinc scale: `text-white` (primary),
  `text-zinc-400` (labels), `text-zinc-500` (meta), `text-zinc-600` (faint
  marks, the `/` in a fraction, dividers).
- Never color an element for variety. Same kind of data → same color.

## Rule 4 — One focal element per card

Each card has exactly one thing the eye lands on first (a big number, a result).
Make it large + bold + white/emerald; render everything else smaller and in the
zinc scale. Two elements must never compete for "first look."

## Rule 5 — De-emphasize by dimming, not by shrinking to death

Secondary info is dimmed via color (`text-zinc-500`), not by shrinking below
legibility. Body floor is `text-[11px]`; meta floor is `text-[9px]`.

## Rule 6 — The card shell is fixed

All cards use: `bg-court-800 border border-court-700 rounded-2xl px-4 py-3`,
sitting under a section label (Rule 2). Consistent spacing: `space-y-3` between a
label and its card, `gap-y-2` between rows, `gap-x-2`–`gap-x-2.5` between
columns. New UI must use this shell so it visibly belongs.

## Rule 7 — Same concept, same treatment

A team is always rendered: **flag → name → (optional) `#rank`**, in that order.
A player is **name (+ team flag)**. Don't invent a second way to render the same
entity in a different card. Reuse the existing render pattern.

## Rule 8 — Truncation & mobile

- The **primary/leftmost** entity never truncates (`whitespace-nowrap`). Only a
  **secondary** entity truncates (`min-w-0 truncate`) when space runs out.
- This is a phone app: design for ~390px wide, `max-w-2xl` centered, respect
  safe-area insets. Nothing may horizontally overflow at that width.

## Rule 9 — Every data view has an explicit empty state

Render `– No data yet` (`text-xs text-zinc-500 italic`) when there's nothing to
show. Never render zero/placeholder rows as if they were real data — e.g. an
entity with `0` of the tracked stat must be filtered out, not listed as a
"leader." (Showing it is both wrong and noise.)

## Rule 10 — Whitespace creates structure

Use spacing, not borders, to group: tight `gap-y-2` within a list, larger
separation between unrelated sections. Avoid heavy dividers; the dark card on
`court-950` background already provides separation.

---

## Applying this (checklist for the implementing agent)

For each component you touch:

1. **State the one question** the view answers; cut elements that don't serve it (Rule 0).
2. **Convert drifting flex lists into an aligned grid**; right-align numbers + `tabular-nums` (Rule 1).
3. **Snap all text to the type scale** (Rule 2); ensure exactly one focal element (Rule 4).
4. **Audit color**: emerald only = good, amber = caution, zinc = neutral; remove decorative color (Rule 3).
5. **Verify** the primary entity never truncates and nothing overflows at 390px (Rule 8).
6. **Confirm an explicit empty state** exists and zero-value rows are filtered (Rule 9).
7. **Build** (`cd app && npm run build`) and eyeball the result against `ScoreSplitsCard.vue` for consistency.

Scope rule: only change presentation. Do not alter data logic, scoring, or
Firestore shape while applying these — readability work is layout/markup only.

import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

// Drives the snap-to-round behaviour for the horizontally-scrolling knockout
// bracket. The round whose column is centred in the viewport becomes the
// "focused" round: the parent collapses its container height down to that
// round's natural (compact) content height and squeezes that round's match
// rows together (flex-grow 1 → 0), so the focused round has no empty vertical
// space, while the other rounds keep their fanned-out bracket spacing.
//
// DOM contract (set by the consuming template):
//   - the scroll element is bound to `scrollRef`
//   - each round column carries `data-round-col="<index into rounds[]>"`
//   - one representative match row carries `data-row-probe` (any round) so we
//     can measure a single row's height analytically
//
// rounds:    ordered array of round keys actually rendered as snap columns
// roundSize: map of round key → number of matches in that round
export function useBracketFocus(rounds, roundSize) {
  const scrollRef = ref(null)
  const activeIdx = ref(0)
  const rowH = ref(96)            // measured height of one match row (incl. padding)
  const HEADER_H = 24             // round-label header (h-6)

  const activeRound = computed(() => rounds[activeIdx.value])

  function heightFor(round) {
    return HEADER_H + (roundSize[round] ?? 1) * rowH.value
  }

  const containerHeight = computed(() => `${heightFor(activeRound.value)}px`)

  function isActive(round) {
    return activeRound.value === round
  }

  let measured = false
  function measure() {
    const probe = scrollRef.value?.querySelector('[data-row-probe]')
    const h = probe?.offsetHeight
    if (h && h > 0) {
      rowH.value = h
      measured = true
    }
  }

  let raf = 0
  function updateActive() {
    const el = scrollRef.value
    if (!el) return
    if (!measured) measure()   // mounted-while-hidden fallback: retry on interaction
    const center = el.scrollLeft + el.clientWidth / 2
    let best = activeIdx.value
    let bestDist = Infinity
    el.querySelectorAll('[data-round-col]').forEach((col) => {
      const colCenter = col.offsetLeft + col.offsetWidth / 2
      const dist = Math.abs(colCenter - center)
      if (dist < bestDist) {
        bestDist = dist
        best = Number(col.dataset.roundCol)
      }
    })
    activeIdx.value = best
  }

  function onScroll() {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      updateActive()
    })
  }

  function onResize() {
    measure()
    updateActive()
  }

  onMounted(async () => {
    await nextTick()
    measure()
    updateActive()
    scrollRef.value?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
  })

  onBeforeUnmount(() => {
    scrollRef.value?.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onResize)
    if (raf) cancelAnimationFrame(raf)
  })

  return { scrollRef, activeRound, isActive, containerHeight, measure }
}

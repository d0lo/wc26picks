import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

// Mobile-only snap-to-round behaviour for the horizontally-scrolling knockout
// bracket. On phones (< sm) each round is a compact column and the scroll snaps
// to one round at a time; the *leftmost* (snapped) round is the "current" one,
// and the container height collapses to that round's content height so there's
// no empty space below it. On desktop this is inert (height stays auto) and the
// template's CSS keeps the fanned-out conventional bracket.
//
// Everything else (compact vs fanned rows, snap, overflow clipping, hiding the
// connectors, column width) is done with Tailwind `sm:` classes so it needs no
// JS; only the collapsed pixel height has to be measured/computed here.
//
// DOM contract (set by the consuming template):
//   - the scroll element is bound to `scrollRef`
//   - each round column carries `data-round-col="<index into rounds[]>"`
//   - one representative match row carries `data-row-probe`
export function useBracketFocus(rounds, roundSize) {
  const scrollRef = ref(null)
  const activeIdx = ref(0)
  const rowH = ref(96)            // measured height of one match row (incl. padding)
  const isMobile = ref(false)
  const HEADER_H = 24             // round-label header (h-6)

  const activeRound = computed(() => rounds[activeIdx.value])

  function heightFor(round) {
    return HEADER_H + (roundSize[round] ?? 1) * rowH.value
  }

  // Empty string on desktop → no inline height → CSS-driven natural height.
  const containerHeight = computed(() =>
    isMobile.value ? `${heightFor(activeRound.value)}px` : ''
  )

  let measured = false
  function measure() {
    const probe = scrollRef.value?.querySelector('[data-row-probe]')
    const h = probe?.offsetHeight
    if (h && h > 0) {
      rowH.value = h
      measured = true
    }
  }

  // The current round is the one whose left edge sits closest to the scroll
  // container's left content edge (it's snapped to the left).
  function updateActive() {
    const el = scrollRef.value
    if (!el) return
    if (!measured) measure()
    const elRect = el.getBoundingClientRect()
    const anchor = elRect.left + (parseFloat(getComputedStyle(el).paddingLeft) || 0)
    let best = 0
    let bestDist = Infinity
    el.querySelectorAll('[data-round-col]').forEach((col) => {
      const dist = Math.abs(col.getBoundingClientRect().left - anchor)
      if (dist < bestDist) {
        bestDist = dist
        best = Number(col.dataset.roundCol)
      }
    })
    activeIdx.value = best
  }

  let raf = 0
  function onScroll() {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      updateActive()
    })
  }

  let mql
  function syncViewport() {
    isMobile.value = !!mql?.matches
    measure()
    updateActive()
  }

  onMounted(async () => {
    await nextTick()
    mql = window.matchMedia('(max-width: 639.98px)')
    mql.addEventListener('change', syncViewport)
    syncViewport()
    scrollRef.value?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', syncViewport)
  })

  onBeforeUnmount(() => {
    scrollRef.value?.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', syncViewport)
    mql?.removeEventListener('change', syncViewport)
    if (raf) cancelAnimationFrame(raf)
  })

  return { scrollRef, containerHeight }
}

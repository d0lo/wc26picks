import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

// Mobile-only "ESPN-style" bracket focus. The bracket stays fanned out, but the
// round you snap to (the leftmost one) "fans in": its matches squeeze together
// into a dense column, and every round to its right fans out over THAT round's
// height — so children still sit centred between their two parents and the
// connectors line up. As you scroll right, each round in turn becomes the dense
// focused column and the container height collapses to it (no empty space).
//
// On desktop this is inert: focusedIdx is pinned to 0 (Round of 32 dense, all
// later rounds fanned = the full conventional bracket) and the height stays
// auto, driven by the template's flex `items-stretch`.
//
// The template drives the per-round fan with `flex-grow: rIdx > focusedIdx`
// (0 = dense/fanned-in, 1 = fanned-out); this composable only supplies
// focusedIdx + the collapsed pixel height.
//
// DOM contract:
//   - scroll element bound to `scrollRef`
//   - each round column carries `data-round-col="<index>"`
//   - one match row carries `data-row-probe`
export function useBracketFocus(rounds, roundSize) {
  const scrollRef = ref(null)
  const leftmostIdx = ref(0)
  const rowH = ref(96)            // measured height of one match row (incl. padding)
  const isMobile = ref(false)
  const HEADER_H = 24             // round-label header (h-6)

  const focusedIdx = computed(() => (isMobile.value ? leftmostIdx.value : 0))

  function heightFor(i) {
    return HEADER_H + (roundSize[rounds[i]] ?? 1) * rowH.value
  }

  // Empty string on desktop → no inline height → flex items-stretch decides it.
  const containerHeight = computed(() =>
    isMobile.value ? `${heightFor(focusedIdx.value)}px` : ''
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

  // The focused round is the one whose left edge sits closest to the scroll
  // container's left content edge (snapped to the left).
  function updateLeftmost() {
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
    leftmostIdx.value = best
  }

  let raf = 0
  function onScroll() {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      updateLeftmost()
    })
  }

  let mql
  function syncViewport() {
    isMobile.value = !!mql?.matches
    measure()
    updateLeftmost()
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

  return { scrollRef, focusedIdx, containerHeight }
}

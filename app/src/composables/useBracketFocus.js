import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

// Mobile-only "ESPN-style" bracket pager.
//
// On phones the bracket is NOT a native scroller — native momentum scroll
// overshoots/skips rounds (scroll-snap-stop isn't honoured on iOS). Instead the
// inner track is translated horizontally by touch directly: one swipe = exactly
// one round, no inertia to carry past it. The snapped (leftmost) round "fans
// in" (dense) while every round to its right fans out over its height, so
// children stay centred between their parents and the connectors line up. The
// container height collapses to the focused round (no empty space).
//
// On desktop this is inert: the track has no transform, the outer element is a
// normal overflow-x-auto scroller, focus is pinned to Round of 32, and the
// height is auto (flex items-stretch) → the full conventional fanned bracket.
//
// Template contract:
//   - outer element bound to `scrollRef` (gets pointer handlers + height)
//   - inner flex track bound to `trackRef` (gets `trackStyle` transform)
//   - each round column carries `data-round-col="<index>"`
//   - one match row carries `data-row-probe`
export function useBracketFocus(rounds, roundSize) {
  const scrollRef = ref(null)
  const trackRef = ref(null)
  const index = ref(0)
  const dragDelta = ref(0)
  const dragging = ref(false)
  const rowH = ref(96)
  const offsets = ref([])         // left offset (px) of each round column within the track
  const isMobile = ref(false)
  const HEADER_H = 24
  const lastIdx = rounds.length - 1

  const focusedIdx = computed(() => (isMobile.value ? index.value : 0))

  function heightFor(i) {
    return HEADER_H + (roundSize[rounds[i]] ?? 1) * rowH.value
  }

  const containerHeight = computed(() =>
    isMobile.value ? `${heightFor(focusedIdx.value)}px` : ''
  )

  const trackStyle = computed(() => {
    if (!isMobile.value) return {}
    const base = offsets.value[index.value] ?? 0
    return {
      transform: `translateX(${-base + dragDelta.value}px)`,
      transition: dragging.value ? 'none' : 'transform 300ms ease-out',
    }
  })

  function measure() {
    const probe = scrollRef.value?.querySelector('[data-row-probe]')
    const h = probe?.offsetHeight
    if (h && h > 0) rowH.value = h
    const track = trackRef.value
    if (track) {
      offsets.value = [...track.querySelectorAll('[data-round-col]')].map((c) => c.offsetLeft)
    }
  }

  // ── Touch/pointer drag (mobile only) ───────────────────────────────────────
  let startX = null
  let startY = null
  let axis = null        // 'x' = we own it, 'y' = let the page scroll vertically
  let basis = 0          // index at gesture start

  function onPointerDown(e) {
    if (!isMobile.value) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    startX = e.clientX
    startY = e.clientY
    axis = null
    basis = index.value
  }

  function onPointerMove(e) {
    if (startX == null) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (axis == null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (axis === 'x') dragging.value = true
    }
    if (axis !== 'x') return
    let d = dx
    // Rubber-band at the ends so you can't drag into blank space.
    if ((basis === 0 && d > 0) || (basis === lastIdx && d < 0)) d *= 0.3
    dragDelta.value = d
  }

  function endDrag(e) {
    if (startX == null) return
    if (axis === 'x') {
      const dx = (e?.clientX ?? startX) - startX
      const w = scrollRef.value?.clientWidth || 1
      const threshold = Math.min(64, w * 0.15)
      if (dx <= -threshold) index.value = Math.min(lastIdx, basis + 1)
      else if (dx >= threshold) index.value = Math.max(0, basis - 1)
    }
    dragDelta.value = 0
    dragging.value = false
    startX = null
    startY = null
    axis = null
  }

  let mql
  function syncViewport() {
    isMobile.value = !!mql?.matches
    measure()
  }

  onMounted(async () => {
    await nextTick()
    mql = window.matchMedia('(max-width: 639.98px)')
    mql.addEventListener('change', syncViewport)
    syncViewport()
    const el = scrollRef.value
    el?.addEventListener('pointerdown', onPointerDown, { passive: true })
    el?.addEventListener('pointermove', onPointerMove, { passive: true })
    el?.addEventListener('pointerup', endDrag, { passive: true })
    el?.addEventListener('pointercancel', endDrag, { passive: true })
    window.addEventListener('resize', syncViewport)
  })

  onBeforeUnmount(() => {
    const el = scrollRef.value
    el?.removeEventListener('pointerdown', onPointerDown)
    el?.removeEventListener('pointermove', onPointerMove)
    el?.removeEventListener('pointerup', endDrag)
    el?.removeEventListener('pointercancel', endDrag)
    window.removeEventListener('resize', syncViewport)
    mql?.removeEventListener('change', syncViewport)
  })

  return { scrollRef, trackRef, focusedIdx, containerHeight, trackStyle }
}

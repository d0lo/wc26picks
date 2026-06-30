import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'

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
export function useBracketFocus(rounds, roundSize, options = {}) {
  const { wholePageSwipe = false } = options
  const scrollRef = ref(null)
  const trackRef = ref(null)
  const index = ref(0)
  const dragDelta = ref(0)
  const dragging = ref(false)
  const rowH = ref(96)
  const colH = ref(0)             // measured natural height of the focused round column
  const offsets = ref([])         // left offset (px) of each round column within the track
  const isMobile = ref(false)
  const HEADER_H = 24
  const lastIdx = rounds.length - 1

  const focusedIdx = computed(() => (isMobile.value ? index.value : 0))

  // Fallback estimate used only until the focused column has been measured.
  function heightFor(i) {
    return HEADER_H + (roundSize[rounds[i]] ?? 1) * rowH.value
  }

  const containerHeight = computed(() =>
    isMobile.value ? `${colH.value || heightFor(focusedIdx.value)}px` : ''
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
    if (!track) return
    offsets.value = [...track.querySelectorAll('[data-round-col]')].map((c) => c.offsetLeft)
    // The container height is driven by the focused (densest) column, whose
    // rows are flexGrow:0 — i.e. natural height regardless of the current
    // container height. Summing its children (header + each match row) instead
    // of multiplying one probed row by the slot count means rows of differing
    // height (a completed match grows a score/points footer) no longer make
    // the column overflow its fixed-height container and clip the bottom
    // matches. Rounds to the right still fan out (flexGrow:1) to fill it.
    const col = track.querySelector(`[data-round-col="${focusedIdx.value}"]`)
    if (col) {
      let total = 0
      for (const child of col.children) total += child.offsetHeight
      if (total > 0) colH.value = total
    }
  }

  // Card heights change after mount as async data (matches/scores) loads and
  // adds footers; re-measure so the container grows to fit rather than clipping.
  let resizeObs = null
  function observeFocusedCol() {
    if (!resizeObs) return
    resizeObs.disconnect()
    const col = trackRef.value?.querySelector(`[data-round-col="${focusedIdx.value}"]`)
    if (!col) return
    for (const child of col.children) resizeObs.observe(child)
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
    // Whole-page swipe binds to window only on mobile; re-evaluate the binding
    // target whenever the viewport crosses the breakpoint so desktop never has
    // document-level listeners hijacking pointer events.
    rebindGesture()
    measure()
    observeFocusedCol()
  }

  function addGestureListeners(target) {
    if (!target) return
    target.addEventListener('pointerdown', onPointerDown, { passive: true })
    target.addEventListener('pointermove', onPointerMove, { passive: true })
    target.addEventListener('pointerup', endDrag, { passive: true })
    target.addEventListener('pointercancel', endDrag, { passive: true })
  }
  function removeGestureListeners(target) {
    if (!target) return
    target.removeEventListener('pointerdown', onPointerDown)
    target.removeEventListener('pointermove', onPointerMove)
    target.removeEventListener('pointerup', endDrag)
    target.removeEventListener('pointercancel', endDrag)
  }

  // The element/target the gesture listeners are currently bound to, so we can
  // detach exactly what we attached (avoids duplicate or leaked listeners).
  let boundTarget = null

  // Pick the gesture target: when `wholePageSwipe` is on AND we're on mobile,
  // listen at the document (window) level so a swipe can START anywhere on the
  // page and still page the rounds. Otherwise stay element-scoped on scrollRef
  // (default — used on the leaderboard/live so it can't hijack page gestures).
  function desiredTarget() {
    if (wholePageSwipe && isMobile.value) return window
    return scrollRef.value
  }
  function rebindGesture() {
    const next = desiredTarget()
    if (next === boundTarget) return
    removeGestureListeners(boundTarget)
    boundTarget = next
    addGestureListeners(boundTarget)
  }

  // Bind to scrollRef whenever the element appears/changes — not just at mount.
  // The bracket lives behind a loading spinner (v-if), so at onMounted the
  // element often doesn't exist yet; binding in onMounted would silently no-op
  // and the pager would never work until a cached reload.
  watch(scrollRef, async () => {
    // rebindGesture() reads scrollRef.value, so this picks up the new element
    // (in element-scoped mode) or no-ops (in window mode — target unchanged).
    rebindGesture()
    if (!scrollRef.value) return
    // Defer a tick so column/track layout is settled before measuring offsets,
    // and re-sync the viewport (isMobile + height + measure) in case the
    // element appeared after onMounted or across a breakpoint change.
    await nextTick()
    syncViewport()
  }, { immediate: true })

  // When the focused round changes (a swipe), re-measure and re-target the
  // observer — the newly focused column's rows are the ones now setting the
  // container height.
  watch(index, async () => {
    await nextTick()
    measure()
    observeFocusedCol()
    // ── Reconcile vertical scroll when the focused round changes (change 8) ───
    // Each round has a very different height (r32 = 16 rows, final = 1), and the
    // container collapses to the focused round's height. Swiping from a tall
    // round (scrolled far down) to a short one leaves window.scrollY parked
    // below the now-shorter bracket, in blank space.
    //
    // The height transition is animated over 300ms, so the live document height
    // hasn't shrunk yet at nextTick — but measure() above already computed the
    // focused column's *target* height (colH), so clamp scrollY against that.
    // Inert on desktop (pager pinned to Round of 32, height is auto).
    if (!isMobile.value) return
    const el = scrollRef.value
    if (!el) return
    const topInPage = window.scrollY + el.getBoundingClientRect().top
    const bracketBottom = topInPage + (colH.value || heightFor(index.value))
    const maxScroll = Math.max(0, bracketBottom - window.innerHeight)
    if (window.scrollY > maxScroll) window.scrollTo({ top: maxScroll, behavior: 'auto' })
  })

  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(() => measure())
    }
    mql = window.matchMedia('(max-width: 639.98px)')
    mql.addEventListener('change', syncViewport)
    syncViewport()
    observeFocusedCol()
    window.addEventListener('resize', syncViewport)
  })

  onBeforeUnmount(() => {
    removeGestureListeners(boundTarget)
    boundTarget = null
    resizeObs?.disconnect()
    window.removeEventListener('resize', syncViewport)
    mql?.removeEventListener('change', syncViewport)
  })

  return { scrollRef, trackRef, focusedIdx, containerHeight, trackStyle }
}

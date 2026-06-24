import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { GROUPS } from '../data.js'

// Drives the "pinned group rows" sticky overlay shared by the picks-entry
// screen, the leaderboard's My Picks section, and the view-picks modal — it
// tracks which group rows have scrolled up past the anchor (a header) and
// collapses into a horizontal ticker once the wildcards section arrives.
//
// All getter params are functions because the elements/refs they resolve
// (a modal's own header, a PicksSummary instance's exposed refs, etc.) may
// not exist yet when this composable is set up — they're only read lazily,
// inside updatePinned, once mounted.
export function useGroupOverlay({
  getGroupCardRefs,
  getWildcardsSectionEl,
  getAnchorEl,
  getScrollTarget,
  columns = 2,
}) {
  const overlayRef = ref(null)
  const overlayGridRef = ref(null)
  const overlayTickerRef = ref(null)
  const overlayCollapsed = ref(false)
  const overlayContentVisible = ref(false)
  const pinnedGroups = ref([])
  const anchorTop = ref(0)

  let lastExpandedOverlayHeight = 0
  let cachedRowHeight = 40
  let leaveAnimating = false
  let leaveTimer = null

  watch(() => pinnedGroups.value.length, (n, o) => {
    if (n < o) {
      leaveAnimating = true
      clearTimeout(leaveTimer)
      leaveTimer = setTimeout(() => { leaveAnimating = false }, 150)
    }
  })

  function animateOverlayHeight(el, from, to, clearAfter, onDone) {
    el.style.height = from + 'px'
    el.offsetHeight
    el.style.transition = 'height 280ms cubic-bezier(0.4, 0, 0.2, 1)'
    el.style.height = to + 'px'
    el.addEventListener('transitionend', () => {
      el.style.transition = ''
      if (clearAfter) el.style.height = ''
      onDone?.()
    }, { once: true })
  }

  function setOverlayCollapsed(val) {
    if (overlayCollapsed.value === val) return
    const el = overlayRef.value
    if (!el) return
    if (val) {
      const from = el.offsetHeight
      overlayCollapsed.value = true
      animateOverlayHeight(el, from, 36, false, () => { overlayContentVisible.value = true })
    } else {
      overlayContentVisible.value = false
      nextTick(() => {
        const from = parseFloat(el.style.height) || el.offsetHeight
        overlayCollapsed.value = false
        nextTick(() => {
          const to = overlayGridRef.value?.offsetHeight ?? from
          animateOverlayHeight(el, from, to, true, null)
        })
      })
    }
  }

  function updatePinned() {
    const anchorEl = getAnchorEl?.()
    anchorTop.value = anchorEl?.offsetHeight ?? 0
    const headerBottom = anchorEl?.getBoundingClientRect().bottom ?? anchorTop.value

    const refs = getGroupCardRefs?.()
    if (!refs) return

    const rowCount = Math.ceil(pinnedGroups.value.length / columns)
    if (overlayRef.value && rowCount > 0 && !overlayCollapsed.value && !leaveAnimating) {
      const h = overlayRef.value.getBoundingClientRect().height
      if (h > 0) cachedRowHeight = h / rowCount
    }
    const rowHeight = cachedRowHeight

    const newRows = []
    const pairRows = []
    for (let i = 0; i < GROUPS.length; i += columns) pairRows.push(GROUPS.slice(i, i + columns))
    for (const row of pairRows) {
      const el = refs[row[0]]
      if (!el) break
      const r = el.getBoundingClientRect()
      const threshold = headerBottom + (newRows.length + 1) * rowHeight
      if ((r.top + r.bottom) / 2 < threshold) newRows.push(row)
      else break
    }
    pinnedGroups.value = newRows.flat()

    if (!overlayRef.value) return
    const overlayRect = overlayRef.value.getBoundingClientRect()
    if (!overlayCollapsed.value) lastExpandedOverlayHeight = overlayRect.height

    const wcEl = getWildcardsSectionEl?.()
    if (!overlayCollapsed.value && wcEl) {
      const r = wcEl.getBoundingClientRect()
      if ((r.top + r.bottom) / 2 < overlayRect.bottom) setOverlayCollapsed(true)
    }
    if (overlayCollapsed.value && wcEl && lastExpandedOverlayHeight) {
      const expandedBottom = overlayRect.top + lastExpandedOverlayHeight
      if (wcEl.getBoundingClientRect().top > expandedBottom) setOverlayCollapsed(false)
    }
  }

  onMounted(() => {
    const target = getScrollTarget?.() ?? window
    target.addEventListener('scroll', updatePinned, { passive: true })
    window.addEventListener('resize', updatePinned, { passive: true })
    nextTick(updatePinned)
  })
  onUnmounted(() => {
    const target = getScrollTarget?.() ?? window
    target.removeEventListener('scroll', updatePinned)
    window.removeEventListener('resize', updatePinned)
    clearTimeout(leaveTimer)
  })

  return {
    overlayRef, overlayGridRef, overlayTickerRef,
    overlayCollapsed, overlayContentVisible, pinnedGroups, anchorTop,
    updatePinned,
  }
}

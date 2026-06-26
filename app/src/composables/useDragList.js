import { reactive } from 'vue'

// Pointer-based drag-and-drop for reorderable list rows, shared by
// PicksView's group-order rows and AdminView's props-catalog rows so both
// get identical interaction + animation behaviour:
//   - the grabbed row floats, following the pointer directly (via a CSS
//     transform), instead of relying on the browser's native drag ghost
//   - everything else reflows with a smooth FLIP transition, driven by the
//     caller's <TransitionGroup name="drag-list">
//   - releasing outside every registered drop container reverts the row to
//     wherever it started (both position and, if applicable, category)
//
// Pointer Events cover touch out of the box, so callers don't need a
// separate touch-fallback code path.
export function useDragList() {
  const drag = reactive({ id: null, dx: 0, dy: 0, settling: false })

  let pointerId = null
  let startX = 0
  let startY = 0
  let el = null
  let onMove = null
  let onEnd = null
  let containerSelector = null

  function isInsideContainer(clientX, clientY) {
    if (!containerSelector) return true
    if (el) el.style.pointerEvents = 'none'
    const hit = document.elementFromPoint(clientX, clientY)
    if (el) el.style.pointerEvents = ''
    return !!hit?.closest(containerSelector)
  }

  function start(e, id, { onMove: moveCb, onEnd: endCb, containerSelector: selector }) {
    if (drag.id != null) return // a previous drag hasn't finished settling yet
    pointerId = e.pointerId
    el = e.currentTarget
    startX = e.clientX
    startY = e.clientY
    onMove = moveCb
    onEnd = endCb
    containerSelector = selector
    drag.id = id
    drag.dx = 0
    drag.dy = 0
    drag.settling = false
    el.setPointerCapture?.(pointerId)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleEnd)
    window.addEventListener('pointercancel', handleCancel)
  }

  function handleMove(e) {
    if (e.pointerId !== pointerId) return
    drag.dx = e.clientX - startX
    drag.dy = e.clientY - startY
    if (el) el.style.pointerEvents = 'none'
    const hit = document.elementFromPoint(e.clientX, e.clientY)
    if (el) el.style.pointerEvents = ''
    onMove?.(hit, e.clientX, e.clientY)
  }

  function settle(inside) {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleEnd)
    window.removeEventListener('pointercancel', handleCancel)
    onEnd?.(inside)
    // Let the dragged row's own transform transition back to rest (its
    // .drag-settle class, toggled below, supplies the transition) instead
    // of snapping instantly — `id` stays set until that finishes so the
    // template keeps treating it as "the dragged row" during the animation.
    drag.settling = true
    drag.dx = 0
    drag.dy = 0
    el = null
    onMove = null
    onEnd = null
    containerSelector = null
    pointerId = null
  }

  function handleEnd(e) {
    if (e.pointerId !== pointerId) return
    settle(isInsideContainer(e.clientX, e.clientY))
  }

  function handleCancel(e) {
    if (e.pointerId !== pointerId) return
    settle(false)
  }

  function onSettled(id) {
    if (drag.id === id) {
      drag.id = null
      drag.settling = false
    }
  }

  return { drag, start, onSettled }
}

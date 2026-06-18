<script setup>
import { computed, reactive, ref } from 'vue'

const props = defineProps({
  activeTab: String,   // 'picks' | 'leaderboard' | 'live'
  showPicksTab: Boolean,
})
const emit = defineEmits(['navigate'])

const tabs = [
  { id: 'picks', label: 'Picks' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'live', label: 'Live' },
]

const visibleTabs = computed(() => tabs.filter(t => t.id !== 'picks' || props.showPicksTab))
const activeIndex = computed(() => Math.max(0, visibleTabs.value.findIndex(t => t.id === props.activeTab)))

const bouncingTab = ref(null)
let dragMoved = false
function onTap(id) {
  if (dragMoved) { dragMoved = false; return } // trailing click after a real drag — ignore
  bouncingTab.value = id
  emit('navigate', id)
}

const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

// --- Draggable, velocity-morphing indicator ---
// Only the active tab's button visually sits on top of the indicator, so
// that's the only button we arm as a drag handle for it.
const pillEl = ref(null)
const indicatorEl = ref(null)

const dragging = ref(false)
const grabbed = ref(false)
const dragLeft = ref(0)
const indicatorWidthPx = ref(0)
const stretchX = ref(1)
const stretchY = ref(1)
const magnify = reactive({})
const buttonEls = {}
function setButtonRef(id, el) {
  if (el) buttonEls[id] = el
}

let lastX = 0
let lastY = 0
let lastT = 0
let pointerId = null
let smoothVx = 0
let smoothVy = 0

function onGrab(e) {
  const pillRect = pillEl.value.getBoundingClientRect()
  const indRect = indicatorEl.value.getBoundingClientRect()
  indicatorWidthPx.value = indRect.width
  dragLeft.value = indRect.left - pillRect.left
  lastX = e.clientX
  lastY = e.clientY
  lastT = performance.now()
  smoothVx = 0
  smoothVy = 0
  pointerId = e.pointerId
  dragMoved = false
  dragging.value = true
  grabbed.value = true
  e.currentTarget.setPointerCapture(e.pointerId)
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

function onDragMove(e) {
  if (!dragging.value || e.pointerId !== pointerId) return
  const now = performance.now()
  const dt = Math.max(now - lastT, 1)
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true
  // Heavily smoothed (low-pass filtered) velocity — raw per-event deltas
  // are too noisy and made the squash/stretch feel twitchy.
  smoothVx = smoothVx * 0.85 + (Math.abs(dx) / dt) * 0.15
  smoothVy = smoothVy * 0.85 + (Math.abs(dy) / dt) * 0.15
  lastX = e.clientX
  lastY = e.clientY
  lastT = now

  const pillRect = pillEl.value.getBoundingClientRect()
  const maxLeft = pillRect.width - indicatorWidthPx.value - 3
  dragLeft.value = clamp(dragLeft.value + dx, 3, maxLeft)

  // Squash/stretch: fast horizontal motion widens + thins, fast vertical
  // motion heightens + thins — a subtle liquid-blob feel from velocity.
  const sx = clamp(1 + smoothVx * 1.3, 1, 1.35)
  const sy = clamp(1 + smoothVy * 1.3, 1, 1.35)
  stretchX.value = clamp(sx / Math.sqrt(sy), 0.85, 1.35)
  stretchY.value = clamp(sy / Math.sqrt(sx), 0.85, 1.35)

  // Subtly magnify whichever tab icon the pointer is nearest to.
  for (const tab of visibleTabs.value) {
    const btn = buttonEls[tab.id]
    if (!btn) continue
    const r = btn.getBoundingClientRect()
    const center = r.left + r.width / 2
    const dist = Math.abs(e.clientX - center)
    magnify[tab.id] = 1 + Math.max(0, 1 - dist / 110) * 0.12
  }
}

function onDragEnd(e) {
  if (!dragging.value || e.pointerId !== pointerId) return
  dragging.value = false
  grabbed.value = false
  stretchX.value = 1
  stretchY.value = 1
  for (const id of Object.keys(magnify)) delete magnify[id]
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)

  const pillRect = pillEl.value.getBoundingClientRect()
  const tabWidth = pillRect.width / visibleTabs.value.length
  const centerX = dragLeft.value + indicatorWidthPx.value / 2
  const nearestIndex = clamp(Math.floor(centerX / tabWidth), 0, visibleTabs.value.length - 1)
  const newTab = visibleTabs.value[nearestIndex].id
  if (newTab !== props.activeTab) emit('navigate', newTab)
  bouncingTab.value = newTab
}

const indicatorStyle = computed(() => {
  const baseScale = grabbed.value ? 1.12 : 1
  const transform = `scale(${baseScale * stretchX.value}, ${baseScale * stretchY.value})`

  if (dragging.value) {
    return {
      left: `${dragLeft.value}px`,
      width: `${indicatorWidthPx.value}px`,
      transform,
      transition: 'none',
    }
  }
  return {
    width: `calc(${100 / visibleTabs.value.length}% - 6px)`,
    left: `calc(${activeIndex.value * (100 / visibleTabs.value.length)}% + 3px)`,
    transform,
    transition:
      'left 300ms cubic-bezier(0.34, 1.56, 0.64, 1), width 300ms cubic-bezier(0.34, 1.56, 0.64, 1), transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  }
})
</script>

<template>
  <!-- position: sticky, not fixed — iOS Safari excludes fixed elements from
       its edge-to-edge compositing under the translucent bottom toolbar and
       paints a flat black bar there instead. Sticky stays in document flow
       (so Safari composites real content/this nav under the toolbar) while
       the negative margin-top cancels its own flow height, keeping the
       floating-over-content visual. -->
  <nav
    class="sticky bottom-0 z-50 px-4"
    style="
      --tb-pb: max(1rem, calc(0.75rem + env(safe-area-inset-bottom)));
      padding-bottom: var(--tb-pb);
      height: calc(4rem + var(--tb-pb));
      margin-top: calc(-4rem - var(--tb-pb));
    "
  >
    <div
      ref="pillEl"
      class="absolute top-0 inset-x-0 mx-auto flex items-stretch h-16 max-w-[10rem] rounded-full bg-court-900/10 backdrop-blur-sm backdrop-saturate-150 border border-white/20 shadow-2xl shadow-black/50 px-1.5"
    >
      <!-- Sliding active pill -->
      <div ref="indicatorEl" class="absolute top-1.5 bottom-1.5 rounded-full bg-white/10 border border-white/10" :style="indicatorStyle"></div>

      <button
        v-for="tab in visibleTabs"
        :key="tab.id"
        :ref="el => setButtonRef(tab.id, el)"
        type="button"
        @click="onTap(tab.id)"
        @pointerdown="activeTab === tab.id ? onGrab($event) : null"
        class="relative z-10 flex-1 flex items-center justify-center active:scale-90 transition-transform touch-none"
        :class="[activeTab === tab.id ? 'text-emerald-400 cursor-grab active:cursor-grabbing' : 'text-zinc-500']"
        :aria-current="activeTab === tab.id ? 'page' : undefined"
        :aria-label="tab.label"
      >
        <span
          class="flex items-center justify-center transition-transform duration-200"
          :class="{ 'tab-bounce': bouncingTab === tab.id }"
          :style="bouncingTab !== tab.id ? { transform: `scale(${magnify[tab.id] || 1})` } : null"
          @animationend="bouncingTab = null"
        >
          <!-- Picks icon (clipboard) -->
          <svg v-if="tab.id === 'picks'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1z"/>
            <rect x="4" y="4" width="16" height="17" rx="2"/>
            <path d="M9 10h6M9 14h4"/>
          </svg>

          <!-- Leaderboard icon (home) -->
          <svg v-else-if="tab.id === 'leaderboard'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 11l9-8 9 8"/>
            <path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10"/>
            <path d="M9 21v-6h6v6"/>
          </svg>

          <!-- Live icon (stadium) -->
          <svg v-else-if="tab.id === 'live'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <ellipse cx="12" cy="12" rx="9" ry="6"/>
            <rect x="6" y="9" width="12" height="6" rx="2"/>
          </svg>
        </span>
      </button>
    </div>
  </nav>
</template>

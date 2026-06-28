<script setup>
import { computed, reactive, ref } from 'vue'

const props = defineProps({
  activeTab: String,   // 'picks' | 'bracket' | 'leaderboard' | 'live' | 'admin'
  showPicksTab: Boolean,
  showBracketTab: Boolean,
  showAdminTab: Boolean,
})
const emit = defineEmits(['navigate'])

const tabs = [
  { id: 'picks', label: 'Picks' },
  { id: 'bracket', label: 'Bracket' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'live', label: 'Live' },
  { id: 'admin', label: 'Admin' },
]

const visibleTabs = computed(() => tabs
  .filter(t => t.id !== 'picks' || props.showPicksTab)
  .filter(t => t.id !== 'bracket' || props.showBracketTab)
  .filter(t => t.id !== 'admin' || props.showAdminTab)
)
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
  // The pill has 6px of horizontal padding (px-1.5) that the flex buttons
  // sit inset by, but isn't part of a plain 100%-based split — so the
  // indicator's slot has to subtract that 12px before dividing, or outer
  // tabs drift off-center while the middle tab (where the error cancels
  // out by symmetry) looks fine.
  const n = visibleTabs.value.length
  return {
    width: `calc((100% - 12px) / ${n} - 6px)`,
    left: `calc((100% - 12px) / ${n} * ${activeIndex.value} + 9px)`,
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

          <!-- Bracket icon (tournament tree) -->
          <svg v-else-if="tab.id === 'bracket'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 4h4M3 9h4M7 4v5M7 6.5h5M3 15h4M3 20h4M7 15v5M7 17.5h5M12 6.5v11M12 12h6"/>
          </svg>

          <!-- Leaderboard icon (Material Symbols Rounded — home) -->
          <svg v-else-if="tab.id === 'leaderboard'" width="22" height="22" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
            <path d="M240-200h120v-200q0-17 11.5-28.5T400-440h160q17 0 28.5 11.5T600-400v200h120v-360L480-740 240-560v360Zm-80 0v-360q0-19 8.5-36t23.5-28l240-180q21-16 48-16t48 16l240 180q15 11 23.5 28t8.5 36v360q0 33-23.5 56.5T720-120H560q-17 0-28.5-11.5T520-160v-200h-80v200q0 17-11.5 28.5T400-120H240q-33 0-56.5-23.5T160-200Zm320-270Z"/>
          </svg>

          <!-- Live icon (Material Symbols Rounded — stadium) -->
          <svg v-else-if="tab.id === 'live'" width="22" height="22" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
            <path d="M120-712v-96q0-11 9.5-17t19.5-1l95 48q11 5 11 18t-11 18l-95 48q-10 5-19.5-1t-9.5-17Zm600 0v-96q0-11 9.5-17t19.5-1l95 48q11 5 11 18t-11 18l-95 48q-10 5-19.5-1t-9.5-17Zm-280-40v-96q0-11 9.5-17t19.5-1l95 48q11 5 11 18t-11 18l-95 48q-10 5-19.5-1t-9.5-17ZM406-81q-140-8-233-41.5T80-200v-360q0-25 31.5-46.5t85.5-38q54-16.5 127-26t156-9.5q83 0 156 9.5t127 26q54 16.5 85.5 38T880-560v360q0 45-93.5 78T553-81q-14 1-23.5-8.5T520-113v-127h-80v126q0 14-10 24t-24 9Zm74-439q97 0 167.5-11.5T760-558q0-5-76-23.5T480-600q-128 0-204 18.5T200-558q42 15 112.5 26.5T480-520ZM360-166v-74q0-33 23.5-56.5T440-320h80q33 0 56.5 23.5T600-240v74q80-8 131-23.5t69-27.5v-271q-55 22-138 35t-182 13q-99 0-182-13t-138-35v271q18 12 69 27.5T360-166Zm120-161Z"/>
          </svg>

          <!-- Admin icon (Material Symbols Rounded — settings/gear) -->
          <svg v-else-if="tab.id === 'admin'" width="22" height="22" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
            <path d="M444-80q-15 0-26-10t-13-25l-12-93q-17-7-31.5-16T334-244l-87 36q-14 6-29 1.5T194-225l-78-134q-8-13-5-28t16-25l75-57q-2-9-2-17.5v-19q0-8.5 2-17.5l-75-57q-13-10-16-25t5-28l78-134q8-13 23-17.5t29 1.5l87 36q14-11 28.5-20t31.5-16l12-93q2-15 13-25t26-10h72q15 0 26 10t13 25l12 93q17 7 31.5 16t28.5 20l87-36q14-6 29-1.5t23 17.5l78 134q8 13 5 28t-16 25l-75 57q2 9 2 17.5v19q0 8.5-2 17.5l75 57q13 10 16 25t-5 28l-78 134q-8 13-23 17.5t-29-1.5l-87-36q-14 11-28.5 20T639-208l-12 93q-2 15-13 25t-26 10h-72Zm36-260q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Z"/>
          </svg>
        </span>
      </button>
    </div>
  </nav>
</template>

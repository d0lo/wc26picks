<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { pickQueryOptions } from '../queries.js'
import { TEAM_BY_ID } from '../data.js'
import PicksSummary from './PicksSummary.vue'
import GroupOverlayPanel from './GroupOverlayPanel.vue'

const props = defineProps({
  uid: String,
  name: String,
  photoURL: String,
})
const emit = defineEmits(['close'])

const pickQuery = useQuery(computed(() => pickQueryOptions(props.uid)))
const data = computed(() => pickQuery.data.value ?? null)
const loading = computed(() => pickQuery.isLoading.value)

// ── Sticky group overlay (anchored below the sheet's own header, scrolling
// within the sheet rather than the page) ────────────────────────────────
const sheetRef = ref(null)
const modalHeaderRef = ref(null)
const picksSummaryRef = ref(null)

function getGroupCardRefs() {
  return picksSummaryRef.value?.groupCardRefs
}
function getWildcardsSectionEl() {
  return picksSummaryRef.value?.wildcardsSectionRef
}
function getAnchorEl() {
  return modalHeaderRef.value
}
function getScrollTarget() {
  return sheetRef.value
}
function resolveTeamFlag(teamId) {
  return TEAM_BY_ID[teamId]?.flag ?? '🏳️'
}

// Starts false so the sheet paints off-screen, then flips true a frame
// later to trigger the CSS transition into view (a smooth slide-up
// instead of an instant pop-in).
const open = ref(false)
const closing = ref(false)

// Pull-to-dismiss: when the sheet is scrolled to the top and the user
// keeps dragging downward (the gesture that would otherwise do nothing,
// since there's no more content above), follow the finger 1:1, then
// either snap back or finish the close depending on how far they pulled.
const dragOffset = ref(0)
const CLOSE_THRESHOLD = 100
let touchStartY = 0
let dragStartY = 0
let isDraggingToClose = false

function onTouchStart(e) {
  touchStartY = e.touches[0].clientY
  isDraggingToClose = false
}

function onTouchMove(e) {
  const y = e.touches[0].clientY
  if (!isDraggingToClose) {
    if (e.currentTarget.scrollTop <= 0 && y > touchStartY) {
      isDraggingToClose = true
      dragStartY = y
    } else {
      return
    }
  }
  dragOffset.value = Math.max(0, y - dragStartY)
  e.preventDefault()
}

function onTouchEnd() {
  if (!isDraggingToClose) return
  isDraggingToClose = false
  const shouldClose = dragOffset.value > CLOSE_THRESHOLD
  dragOffset.value = 0
  if (shouldClose) requestClose()
}

function onTouchCancel() {
  isDraggingToClose = false
  dragOffset.value = 0
}

// Header drag handle — the header never scrolls, so this works no matter
// where the content below is scrolled to (unlike the pull-to-dismiss
// above, which only engages once scrolled to the top).
let handleDragStartY = 0
let isHandleDragging = false

function onHandleTouchStart(e) {
  handleDragStartY = e.touches[0].clientY
  isHandleDragging = true
  e.stopPropagation()
}

function onHandleTouchMove(e) {
  if (!isHandleDragging) return
  dragOffset.value = Math.max(0, e.touches[0].clientY - handleDragStartY)
  e.preventDefault()
  e.stopPropagation()
}

function onHandleTouchEnd(e) {
  if (!isHandleDragging) return
  isHandleDragging = false
  const shouldClose = dragOffset.value > CLOSE_THRESHOLD
  dragOffset.value = 0
  if (shouldClose) requestClose()
  e.stopPropagation()
}

function onHandleTouchCancel(e) {
  isHandleDragging = false
  dragOffset.value = 0
  e.stopPropagation()
}

// True modal behaviour — the page behind can't scroll while this is open,
// which also stops the sheet's own scroll from rubber-banding into it.
// Locking via <html>'s overflow (not body's position) so body never moves
// and keeps the safe-area padding override in style.css intact — that
// override only holds while body stays the document's actual scroll root.
function lockBodyScroll() {
  document.documentElement.style.overflow = 'hidden'
}
function unlockBodyScroll() {
  document.documentElement.style.overflow = ''
}

onMounted(() => {
  lockBodyScroll()
  requestAnimationFrame(() => { open.value = true })
})

onUnmounted(() => {
  unlockBodyScroll()
})

// Play the close transition before telling the parent to unmount us —
// the parent's v-if would otherwise tear us down instantly.
function requestClose() {
  if (closing.value) return
  closing.value = true
  open.value = false
  setTimeout(() => emit('close'), 300)
}
</script>

<template>
  <div class="fixed inset-0 z-[100]">
    <!-- Glass backdrop lives on an absolute child, not the fixed element
         itself — Safari samples background/backdrop-filter set directly on
         position:fixed elements at the viewport edge to tint its own
         translucent toolbar. Same fix as AppHeader (see 80e673a). -->
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
      :class="open ? 'opacity-100' : 'opacity-0'"
      @click="requestClose"
    ></div>

    <div
      ref="sheetRef"
      class="fixed bottom-0 left-0 right-0 overflow-y-auto overscroll-contain rounded-t-3xl bg-court-900 border-t border-court-700"
      :class="[open ? 'translate-y-0' : 'translate-y-full', dragOffset ? '' : 'transition-transform duration-300']"
      :style="{
        maxHeight: 'calc(90dvh - env(safe-area-inset-top))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
        transform: dragOffset ? `translateY(${dragOffset}px)` : undefined,
      }"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchCancel"
    >

      <!-- Sheet header -->
      <div
        ref="modalHeaderRef"
        class="sticky top-0 z-10 bg-court-900 border-b border-court-700"
        @touchstart="onHandleTouchStart"
        @touchmove="onHandleTouchMove"
        @touchend="onHandleTouchEnd"
        @touchcancel="onHandleTouchCancel"
      >
        <!-- Drag handle -->
        <div class="flex justify-center pt-2 pb-1">
          <div class="w-1/2 h-1 rounded-full bg-court-600"></div>
        </div>
        <div class="px-4 pb-4 flex items-center gap-3">
          <!-- Avatar -->
          <div class="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-court-700">
            <img
              v-if="photoURL"
              :src="photoURL"
              class="w-full h-full object-cover"
              referrerpolicy="no-referrer"
            />
            <span v-else class="text-sm font-bold text-white">{{ name?.[0] ?? '?' }}</span>
          </div>
          <!-- Name -->
          <span class="flex-1 text-sm font-bold text-white truncate">{{ name }}</span>
        </div>
      </div>

      <GroupOverlayPanel
        v-if="data"
        :groups="data.groups"
        :wildcards="data.wildcards"
        :resolve-flag="resolveTeamFlag"
        :get-group-card-refs="getGroupCardRefs"
        :get-wildcards-section-el="getWildcardsSectionEl"
        :get-anchor-el="getAnchorEl"
        :get-scroll-target="getScrollTarget"
        :mobile-only="false"
        :columns="2"
      />

      <!-- Content -->
      <div class="px-4 py-5">
        <!-- Loading -->
        <div v-if="loading" class="flex justify-center py-16">
          <div class="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
        </div>

        <!-- No picks -->
        <div v-else-if="!data" class="py-16 text-center">
          <div class="text-4xl mb-3">📋</div>
          <div class="text-sm font-bold text-white mb-1">No picks submitted</div>
          <div class="text-xs text-zinc-400">This user hasn't made their picks yet.</div>
        </div>

        <!-- Picks summary -->
        <PicksSummary
          v-else
          ref="picksSummaryRef"
          :groups="data.groups"
          :wildcards="data.wildcards"
          :props="data.props"
        />
      </div>

      <!-- Fades the cut edge of scrollable content into the sheet's own
           background, so a mid-list cutoff reads as "scroll for more"
           instead of a flat dead zone at the bottom. -->
      <div class="pointer-events-none sticky bottom-0 inset-x-0 h-10 bg-gradient-to-t from-court-900 to-transparent"></div>

    </div>
  </div>
</template>

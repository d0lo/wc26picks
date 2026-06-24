<script setup>
import { useGroupOverlay } from '../composables/useGroupOverlay.js'

const props = defineProps({
  groups: Object,           // { [groupLetter]: identifier[] } — top 4 per group
  wildcards: Array,         // [groupLetters]
  resolveFlag: Function,    // (identifier) => emoji string
  getGroupCardRefs: Function,      // () => { [groupLetter]: HTMLElement }
  getWildcardsSectionEl: Function, // () => HTMLElement | null
  getAnchorEl: Function,            // () => HTMLElement | null — header to sit below
  getScrollTarget: Function,        // () => HTMLElement | Window — defaults to window
  mobileOnly: { type: Boolean, default: true }, // hide at desktop widths where a side-rail panel takes over instead
})

const {
  overlayRef, overlayGridRef, overlayTickerRef,
  overlayCollapsed, overlayContentVisible, pinnedGroups, anchorTop,
} = useGroupOverlay(props)

function isDimmed(group, i) {
  return (i >= 2 && !props.wildcards?.includes(group)) || i >= 3
}

// Exposed so a parent that also renders its own desktop-only "pinned
// groups" panels (e.g. PicksView's side rails) can read which groups
// this overlay currently considers pinned, without duplicating the
// scroll-tracking logic above.
defineExpose({ pinnedGroups })
</script>

<template>
  <!-- Zero-height sticky anchor — no layout shift; overlay panel is absolute inside it -->
  <div class="sticky z-[60]" :class="mobileOnly ? 'min-[964px]:hidden' : ''" :style="{ top: anchorTop + 'px', height: 0, overflow: 'visible' }">
    <div
      ref="overlayRef"
      v-if="pinnedGroups.length"
      class="absolute top-0 left-0 right-0 px-4 bg-court-950/97 backdrop-blur-md border-b border-court-700/60 overflow-hidden"
    >
      <div class="relative">
        <div ref="overlayGridRef">
          <div
            class="grid grid-cols-2 gap-x-6 w-fit mx-auto transition-opacity duration-200"
            :class="overlayContentVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'"
          >
            <TransitionGroup name="pin" tag="div" class="contents">
              <div
                v-for="group in pinnedGroups" :key="group"
                class="flex items-center gap-2 py-1.5 px-1 border-t border-court-700/30"
              >
                <span class="text-[11px] font-black tracking-[0.18em] text-emerald-500 w-4 shrink-0">{{ group }}</span>
                <div class="flex gap-1 items-center">
                  <span
                    v-for="(item, i) in groups?.[group]" :key="i"
                    class="text-xl leading-none transition-opacity"
                    :class="isDimmed(group, i) ? 'opacity-30' : ''"
                  >{{ resolveFlag(item) }}</span>
                </div>
              </div>
            </TransitionGroup>
          </div>
        </div>
        <div
          ref="overlayTickerRef"
          class="absolute top-0 overflow-hidden transition-opacity duration-200 flex items-center"
          style="height: 36px; left: -1rem; right: -1rem;"
          :class="overlayContentVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'"
        >
          <div class="shelf-ticker flex gap-5 w-max" :style="{ animationDuration: `${pinnedGroups.length * 2.5}s` }">
            <template v-for="pass in 2" :key="pass">
              <div v-for="group in pinnedGroups" :key="`${pass}-${group}`" class="flex items-center gap-1.5 shrink-0">
                <span class="text-[11px] font-black tracking-[0.18em] text-emerald-500">{{ group }}</span>
                <div class="flex gap-0.5 items-center">
                  <span
                    v-for="(item, i) in groups?.[group]" :key="i"
                    class="text-lg leading-none transition-opacity"
                    :class="isDimmed(group, i) ? 'opacity-30' : ''"
                  >{{ resolveFlag(item) }}</span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pin-enter-active { transition: all 0.15s ease-out; }
.pin-leave-active { transition: all 0.1s ease-in; }
.pin-enter-from  { opacity: 0; transform: translateY(-6px); }
.pin-leave-to    { opacity: 0; transform: translateY(-4px); }
.pin-move        { transition: transform 0.15s ease; }
</style>

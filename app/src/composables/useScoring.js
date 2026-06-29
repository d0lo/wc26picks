import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { orderedPropCategories } from '../data.js'
import { configQueryOptions } from '../queries.js'

// Reads config/public.scoring — the full prop catalog plus point values —
// and groups it by category. Shared by every view/component that renders
// props (PicksView, PicksSummary) so the catalog has exactly one reader.
export function useScoring() {
  const configQuery = useQuery(configQueryOptions())
  const scoring = computed(() => configQuery.data.value?.scoring ?? null)
  // Archived props (soft-deleted by the admin editor) are excluded here so
  // they stop appearing for new/edited picks, but the raw doc still has the
  // entry — existing picks/{uid}.props answers keyed by that id are untouched.
  const props = computed(() => (scoring.value?.props ?? []).filter(p => !p.archived))

  // Every prop is a tournament prop now, so all active props go under the
  // single category regardless of any legacy `category` field still stored on
  // older Firestore docs.
  const propsByCategory = computed(() =>
    orderedPropCategories()
      .map(c => ({ ...c, props: props.value }))
      .filter(c => c.props.length)
  )

  const groupExactLabel = computed(() => {
    const g = scoring.value?.groupExact
    return g ? `${g[1]} · ${g[2]} · ${g[3]} · ${g[4]} pts` : '– pts'
  })

  return { scoring, props, propsByCategory, groupExactLabel, isLoading: configQuery.isLoading }
}

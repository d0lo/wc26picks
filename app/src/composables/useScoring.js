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

  // Group props by category. Every prop is a tournament prop now, but a legacy
  // `category` value (e.g. 'group'/'knockout') may still be stored on older
  // Firestore docs — coalesce any unknown category onto the first/default one
  // so each prop lands in exactly one section regardless of how many categories
  // are defined (and nothing silently drops out).
  const propsByCategory = computed(() => {
    const categories = orderedPropCategories()
    const known = new Set(categories.map(c => c.key))
    const fallback = categories[0]?.key
    const categoryOf = p => (known.has(p.category) ? p.category : fallback)
    return categories
      .map(c => ({ ...c, props: props.value.filter(p => categoryOf(p) === c.key) }))
      .filter(c => c.props.length)
  })

  const groupExactLabel = computed(() => {
    const g = scoring.value?.groupExact
    return g ? `${g[1]} · ${g[2]} · ${g[3]} · ${g[4]} pts` : '– pts'
  })

  return { scoring, props, propsByCategory, groupExactLabel, isLoading: configQuery.isLoading }
}

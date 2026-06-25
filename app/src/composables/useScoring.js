import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { PROPS, orderedPropCategories } from '../data.js'
import { configQueryOptions } from '../queries.js'

// Reads config/public.scoring and merges its per-prop point values onto the
// static PROPS list, grouped by category — shared by every view/component
// that renders prop point badges, so the merge logic can't drift out of
// sync between them again.
export function useScoring() {
  const configQuery = useQuery(configQueryOptions())
  const scoring = computed(() => configQuery.data.value?.scoring ?? null)

  const propsByCategory = computed(() =>
    orderedPropCategories()
      .map(c => ({
        ...c,
        props: PROPS.filter(p => p.category === c.key).map(p => ({ ...p, points: scoring.value?.props?.[p.key] ?? null })),
      }))
      .filter(c => c.props.length)
  )

  const groupExactLabel = computed(() => {
    const g = scoring.value?.groupExact
    return g ? `${g[1]} · ${g[2]} · ${g[3]} · ${g[4]} pts` : '– pts'
  })

  return { scoring, propsByCategory, groupExactLabel }
}

import { useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import type { RestaurantTable } from '@shared/types'

export function useTables() {
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('tables')
      .select('*')
      .order('numero')
      .then(({ data }) => {
        setTables(data ?? [])
        setLoading(false)
      })
  }, [])

  return { tables, loading }
}

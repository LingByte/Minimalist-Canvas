import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: async () => {
      const res = await api.get('/api/status')
      return res.data?.data as Record<string, unknown>
    },
    staleTime: 5 * 60 * 1000,
  })
}

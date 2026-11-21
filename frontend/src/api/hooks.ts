import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { Categoria } from '../types'

export function useCategorias() {
  return useQuery({
    queryKey: ['categorias'],
    queryFn: async () => (await api.get<Categoria[]>('/categorias')).data,
  })
}

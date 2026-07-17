import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { catalogApi } from '../../../../api/catalog/catalog.api'
import type { SubscriptionPackage, SubscriptionProgramConfig } from '../../../../api/catalog/catalog.types'
import { queryKeys } from '../../../../api/queryKeys'

export function usePackageList() {
  const qc = useQueryClient()
  const { data: packages = [], isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.packages,
    queryFn: () => catalogApi.getSubscriptionPackages(),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.packages })

  const createMut = useMutation({
    mutationFn: (data: Omit<SubscriptionPackage, 'id'>) => catalogApi.createSubscriptionPackage(data),
    onSuccess: invalidate,
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Omit<SubscriptionPackage, 'id'>> }) =>
      catalogApi.updateSubscriptionPackage(id, data),
    onSuccess: invalidate,
  })
  const deleteMut = useMutation({
    mutationFn: (id: number) => catalogApi.deleteSubscriptionPackage(id),
    onSuccess: invalidate,
  })

  const createPackage = (data: Omit<SubscriptionPackage, 'id'>) => createMut.mutateAsync(data)
  const updatePackage = (id: number, data: Partial<Omit<SubscriptionPackage, 'id'>>) => updateMut.mutateAsync({ id, data })
  const deletePackage = (id: number) => deleteMut.mutateAsync(id)
  // «Вернуть в продажу» — обычный PATCH is_active=true, тот же метод, что и правка.
  const restorePackage = (id: number) => updateMut.mutateAsync({ id, data: { is_active: true } })

  return { packages, isLoading, error, refetch, createPackage, updatePackage, deletePackage, restorePackage }
}

export function useSubscriptionConfig() {
  const qc = useQueryClient()
  const { data: config = null, isLoading } = useQuery<SubscriptionProgramConfig | null>({
    queryKey: queryKeys.subscriptionConfig,
    queryFn: () => catalogApi.getSubscriptionConfig(),
  })

  const updateMut = useMutation({
    mutationFn: (patch: Partial<SubscriptionProgramConfig>) => catalogApi.updateSubscriptionConfig(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.subscriptionConfig }),
  })

  const updateConfig = (patch: Partial<SubscriptionProgramConfig>) => updateMut.mutateAsync(patch)

  return { config, isLoading, updateConfig }
}

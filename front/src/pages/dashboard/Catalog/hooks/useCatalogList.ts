import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studioApi } from '../../../../api/studio/studio.api'
import type { BranchListItem, BranchCreate, BranchUpdate, HallCreate, HallUpdate } from '../../../../api/studio/studio.types'
import { servicesApi } from '../../../../api/studio/services.api'
import type { ServiceRead, ServiceCreate, ServiceUpdate, ServiceWeekSlot } from '../../../../api/studio/services.api'
import type { Service } from '../types'
import { queryKeys } from '../../../../api/queryKeys'

// Бэкенд диктует структуру (ServiceRead); UI-поля вычисляем здесь на лету.
function toUiService(s: ServiceRead): Service {
  return {
    id: s.id,
    name: s.name,
    category: s.category ?? '—',
    type: s.service_type === 'individual' ? 'individual' : 'group',
    duration_min: s.duration_min,
    price: s.price,
    color: s.color ?? '#FCAE91',
    description: s.description ?? '',
    max_clients: s.max_clients ?? undefined,
    bookings_total: s.bookings_count,
    revenue_total: s.revenue_total,
    bookings_last_30d: s.bookings_last_30d,
  }
}

export function useStudioList() {
  const qc = useQueryClient()
  const { data: studios = [], isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.branches,
    queryFn: () => studioApi.getBranches(),
  })

  // Правка филиала меняет и список, и его деталь — инвалидируем оба.
  const invalidateBranch = (branchId: number) => {
    qc.invalidateQueries({ queryKey: queryKeys.branches })
    qc.invalidateQueries({ queryKey: queryKeys.branch(branchId) })
  }

  const createMut = useMutation({
    mutationFn: (data: BranchCreate) => studioApi.createBranch(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.branches }),
  })
  const updateMut = useMutation({
    mutationFn: ({ branchId, data }: { branchId: number; data: BranchUpdate }) => studioApi.updateBranch(branchId, data),
    onSuccess: (_r, { branchId }) => invalidateBranch(branchId),
  })
  const deleteMut = useMutation({
    mutationFn: (branchId: number) => studioApi.deleteBranch(branchId),
    onSuccess: (_r, branchId) => invalidateBranch(branchId),
  })

  // Интерфейс для компонентов прежний: async-функции, кидающие ApiError.
  const createBranch = (data: BranchCreate): Promise<BranchListItem> => createMut.mutateAsync(data)
  const updateBranch = (branchId: number, data: BranchUpdate) => updateMut.mutateAsync({ branchId, data })
  const deleteBranch = (branchId: number) => deleteMut.mutateAsync(branchId)

  return { studios, isLoading, error, refetch, createBranch, updateBranch, deleteBranch }
}

export function useBranchDetail(branchId: number | null) {
  const qc = useQueryClient()
  const { data: branch = null, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.branch(branchId ?? 0),
    queryFn: () => studioApi.getBranch(branchId!),
    enabled: branchId != null,
  })

  // Залы влияют и на деталь филиала, и на счётчик hall_count в списке филиалов.
  const invalidateHall = () => {
    if (branchId != null) qc.invalidateQueries({ queryKey: queryKeys.branch(branchId) })
    qc.invalidateQueries({ queryKey: queryKeys.branches })
  }

  const createMut = useMutation({
    mutationFn: (data: HallCreate) => studioApi.createHall(branchId!, data),
    onSuccess: invalidateHall,
  })
  const updateMut = useMutation({
    mutationFn: ({ hallId, data }: { hallId: number; data: HallUpdate }) => studioApi.updateHall(hallId, data),
    onSuccess: invalidateHall,
  })
  const deleteMut = useMutation({
    mutationFn: (hallId: number) => studioApi.deleteHall(hallId),
    onSuccess: invalidateHall,
  })

  const createHall = (data: HallCreate) => {
    if (branchId == null) return Promise.resolve()
    return createMut.mutateAsync(data)
  }
  const updateHall = (hallId: number, data: HallUpdate) => updateMut.mutateAsync({ hallId, data })
  const deleteHall = (hallId: number) => deleteMut.mutateAsync(hallId)

  return { branch, isLoading, error, refetch, createHall, updateHall, deleteHall }
}

export function useServiceList() {
  const qc = useQueryClient()
  const { data: services = [], isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.services,
    queryFn: () => servicesApi.list(),
    select: (rows) => rows.map(toUiService),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.services })

  const createMut = useMutation({ mutationFn: (data: ServiceCreate) => servicesApi.create(data), onSuccess: invalidate })
  const updateMut = useMutation({
    mutationFn: ({ serviceId, data }: { serviceId: number; data: ServiceUpdate }) => servicesApi.update(serviceId, data),
    onSuccess: invalidate,
  })
  const deleteMut = useMutation({ mutationFn: (serviceId: number) => servicesApi.delete(serviceId), onSuccess: invalidate })

  const createService = (data: ServiceCreate) => createMut.mutateAsync(data)
  const updateService = (serviceId: number, data: ServiceUpdate) => updateMut.mutateAsync({ serviceId, data })
  const deleteService = (serviceId: number) => deleteMut.mutateAsync(serviceId)

  return { services, isLoading, error, refetch, createService, updateService, deleteService }
}

// Реальные занятия услуги на текущей неделе — честная сетка «Расписание», без выдумки.
export function useServiceWeek(serviceId: number | null) {
  const { data: slots = [], isLoading } = useQuery<ServiceWeekSlot[]>({
    queryKey: queryKeys.serviceWeek(serviceId ?? 0),
    queryFn: () => servicesApi.getWeek(serviceId!),
    enabled: serviceId != null,
  })
  return { slots, isLoading }
}
